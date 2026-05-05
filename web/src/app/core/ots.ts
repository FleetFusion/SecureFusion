/**
 * OpenTimestamps verifier wrapper.
 *
 * Mirrors `verifyOtsProof` in `reference-verifier/src/index.js`. The
 * OTS library is heavy (~600 KB) so we lazy-load it via dynamic
 * import — the bundle is only fetched when a video being verified
 * actually claims an SF1.ots upgrade. Browsers never installed with
 * the library at all surface the same `ots-library-not-installed`
 * reason as the Node reference, keeping the orchestrator's tier-3
 * dispatch table identical across runtimes.
 *
 * Phase B intentionally keeps this a thin shim. Full integration with
 * `javascript-opentimestamps` and a fixture-driven test happens when
 * the FleetFusion testnet anchor pipeline produces a real OTS proof
 * we can pin into the spec — see plan Task 9 step 4 ("Generate the
 * FIXTURE_OTS bytes during impl"). Until then, the orchestrator's
 * tier-3 dispatch lands on `attested-on-chain` (signature-valid SF1.ots
 * tx exists, but Bitcoin block resolution is deferred), which matches
 * the Node reference's behaviour when the optional dep is missing.
 */

import { bytesToHex } from './verifier/bytes';

export type OtsResult =
  | {
      status: 'verified';
      bitcoin: { blockHeight: number; blockTimeUtc: string | null };
    }
  | { status: 'unresolved'; reason: string };

/**
 * Verify an OpenTimestamps proof against the supplied digest. The
 * digest is normalised to lowercase hex; both the running merkle root
 * (xrpl-sf1ots mode) and a raw bundleHash (https mode) are valid
 * inputs.
 *
 * Browser-only behavioural notes vs the Node reference:
 *   - The dynamic `import('javascript-opentimestamps')` resolves
 *     against the SPA bundle's chunk graph. esbuild emits a separate
 *     chunk so the OTS code only ships when this function is invoked.
 *   - The library sometimes makes network calls to a calendar server
 *     for unupgraded proofs. Verification of an upgraded proof is
 *     pure-CPU; the SPA does NOT initiate calendar requests.
 */
export async function verifyOtsProof(
  otsBytes: Uint8Array,
  digestHex: string,
): Promise<OtsResult> {
  const wantHex = digestHex.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(wantHex)) {
    return { status: 'unresolved', reason: 'digest-mismatch:not-64-hex' };
  }
  if (!otsBytes || otsBytes.byteLength === 0) {
    return { status: 'unresolved', reason: 'ots-bytes-empty' };
  }

  let mod: unknown;
  try {
    // Bare specifier loaded via an indirect dynamic import so the
    // TypeScript compiler doesn't try to resolve the (optional)
    // package at build time. esbuild keeps the import lazy — the
    // chunk is only fetched if this branch executes. When absent we
    // surface 'ots-library-not-installed' to match the Node ref.
    const dynImport = (specifier: string): Promise<unknown> =>
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      Function('s', 'return import(s)')(specifier) as Promise<unknown>;
    mod = await dynImport('javascript-opentimestamps');
  } catch {
    return { status: 'unresolved', reason: 'ots-library-not-installed' };
  }

  try {
    const ots = (mod as { default?: unknown }).default ?? mod;
    const otsRecord = ots as Record<string, unknown>;
    const detachedClass = otsRecord['DetachedTimestampFile'] as
      | { deserialize?: (b: Uint8Array) => unknown }
      | undefined;
    const detached = detachedClass?.deserialize?.(otsBytes);
    if (!detached) {
      return { status: 'unresolved', reason: 'ots-library-incompatible' };
    }
    const detachedRecord = detached as { fileDigest?: () => Uint8Array };
    const fileDigest = detachedRecord.fileDigest?.();
    if (fileDigest && bytesToHex(new Uint8Array(fileDigest)) !== wantHex) {
      return { status: 'unresolved', reason: 'digest-mismatch' };
    }
    const verifyFn = otsRecord['verify'] as
      | ((d: unknown) => Promise<unknown>)
      | undefined;
    if (typeof verifyFn !== 'function') {
      return { status: 'unresolved', reason: 'ots-library-incompatible' };
    }
    const result = await verifyFn(detached);
    if (!result || typeof result !== 'object') {
      return { status: 'unresolved', reason: 'ots-no-attestation' };
    }
    const r = result as { bitcoin?: unknown; get?: (k: string) => unknown };
    const bitcoin =
      r.bitcoin ?? (typeof r.get === 'function' ? r.get('bitcoin') : null);
    const btc = bitcoin as { height?: number; timestamp?: number; blockTimeUtc?: string } | null;
    if (!btc || typeof btc.height !== 'number') {
      return { status: 'unresolved', reason: 'ots-no-bitcoin-attestation' };
    }
    const blockTimeUtc =
      typeof btc.timestamp === 'number'
        ? new Date(btc.timestamp * 1000).toISOString()
        : typeof btc.blockTimeUtc === 'string'
          ? btc.blockTimeUtc
          : null;
    return {
      status: 'verified',
      bitcoin: { blockHeight: btc.height, blockTimeUtc },
    };
  } catch (err) {
    return {
      status: 'unresolved',
      reason: `ots-verify-failed:${String((err as Error)?.message ?? err)}`,
    };
  }
}
