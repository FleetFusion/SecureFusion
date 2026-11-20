import 'fake-indexeddb/auto';
import { lastValueFrom, toArray } from 'rxjs';

import { bytesToHex } from './verifier/bytes';
import {
  putChannelEntry,
  openScanCache,
  purgeScanCache,
} from './scan-cache';
import {
  TESTNET_ACCOUNT,
  makeAnchorFixture,
  makeRegistry,
  makeUpgradeFixture,
} from './test-fixtures';
import type { VerificationEvent, VerificationResult } from './verifier-types';
import { verifyVideo } from './verify';

const TEST_RIPPLED = 'https://example.invalid/rippled';

async function sha256HexOf(bytes: Uint8Array): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

describe('verifyVideo orchestrator', () => {
  beforeEach(async () => {
    await purgeScanCache(TESTNET_ACCOUNT, TEST_RIPPLED);
  });

  afterEach(async () => {
    await purgeScanCache(TESTNET_ACCOUNT, TEST_RIPPLED);
  });

  it('Tier-1 verified when channel sha matches a cached anchor tx', async () => {
    // Build a deterministic anchor tx whose channels[0].sha256 is the
    // hash of the bytes "abc". Pre-populate the scan cache so the
    // orchestrator skips the scan loop.
    const fileBytes = new Uint8Array([0x61, 0x62, 0x63]);
    const channelSha = await sha256HexOf(fileBytes);
    const fixture = await makeAnchorFixture(channelSha);

    const cache = await openScanCache(TESTNET_ACCOUNT, TEST_RIPPLED);
    await putChannelEntry(cache, channelSha, {
      txHash: fixture.txHash,
      ledgerIndex: 1000,
      bundleHashHex: fixture.bundleHashHex,
    });
    cache.close();

    spyOn(window, 'fetch').and.callFake(async (_url, init) => new Response(JSON.stringify({ result: JSON.parse(init!.body as string).method === 'tx' ? fixture.rippledTx : { transactions: [] } })));

    const file = new File([fileBytes], 'tiny.mp4');
    const events = await lastValueFrom(
      verifyVideo({
        file,
        trustAnchorBundle: {
          xrplAccount: TESTNET_ACCOUNT,
          registry: await makeRegistry(),
        },
        rippledUrl: TEST_RIPPLED,
      }).pipe(toArray()),
    );

    const result = events.find((e) => e.type === 'result') as
      | VerificationResult
      | undefined;
    expect(result).toBeDefined();
    expect(result!.tier1.status).toBe('verified');
    expect(result!.tier2.status).toBe('verified');
    // Tier 3 lands on `not-found` when no SF1.ots upgrade is cached.
    expect(result!.tier3.status).toBe('not-found');
  });


  it('indexes a signed AccountSet anchor used by the production publisher', async () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]);
    const sha = await sha256HexOf(bytes);
    const fixture = await makeAnchorFixture(sha);
    const tx: Record<string, unknown> = { ...fixture.rippledTx, TransactionType: 'AccountSet' };
    delete tx['Destination'];
    spyOn(window, 'fetch').and.callFake(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ result: body.method === 'account_tx'
        ? { transactions: [{ tx, validated: true, ledger_index: 1000 }] }
        : tx }));
    });
    const events = await lastValueFrom(verifyVideo({
      file: new File([bytes], 'evidence.mp4'),
      trustAnchorBundle: { xrplAccount: TESTNET_ACCOUNT, registry: await makeRegistry() },
      rippledUrl: TEST_RIPPLED,
    }).pipe(toArray()));
    const final = events.find(e => e.type === 'result') as VerificationResult;
    expect(final.tier1.status).toBe('verified');
    expect(final.tier2.status).toBe('verified');
  });


  it('rejects a modified manifest in an AccountSet anchor', async () => {
    const bytes = new Uint8Array([0x61, 0x62, 0x63]);
    const sha = await sha256HexOf(bytes);
    const fixture = await makeAnchorFixture(sha);
    const tx: Record<string, unknown> = JSON.parse(JSON.stringify(fixture.rippledTx));
    tx['TransactionType'] = 'AccountSet'; delete tx['Destination'];
    const memos = tx['Memos'] as Array<{ Memo: { MemoData: string } }>;
    const original = fixture.manifest;
    const changed = JSON.stringify({ ...original, vehicleId: 'changed' });
    memos[1].Memo.MemoData = Array.from(new TextEncoder().encode(changed), b => b.toString(16).padStart(2, '0')).join('');
    spyOn(window, 'fetch').and.callFake(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ result: body.method === 'account_tx'
        ? { transactions: [{ tx, validated: true, ledger_index: 1000 }] }
        : tx }));
    });
    const events = await lastValueFrom(verifyVideo({
      file: new File([bytes], 'changed.mp4'),
      trustAnchorBundle: { xrplAccount: TESTNET_ACCOUNT, registry: await makeRegistry() },
      rippledUrl: TEST_RIPPLED,
    }).pipe(toArray()));
    const final = events.find(e => e.type === 'result') as VerificationResult;
    expect(final.tier1.status).toBe('invalid');
    expect(final.tier1.reason).toBe('bundle-hash-mismatch');
    expect(final.tier2.status).toBe('not-applicable');
  });

  it('Tier-1 not-found when no channel match anywhere', async () => {
    spyOn(window, 'fetch').and.callFake(async () =>
      new Response(
        JSON.stringify({
          result: {
            transactions: [],
            marker: undefined,
          },
        }),
      ),
    );

    const file = new File([new Uint8Array([1, 2, 3])], 'x.mp4');
    const result = await lastValueFrom(
      verifyVideo({
        file,
        trustAnchorBundle: {
          xrplAccount: TESTNET_ACCOUNT,
          registry: await makeRegistry(),
        },
        rippledUrl: TEST_RIPPLED,
      }).pipe(toArray()),
    );
    const final = result.find((e) => e.type === 'result') as
      | VerificationResult
      | undefined;
    expect(final).toBeDefined();
    expect(final!.tier1.status).toBe('not-found');
    expect(final!.tier2.status).toBe('not-applicable');
    expect(final!.tier3.status).toBe('not-applicable');
  });

  it('Tier-1 invalid bundle-hash-mismatch when SF1.event was tampered', async () => {
    const fileBytes = new Uint8Array([0xaa]);
    const channelSha = await sha256HexOf(fileBytes);
    const fixture = await makeAnchorFixture(channelSha);

    // Tamper SF1.event memo by swapping its MemoData with junk hex of
    // the same length. The bundle decode still succeeds but the
    // recomputed SHA-256 won't match SF1.bundle.bundleHash.
    const tamperedTx = JSON.parse(JSON.stringify(fixture.rippledTx));
    const eventMemo = (tamperedTx.Memos as Array<{ Memo: { MemoData: string } }>)[1];
    eventMemo.Memo.MemoData = 'AB'.repeat(eventMemo.Memo.MemoData.length / 2);

    const cache = await openScanCache(TESTNET_ACCOUNT, TEST_RIPPLED);
    await putChannelEntry(cache, channelSha, {
      txHash: fixture.txHash,
      ledgerIndex: 1000,
      bundleHashHex: fixture.bundleHashHex,
    });
    cache.close();

    spyOn(window, 'fetch').and.callFake(async () =>
      new Response(JSON.stringify({ result: tamperedTx })),
    );

    const file = new File([fileBytes], 'tampered.mp4');
    const all = await lastValueFrom(
      verifyVideo({
        file,
        trustAnchorBundle: {
          xrplAccount: TESTNET_ACCOUNT,
          registry: await makeRegistry(),
        },
        rippledUrl: TEST_RIPPLED,
      }).pipe(toArray()),
    );
    const final = all.find((e) => e.type === 'result') as
      | VerificationResult
      | undefined;
    expect(final!.tier1.status).toBe('invalid');
    expect(final!.tier1.reason).toBe('bundle-hash-mismatch');
    expect(final!.tier2.status).toBe('not-applicable');
  });

  it('finds a recent video from one live history page without a cached anchor or an old-history crawl', async () => {
    const bytes = new Uint8Array([0x61,0x62,0x63]); const fixture = await makeAnchorFixture(await sha256HexOf(bytes));
    const history: Array<Record<string,unknown>>=[];
    spyOn(window,'fetch').and.callFake(async (_url,init)=>{const body=JSON.parse(init!.body as string);if(body.method==='account_tx'){history.push(body.params[0]);return new Response(JSON.stringify({result:{transactions:[{tx:fixture.rippledTx,validated:true,ledger_index:1000}],marker:{ledger:999}}}));}return new Response(JSON.stringify({result:fixture.rippledTx}));});
    const registry=(await makeRegistry()).map(entry=>({...entry,bitcoinProofMode:'none' as const}));
    const events=await lastValueFrom(verifyVideo({file:new File([bytes],'recent.mp4'),trustAnchorBundle:{xrplAccount:TESTNET_ACCOUNT,registry},rippledUrl:TEST_RIPPLED}).pipe(toArray()));
    const final=events.find(e=>e.type==='result') as VerificationResult;expect(final.tier1.status).toBe('verified');expect(final.tier2.status).toBe('verified');expect(history.length).toBe(1);expect(history[0]['forward']).toBeFalse();
  });

  it('emits hashing progress frames before tier results', async () => {
    spyOn(window, 'fetch').and.callFake(async () =>
      new Response(
        JSON.stringify({
          result: { transactions: [], marker: undefined },
        }),
      ),
    );
    const file = new File([new Uint8Array([1])], 'x.mp4');
    const events = await lastValueFrom(
      verifyVideo({
        file,
        trustAnchorBundle: {
          xrplAccount: TESTNET_ACCOUNT,
          registry: await makeRegistry(),
        },
        rippledUrl: TEST_RIPPLED,
      }).pipe(toArray()),
    );
    const hashingFrames = events.filter(
      (e): e is Extract<VerificationEvent, { kind: 'hashing' }> =>
        e.type === 'progress' && (e as { kind?: unknown }).kind === 'hashing',
    );
    expect(hashingFrames.length).toBeGreaterThan(0);
  });

  it('emits a result event as the last frame', async () => {
    spyOn(window, 'fetch').and.callFake(async () =>
      new Response(
        JSON.stringify({
          result: { transactions: [], marker: undefined },
        }),
      ),
    );
    const file = new File([new Uint8Array([1])], 'x.mp4');
    const events = await lastValueFrom(
      verifyVideo({
        file,
        trustAnchorBundle: {
          xrplAccount: TESTNET_ACCOUNT,
          registry: await makeRegistry(),
        },
        rippledUrl: TEST_RIPPLED,
      }).pipe(toArray()),
    );
    expect(events[events.length - 1].type).toBe('result');
  });
});

describe('Bitcoin upgrade discovery after an XRP cache hit', () => {
  beforeEach(async () => { await purgeScanCache(TESTNET_ACCOUNT, TEST_RIPPLED); });
  afterEach(async () => { await purgeScanCache(TESTNET_ACCOUNT, TEST_RIPPLED); });
  async function runUpgrade(tamper: boolean, offline = false): Promise<VerificationResult> {
    const bytes = new Uint8Array([1,2,3]), sha = await sha256HexOf(bytes), fixture = await makeAnchorFixture(sha);
    const upgrade = await makeUpgradeFixture(fixture);
    if (tamper) (upgrade['Memos'] as Array<{Memo:{MemoData:string}}>)[3].Memo.MemoData = '00'.repeat(64);
    const cache = await openScanCache(TESTNET_ACCOUNT, TEST_RIPPLED);
    await putChannelEntry(cache, sha, { txHash: fixture.txHash, ledgerIndex: 1000, bundleHashHex: fixture.bundleHashHex }); cache.close();
    const requests: Array<{method:string;params:Array<Record<string,unknown>>}> = [];
    spyOn(window,'fetch').and.callFake(async (_url, init) => {
      const body = JSON.parse(init!.body as string); requests.push(body);
      if (body.method === 'account_tx') { if (offline) throw new TypeError('offline'); return new Response(JSON.stringify({ result: { transactions: [{ tx: upgrade, validated: true, ledger_index: 1100 }] } })); }
      return new Response(JSON.stringify({result:body.params[0].transaction === fixture.txHash ? fixture.rippledTx : upgrade}));
    });
    const events = await lastValueFrom(verifyVideo({file:new File([bytes],'evidence.mp4'),trustAnchorBundle:{xrplAccount:TESTNET_ACCOUNT,registry:await makeRegistry()},rippledUrl:TEST_RIPPLED}).pipe(toArray()));
    expect(requests.find(r=>r.method==='account_tx')!.params[0]['forward']).toBeFalse();
    expect(requests.find(r=>r.method==='account_tx')!.params[0]['ledger_index_min']).toBe(1000);
    return events.find(e=>e.type==='result') as VerificationResult;
  }
  it('searches beyond the original cache and verifies the later upgrade signature', async () => {
    const result=await runUpgrade(false); expect(result.tier1.status).toBe('verified'); expect(result.tier2.status).toBe('verified'); expect(result.tier3.status).toBe('attested-on-chain'); expect(result.tier3.upgrade?.txHash).toBe('B'.repeat(64)); expect(result.tier3.reason).toContain('pending');
  });
  it('rejects a changed upgrade signature', async () => { const result=await runUpgrade(true); expect(result.tier3.status).toBe('invalid'); expect(result.tier1.status).toBe('verified'); });
  it('preserves XRP results and reports an incomplete Bitcoin search on service failure', async () => { const result=await runUpgrade(false,true);expect(result.tier3.status).toBe('unavailable');expect(result.tier1.status).toBe('verified'); },15000);
});
