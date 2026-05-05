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

    spyOn(window, 'fetch').and.resolveTo(
      new Response(JSON.stringify({ result: fixture.rippledTx })),
    );

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
    expect(['not-found', 'attested-on-chain']).toContain(result!.tier3.status);
  });

  it('Tier-1 not-found when no channel match anywhere', async () => {
    spyOn(window, 'fetch').and.resolveTo(
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

    spyOn(window, 'fetch').and.resolveTo(
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

  it('emits hashing progress frames before tier results', async () => {
    spyOn(window, 'fetch').and.resolveTo(
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
    spyOn(window, 'fetch').and.resolveTo(
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
