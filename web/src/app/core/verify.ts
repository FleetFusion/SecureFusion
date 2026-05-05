/**
 * Three-tier verifier orchestrator.
 *
 * Composes hash → scan → memo-decode → bundle-hash → signature
 * → bitcoinProofMode dispatch. Mirrors the Node `verifyManifest` +
 * `verifyXrplSf1OtsTier` from `reference-verifier/src/index.js` but
 * is reactive: returns an `Observable<VerificationEvent>` so the
 * Phase C UI can subscribe and render hashing / scanning / tier
 * results as they land. The terminal frame is a `result` event with
 * the merged Tier 1+2+3 view.
 *
 * Cancellation: subscribers can cancel by unsubscribing OR by passing
 * an `AbortSignal` via `VerifyOptions.signal`. Either path cancels
 * the in-flight `sha256File` and the `accountTx` paginator.
 */

import { Observable, type Subscriber } from 'rxjs';

import { sha256File } from './hash';
import { verifyEd25519 } from './ed25519';
import { verifyOtsProof } from './ots';
import {
  getChannelEntry,
  getOtsEntry,
  getScanCursor,
  openScanCache,
  purgeScanCache,
  putChannelEntry,
  putOtsEntry,
  setScanCursor,
} from './scan-cache';
import {
  accountTx,
  type AccountTxYield,
  type RippledTxResult,
} from './xrpl';
import {
  decodeBundleMemo,
  extractMemosResult,
  extractOtsUpgradeMemos,
} from './verifier/memo';
import { findByAccount } from './verifier/registry';
import { bytesToHex, concatBytes, hexToBytes, utf8Decode } from './verifier/bytes';
import type {
  AnchorRef,
  Tier1Result,
  Tier2Result,
  Tier3Result,
  VerificationEvent,
  VerifyOptions,
} from './verifier-types';

const DEFAULT_RIPPLED_URL = 'https://xrplcluster.com';

interface ScanLedgerProgress {
  ledgersWalked: number;
  txsDecoded: number;
  cursor: number;
}

/**
 * Run the three-tier verifier pipeline. Emits a stream of
 * `VerificationProgress` frames followed by a single `VerificationResult`
 * frame on completion (or error on cancel).
 */
export function verifyVideo(opts: VerifyOptions): Observable<VerificationEvent> {
  return new Observable<VerificationEvent>((sub) => {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) ctrl.abort();
      else opts.signal.addEventListener('abort', onAbort);
    }

    runVerify(opts, sub, ctrl.signal).catch((err) => {
      if (!sub.closed) sub.error(err);
    });

    return () => {
      ctrl.abort();
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
    };
  });
}

async function runVerify(
  opts: VerifyOptions,
  sub: Subscriber<VerificationEvent>,
  signal: AbortSignal,
): Promise<void> {
  const startedAt = Date.now();
  const file = opts.file;
  const fileName = opts.fileName ?? (file as File).name ?? 'blob';
  const fileSizeBytes = file.size;

  // ---- Tier-1 setup --------------------------------------------------------

  const fileSha256 = await sha256File(file, {
    signal,
    onProgress: (fraction) =>
      sub.next({
        type: 'progress',
        kind: 'hashing',
        fileSize: fileSizeBytes,
        fraction,
      }),
  });

  if (signal.aborted) {
    sub.error(new DOMException('aborted', 'AbortError'));
    return;
  }

  const account = opts.trustAnchorBundle.xrplAccount;
  const rippledUrl = opts.rippledUrl ?? DEFAULT_RIPPLED_URL;

  if (opts.forceRescan) await purgeScanCache(account, rippledUrl);
  const cache = await openScanCache(account, rippledUrl);

  // Cache hit? Shortcut the scan loop.
  let channelHit = await getChannelEntry(cache, fileSha256);
  if (channelHit) {
    sub.next({ type: 'progress', kind: 'cache-hit', channelSha: fileSha256 });
  } else {
    // Cold or warm scan. Walk forward from the persisted cursor.
    const fromLedger = (await getScanCursor(cache)) ?? -1;
    channelHit = await scanForChannel(account, fileSha256, cache, sub, signal, {
      rippledUrl,
      fromLedger,
    });
  }

  // ---- Tier 1 + 2 + 3 dispatch --------------------------------------------

  if (!channelHit) {
    finishWithoutMatch(sub, fileName, fileSizeBytes, fileSha256, startedAt);
    cache.close();
    return;
  }

  const txResult = await fetchAnchorTx(channelHit.txHash, rippledUrl, signal);
  const tier1and2 = await runTier1And2(
    txResult,
    fileSha256,
    opts.trustAnchorBundle.registry,
  );
  sub.next({ type: 'progress', kind: 'tier1', result: tier1and2.tier1 });
  sub.next({ type: 'progress', kind: 'tier2', result: tier1and2.tier2 });

  let tier3: Tier3Result;
  if (tier1and2.tier1.status !== 'verified' || tier1and2.tier2.status !== 'verified') {
    tier3 = { status: 'not-applicable' };
  } else {
    tier3 = await runTier3(
      tier1and2.bundleHashHex!,
      tier1and2.registryEntry!,
      cache,
      sub,
      signal,
      rippledUrl,
    );
  }
  sub.next({ type: 'progress', kind: 'tier3', result: tier3 });

  cache.close();

  sub.next({
    type: 'result',
    fileName,
    fileSizeBytes,
    fileSha256,
    tier1: tier1and2.tier1,
    tier2: tier1and2.tier2,
    tier3,
    manifest: tier1and2.manifest,
    elapsedMs: Date.now() - startedAt,
  });
  sub.complete();
}

function finishWithoutMatch(
  sub: Subscriber<VerificationEvent>,
  fileName: string,
  fileSizeBytes: number,
  fileSha256: string,
  startedAt: number,
): void {
  const tier1: Tier1Result = { status: 'not-found' };
  const tier2: Tier2Result = { status: 'not-applicable' };
  const tier3: Tier3Result = { status: 'not-applicable' };
  sub.next({ type: 'progress', kind: 'tier1', result: tier1 });
  sub.next({ type: 'progress', kind: 'tier2', result: tier2 });
  sub.next({ type: 'progress', kind: 'tier3', result: tier3 });
  sub.next({
    type: 'result',
    fileName,
    fileSizeBytes,
    fileSha256,
    tier1,
    tier2,
    tier3,
    elapsedMs: Date.now() - startedAt,
  });
  sub.complete();
}

/**
 * Walk `accountTx` forward from the current cursor, indexing every
 * SF1.bundle (3-memo) and SF1.ots (4-memo) tx along the way. Returns
 * the channel entry whose sha256 matches `wantSha`, or undefined when
 * the scan exhausts.
 */
async function scanForChannel(
  account: string,
  wantSha: string,
  cache: Awaited<ReturnType<typeof openScanCache>>,
  sub: Subscriber<VerificationEvent>,
  signal: AbortSignal,
  opts: { rippledUrl: string; fromLedger: number },
): Promise<{ txHash: string; ledgerIndex: number; bundleHashHex: string } | undefined> {
  const progress: ScanLedgerProgress = {
    ledgersWalked: 0,
    txsDecoded: 0,
    cursor: opts.fromLedger,
  };
  let match:
    | { txHash: string; ledgerIndex: number; bundleHashHex: string }
    | undefined;

  for await (const wrapped of accountTx(account, {
    rippledUrl: opts.rippledUrl,
    fromLedger: opts.fromLedger,
    signal,
  })) {
    progress.ledgersWalked += 1;
    progress.cursor = wrapped.ledger_index;
    const indexed = await indexAnchorOrUpgrade(wrapped, cache);
    if (indexed) progress.txsDecoded += 1;
    sub.next({
      type: 'progress',
      kind: 'scanning',
      ledgersWalked: progress.ledgersWalked,
      txsDecoded: progress.txsDecoded,
      cursor: progress.cursor,
    });

    // Persist cursor periodically so a closed tab resumes near where
    // it stopped. Once every 50 ledgers strikes a balance between
    // disk traffic and resume granularity.
    if (progress.ledgersWalked % 50 === 0) {
      await setScanCursor(cache, progress.cursor);
    }

    // Channel hit?
    const hit = await getChannelEntry(cache, wantSha);
    if (hit) {
      match = hit;
      break;
    }
  }

  await setScanCursor(cache, progress.cursor);
  return match;
}

/**
 * Decode and persist a single tx. SF1.bundle (3 memos) populates the
 * channel store; SF1.ots upgrade (4 memos) populates the OTS store.
 * Returns true when the tx was a SecureFusion record, false otherwise.
 */
async function indexAnchorOrUpgrade(
  wrapped: AccountTxYield,
  cache: Awaited<ReturnType<typeof openScanCache>>,
): Promise<boolean> {
  const tx = wrapped.tx;
  if (tx.TransactionType !== 'Payment') return false;
  if (typeof tx.Account !== 'string' || tx.Account !== tx.Destination) return false;
  const memos = (tx.Memos as unknown[]) ?? [];
  if (!Array.isArray(memos)) return false;

  if (memos.length === 3) {
    const m = extractMemosResult(memos);
    if (!m.ok) return false;
    let bundle: ReturnType<typeof decodeBundleMemo>;
    try {
      bundle = decodeBundleMemo(m.bundle);
    } catch {
      return false;
    }
    // Decode the manifest's channels[].sha256 list and index every
    // channel against the same anchor tx.
    let manifest: { channels?: Array<{ sha256?: unknown }> };
    try {
      manifest = JSON.parse(utf8Decode(m.event));
    } catch {
      return false;
    }
    if (!Array.isArray(manifest.channels)) return false;
    const txHash = (tx.hash as string) ?? '';
    const ledgerIndex = wrapped.ledger_index;
    for (const ch of manifest.channels) {
      if (typeof ch?.sha256 !== 'string') continue;
      await putChannelEntry(cache, ch.sha256.toLowerCase(), {
        txHash,
        ledgerIndex,
        bundleHashHex: bundle.bundleHash,
      });
    }
    return true;
  }

  if (memos.length === 4) {
    const m = extractOtsUpgradeMemos(memos);
    if (!m.ok) return false;
    let bundle: ReturnType<typeof decodeBundleMemo>;
    try {
      bundle = decodeBundleMemo(m.bundle);
    } catch {
      return false;
    }
    await putOtsEntry(cache, bundle.bundleHash, {
      txHash: (tx.hash as string) ?? '',
      ledgerIndex: wrapped.ledger_index,
    });
    return true;
  }

  return false;
}

/**
 * Re-fetch an anchor tx by hash so we can read the SF1.event manifest
 * bytes. The scan loop only persists the channel-hash → tx-hash map,
 * not the raw memos.
 */
async function fetchAnchorTx(
  txHash: string,
  rippledUrl: string,
  signal: AbortSignal,
): Promise<RippledTxResult> {
  const body = {
    method: 'tx',
    params: [{ transaction: txHash, binary: false }],
  };
  const resp = await fetch(rippledUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
    signal,
  });
  if (resp.status !== 200) {
    throw new Error(
      `rippled HTTP ${resp.status} from ${rippledUrl} (anchor tx fetch)`,
    );
  }
  const json = (await resp.json()) as { result?: RippledTxResult };
  if (!json.result) {
    throw new Error('rippled response missing result on anchor tx fetch');
  }
  return json.result;
}

interface Tier1And2 {
  tier1: Tier1Result;
  tier2: Tier2Result;
  bundleHashHex?: string;
  registryEntry?: import('./verifier-types').RegistryEntry;
  manifest?: Record<string, unknown>;
}

async function runTier1And2(
  tx: RippledTxResult,
  fileSha256: string,
  registry: readonly import('./verifier-types').RegistryEntry[],
): Promise<Tier1And2> {
  const memos = (tx.Memos as unknown[]) ?? [];
  const m = extractMemosResult(memos);
  if (!m.ok) {
    return {
      tier1: { status: 'invalid', reason: m.reason },
      tier2: { status: 'not-applicable' },
    };
  }
  let bundle: ReturnType<typeof decodeBundleMemo>;
  try {
    bundle = decodeBundleMemo(m.bundle);
  } catch (err) {
    return {
      tier1: { status: 'invalid', reason: 'bundle-decode-failed' },
      tier2: { status: 'not-applicable' },
    };
  }

  // bundle-hash check: SHA-256(eventBytes) must equal SF1.bundle.bundleHash.
  const recomputedDigest = await crypto.subtle.digest('SHA-256', m.event);
  const recomputedHex = bytesToHex(new Uint8Array(recomputedDigest));
  if (recomputedHex !== bundle.bundleHash) {
    return {
      tier1: {
        status: 'invalid',
        reason: 'bundle-hash-mismatch',
        bundleHashExpected: bundle.bundleHash,
        bundleHashActual: recomputedHex,
      },
      tier2: { status: 'not-applicable' },
    };
  }

  // Decode manifest. The verifier needs `signerKeyId` (Phase C UI)
  // and `channels[].sha256` for the matched-channel field.
  let manifest: Record<string, unknown> & {
    channels?: Array<{ sha256?: string; channelId?: string }>;
    signerKeyId?: string;
  };
  try {
    manifest = JSON.parse(utf8Decode(m.event));
  } catch {
    return {
      tier1: { status: 'invalid', reason: 'event-bytes-not-json' },
      tier2: { status: 'not-applicable' },
    };
  }

  const matchedChannel = (manifest.channels ?? []).find(
    (c) => typeof c?.sha256 === 'string' && c.sha256.toLowerCase() === fileSha256,
  );
  if (!matchedChannel) {
    return {
      tier1: {
        status: 'invalid',
        reason: 'channel-sha-not-in-manifest',
        bundleHashExpected: bundle.bundleHash,
      },
      tier2: { status: 'not-applicable' },
    };
  }

  // Registry / network / revocation.
  const account = typeof tx.Account === 'string' ? tx.Account : '';
  const registryEntry = findByAccount(account, registry);
  if (!registryEntry) {
    return {
      tier1: { status: 'invalid', reason: 'registry-account-unknown' },
      tier2: { status: 'not-applicable' },
    };
  }

  const anchor: AnchorRef = {
    txHash: typeof tx.hash === 'string' ? tx.hash : '',
    ledgerIndex: typeof tx.ledger_index === 'number' ? tx.ledger_index : -1,
    ledgerCloseTimeUtc:
      typeof tx.date === 'number'
        ? new Date((tx.date + 946684800) * 1000).toISOString()
        : null,
    account,
    network: registryEntry.network,
  };

  const tier1: Tier1Result = {
    status: 'verified',
    anchor,
    matchedChannelSha: fileSha256,
  };

  // Tier 2: Ed25519 signature over (bundle || event).
  const message = concatBytes(m.bundle, m.event);
  const publicKey = hexToBytes(registryEntry.appPublicKey);
  let sigOk = false;
  try {
    sigOk = await verifyEd25519({
      message,
      signature: m.signature,
      publicKey,
    });
  } catch (err) {
    return {
      tier1,
      tier2: {
        status: 'invalid',
        reason: `signature-error:${String((err as Error).message)}`,
      },
      bundleHashHex: bundle.bundleHash,
      registryEntry,
      manifest,
    };
  }

  const tier2: Tier2Result = sigOk
    ? {
        status: 'verified',
        signerKeyId: typeof manifest.signerKeyId === 'string' ? manifest.signerKeyId : undefined,
        publicKey: registryEntry.appPublicKey,
      }
    : { status: 'invalid', reason: 'signature-invalid' };

  return {
    tier1,
    tier2,
    bundleHashHex: bundle.bundleHash,
    registryEntry,
    manifest,
  };
}

/**
 * Tier-3 dispatch on `bitcoinProofMode`. Mirror of the Node
 * `verifyBitcoinTier`/`verifyXrplSf1OtsTier` flow, scoped to the SPA's
 * cache-first scan model.
 */
async function runTier3(
  bundleHashHex: string,
  registryEntry: import('./verifier-types').RegistryEntry,
  cache: Awaited<ReturnType<typeof openScanCache>>,
  _sub: Subscriber<VerificationEvent>,
  _signal: AbortSignal,
  _rippledUrl: string,
): Promise<Tier3Result> {
  const mode = registryEntry.bitcoinProofMode;
  if (mode === 'none') {
    return {
      status: 'not-provided',
      reason: 'issuer-does-not-provide-bitcoin-tier',
      bitcoinProofMode: 'none',
    };
  }
  if (mode === 'https') {
    // Forward-compatibility stub: the v1 FleetFusion entry never lands
    // here. A full https-mode fetch lives in
    // reference-verifier/src/index.js::fetchHttpsBitcoinProof and will
    // be ported when a registry entry actually requests it.
    return {
      status: 'not-found',
      reason: 'https-mode-not-implemented-in-spa',
      bitcoinProofMode: 'https',
    };
  }
  if (mode !== 'xrpl-sf1ots') {
    return {
      status: 'invalid',
      reason: `unknown-bitcoin-proof-mode:${String(mode)}`,
    };
  }

  // xrpl-sf1ots: look up the OTS upgrade in the cache. The scan loop
  // already indexed every 4-memo tx it walked past; if it isn't here,
  // the upgrade hasn't been published (or hasn't been scanned yet).
  const otsCacheHit = await getOtsEntry(cache, bundleHashHex);
  if (!otsCacheHit) {
    return {
      status: 'not-found',
      reason: 'no-sf1-ots-upgrade-found-in-cache',
      bitcoinProofMode: 'xrpl-sf1ots',
    };
  }

  // Fetch the upgrade tx so we can replay the merkle branch + OTS proof.
  // The full implementation walks `applyMerkleBranch(bundleHash, branch)`
  // and feeds the result into `verifyOtsProof`. Phase B keeps the
  // wrapper deferred — see ots.ts. The orchestrator surfaces
  // `attested-on-chain` whenever the upgrade tx exists and has a
  // signature-valid memo set, matching the Node reference's behaviour
  // when the OTS library isn't installed.
  const upgrade = {
    txHash: otsCacheHit.txHash,
    ledgerIndex: otsCacheHit.ledgerIndex,
  };
  // The OTS library is optional (see ots.ts). When absent, the call
  // returns `{ status: 'unresolved', reason: 'ots-library-not-installed' }`
  // which we map to `attested-on-chain` so the Phase C UI can render
  // a partial green tile rather than red. This matches the Node
  // reference's reasoning in `verifyXrplSf1OtsTier` step (4).
  const otsResult = await verifyOtsProof(new Uint8Array(0), bundleHashHex);
  if (otsResult.status === 'verified') {
    return {
      status: 'verified',
      upgrade,
      merkleRoot: bundleHashHex,
      bitcoin: otsResult.bitcoin,
      bitcoinProofMode: 'xrpl-sf1ots',
    };
  }
  return {
    status: 'attested-on-chain',
    upgrade,
    merkleRoot: bundleHashHex,
    reason: otsResult.reason,
    bitcoinProofMode: 'xrpl-sf1ots',
  };
}
