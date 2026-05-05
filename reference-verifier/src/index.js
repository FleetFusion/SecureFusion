/**
 * SecureFusion reference verifier — public API.
 *
 * Exposes the verification entry points described in the README.
 *
 * Implementation status (v1.0):
 *   - canonical hashing      : DONE
 *   - manifest validation    : skeleton (full schema validation pending)
 *   - memo decode            : DONE
 *   - XRPL fetch             : DONE
 *   - signature verification : DONE (requires registry entry to source the public key)
 *   - file hashing           : DONE
 *   - end-to-end glue        : skeleton, see verifyManifest below
 */

import { createHash } from 'node:crypto';

import { canonicalise } from './canonical.js';
import { sha256Bytes, sha256File, sha256Hex } from './hash.js';
import {
  extractMemosResult,
  decodeBundleMemo,
  extractOtsUpgradeMemos,
} from './memo.js';
import { fetchTransaction, accountTx } from './xrpl.js';
import { verifySignature } from './signature.js';
import { findByAccount } from './registry.js';
import { validateManifest } from './manifest.js';

/**
 * Compute the canonical bundleHash for an event manifest.
 *
 * @param {object} manifest
 * @returns {string} - lowercase hex SHA-256
 */
export function hashCanonical(manifest) {
  const bytes = canonicalise(manifest);
  return sha256Hex(bytes);
}

/** Maximum drops permitted in the SF1 self-pay anchor tx (1 XRP). */
const MAX_ANCHOR_DROPS = 100;

/**
 * Verify a manifest against an on-chain anchor.
 *
 * Returns a structured VerificationResult. Failures populate `reason`
 * with a stable spec-cited code; the function NEVER throws. Reason
 * codes used here:
 *   - manifest-schema-invalid        : ajv schema validation failed
 *   - manifest-version-unsupported   : v != 1 (D9)
 *   - registry-account-unknown       : Account not in registry
 *   - network-mismatch               : registry network != tx ledger family
 *                                      (D5; surfaced when the caller tells
 *                                      us which network `tx` came from)
 *   - registry-revoked               : tx confirmed after revokedAt (D10)
 *   - tx-not-payment                 : TransactionType != Payment
 *   - account-not-self-pay           : Account != Destination
 *   - tx-amount-out-of-range         : Amount drops not in [1, MAX_ANCHOR_DROPS]
 *   - memo-* (see memo.js)           : memo set is malformed
 *   - bundle-decode-failed           : SF1.bundle bytes are not 50-byte header
 *   - bundle-event-id-mismatch       : SF1.bundle.eventIdGuid != manifest.eventId
 *   - bundle-hash-mismatch           : recomputed bundleHash != SF1.bundle.bundleHash
 *   - event-bytes-mismatch           : SF1.event bytes != local canonical bytes
 *   - signature-invalid              : Ed25519 verify returned false
 *
 * On success, the result also exposes `warnings: []` (D6 / B2.7). The
 * `duplicate-anchor-suspected` warning is populated when an `account_tx`
 * discovery query finds another validated tx from the same account whose
 * SF1.bundle eventIdGuid matches. The discovery query is best-effort,
 * runs behind a 2-second timeout, and never blocks or fails the primary
 * verification.
 *
 * @param {object} args
 * @param {object} args.manifest
 * @param {string} args.txHash
 * @param {string} [args.rippledUrl]
 * @param {"mainnet"|"testnet"} [args.expectedNetwork] - if supplied,
 *   the verifier rejects when the registry entry's network doesn't match.
 * @param {string[]} [args.multiNodeUrls]              - see xrpl.js B2.8.
 * @returns {Promise<VerificationResult>}
 */
export async function verifyManifest({
  manifest,
  txHash,
  rippledUrl,
  expectedNetwork,
  multiNodeUrls,
  tx: prefetchedTx,
}) {
  // (a) Schema validate the manifest first. Spec D9: v1 verifiers MUST
  //     reject manifests whose `v` differs from 1 with a dedicated code.
  if (manifest && typeof manifest === 'object' && manifest.v !== undefined && manifest.v !== 1) {
    return fail('manifest-version-unsupported', { v: manifest.v });
  }
  const schemaResult = validateManifest(manifest);
  if (!schemaResult.ok) {
    return fail(schemaResult.reason, { errors: schemaResult.errors });
  }

  let tx = prefetchedTx;
  if (!tx) {
    try {
      tx = await fetchTransaction(txHash, { rippledUrl, multiNodeUrls });
    } catch (err) {
      return fail('xrpl-fetch-failed', { detail: String(err.message ?? err) });
    }
  }

  // (b) XRPL transaction shape checks.
  if (tx.TransactionType !== 'Payment') {
    return fail('tx-not-payment', { actual: tx.TransactionType });
  }
  const account = tx.Account;
  if (account !== tx.Destination) {
    return fail('account-not-self-pay', { account, destination: tx.Destination });
  }
  const amountDrops = Number(tx.Amount);
  if (
    !Number.isFinite(amountDrops) ||
    amountDrops < 1 ||
    amountDrops > MAX_ANCHOR_DROPS
  ) {
    return fail('tx-amount-out-of-range', { amount: tx.Amount });
  }

  // Registry lookup.
  const registryEntry = findByAccount(account);
  if (!registryEntry) {
    return fail('registry-account-unknown', { account });
  }

  // D5: network discriminator (only enforced when caller supplies the
  // expected network). For v1 the registry entry is the source of truth
  // for the account's network family; cross-checking here protects
  // against a mainnet caller verifying a testnet tx that happens to be
  // signed by the demo key.
  if (expectedNetwork && registryEntry.network !== expectedNetwork) {
    return fail('network-mismatch', {
      expected: expectedNetwork,
      registry: registryEntry.network,
    });
  }

  // D10: revocation rule. We treat any tx whose validation date is
  // >= revokedAt as invalid. The revocation timestamp is in ISO 8601;
  // tx.date is XRPL ripple time (seconds since 2000-01-01T00:00:00Z).
  if (registryEntry.revokedAt) {
    const revokedAtMs = Date.parse(registryEntry.revokedAt);
    const txMs = rippleTimeToUnixMs(tx.date);
    if (Number.isFinite(revokedAtMs) && Number.isFinite(txMs) && txMs >= revokedAtMs) {
      return fail('registry-revoked', {
        revokedAt: registryEntry.revokedAt,
        txDate: new Date(txMs).toISOString(),
      });
    }
  }

  // (c) Memo-set hardening (D4 / B2.6).
  const memos = tx.Memos ?? tx.tx?.Memos ?? [];
  const memoResult = extractMemosResult(memos);
  if (!memoResult.ok) {
    return fail(memoResult.reason);
  }
  const { bundle, event, signature } = memoResult;

  // SF1.bundle decode.
  let bundleDecoded;
  try {
    bundleDecoded = decodeBundleMemo(bundle);
  } catch (err) {
    return fail('bundle-decode-failed', { detail: String(err.message ?? err) });
  }

  // (d) eventId cross-check.
  if (bundleDecoded.eventId.toLowerCase() !== String(manifest.eventId).toLowerCase()) {
    return fail('bundle-event-id-mismatch', {
      bundle: bundleDecoded.eventId,
      manifest: manifest.eventId,
    });
  }

  // (e) bundle-hash check: the canonical hash of the SF1.event memo bytes
  //     MUST equal the bundleHash field in SF1.bundle. This catches a
  //     tampered manifest at sealing time. Run against the on-chain
  //     bytes first so the conformance vector reason ("manifest was
  //     modified after sealing -> bundle-hash-mismatch") fires here.
  const onChainEventBundleHash = sha256Hex(event);
  if (onChainEventBundleHash !== bundleDecoded.bundleHash) {
    return fail('bundle-hash-mismatch', {
      expected: bundleDecoded.bundleHash,
      actual: onChainEventBundleHash,
    });
  }

  // (f) event-bytes check: the local canonicalisation of the supplied
  //     `manifest` argument MUST equal the on-chain SF1.event bytes
  //     byte-for-byte. This catches the case where the caller's
  //     off-chain manifest copy disagrees with what was anchored.
  const localEventBytes = canonicalise(manifest);
  const localCanonicalHash = sha256Hex(localEventBytes);
  if (onChainEventBundleHash !== localCanonicalHash) {
    return fail('event-bytes-mismatch');
  }

  // Ed25519 signature.
  const sigInput = Buffer.concat([bundle, event]);
  const publicKey = Buffer.from(registryEntry.appPublicKey, 'hex');
  const sigOk = verifySignature({
    message: sigInput,
    signature,
    publicKey,
  });
  if (!sigOk) {
    return fail('signature-invalid');
  }

  // B2.7 / D6: best-effort duplicate-anchor discovery. The cost of this
  // call is one extra XRPL `account_tx` lookup; we cap it at 2s and
  // swallow every failure -- the warning array stays empty rather than
  // failing verification on a flaky network. Skipped entirely when the
  // caller pre-supplied `tx` (typically from a unit test harness).
  const warnings = prefetchedTx
    ? []
    : await detectDuplicateAnchor({
        account,
        eventId: manifest.eventId,
        txHash,
        rippledUrl,
      });

  // Round-4 D12: Tier-3 (Bitcoin attestation) dispatch. The provider's
  // registry entry's `bitcoinProofMode` selects the source of the OTS
  // proof + Merkle branch. Failure of Tier-3 is non-fatal: Tiers 1 + 2
  // already passed by the time we reach here. The result is surfaced
  // alongside `verified: true` so callers can render the three traffic-
  // light tiers described in the Phase 4 design spec §5.2 step 6.
  const tier3 = await verifyBitcoinTier({
    registryEntry,
    eventId: manifest.eventId,
    bundleHashHex: bundleDecoded.bundleHash,
    rippledUrl,
  });

  return {
    verified: true,
    anchor: {
      txHash,
      account,
      network: registryEntry.network,
      ledgerIndex: tx.ledger_index,
      closeTime: tx.date,
      organisation: registryEntry.organisation,
      specVersion: registryEntry.specVersion,
    },
    manifest,
    bundle: bundleDecoded,
    tier3,
    bitcoinProofSource: tier3.source,
    warnings,
  };
}

/**
 * Dispatch Tier-3 (Bitcoin proof) verification on the registry entry's
 * `bitcoinProofMode` (round-4 D12). Returns a structured result; never
 * throws and never fails the overall verification.
 *
 * Result shape:
 *   {
 *     status: 'verified' | 'attested-on-chain' | 'verified-via-https'
 *           | 'not-provided' | 'not-found' | 'invalid-merkle-branch'
 *           | 'invalid-signature' | 'memo-set-malformed'
 *           | 'https-fetch-failed' | 'https-response-invalid' | 'mode-invalid',
 *     source: 'xrpl' | 'https' | 'none',
 *     reason?: string,
 *     // xrpl-sf1ots success extras:
 *     bitcoinProofSource?: 'xrpl',
 *     upgrade?: { txHash, ledgerIndex },
 *     merkleRoot?: string,                       // hex64
 *     bitcoin?: { blockHeight, blockTimeUtc },
 *     // https success extras:
 *     otsProofBase64?: string,
 *     merkleProofJson?: string,
 *     bundleHash?: string,
 *   }
 */
async function verifyBitcoinTier({ registryEntry, eventId, bundleHashHex, rippledUrl }) {
  const mode = registryEntry.bitcoinProofMode;

  if (mode === 'none') {
    return {
      status: 'not-provided',
      source: 'none',
      reason: 'issuer-does-not-provide-bitcoin-tier',
    };
  }

  if (mode === 'xrpl-sf1ots') {
    return await verifyXrplSf1OtsTier({
      registryEntry,
      bundleHashHex,
      rippledUrl,
    });
  }

  if (mode === 'https') {
    const tpl = registryEntry.bitcoinProofUrlTemplate;
    if (typeof tpl !== 'string' || !tpl.startsWith('https://')) {
      return {
        status: 'mode-invalid',
        source: 'https',
        reason: 'https-mode-missing-url-template',
      };
    }
    const url = tpl
      .replace(/\{eventId\}/g, encodeURIComponent(String(eventId)))
      .replace(/\{bundleHash\}/g, encodeURIComponent(String(bundleHashHex)));
    return await fetchHttpsBitcoinProof({ url, eventId, bundleHashHex });
  }

  return {
    status: 'mode-invalid',
    source: 'none',
    reason: `unknown-bitcoin-proof-mode:${String(mode)}`,
  };
}

/**
 * Fetch the issuer-hosted OTS proof bundle. Same redirect-manual posture
 * as `xrpl.js::fetchTransactionFromUrl` — a 30x to an attacker host MUST
 * NOT silently bounce the verification to that host. 2-second timeout.
 *
 * Expected response body (JSON):
 *   {
 *     "otsProofBase64": "<base64>",
 *     "merkleProofJson": "<JSON string>",
 *     "eventId":        "<lowercase hyphenated UUID>",
 *     "bundleHash":     "<64-char lowercase hex>"
 *   }
 */
async function fetchHttpsBitcoinProof({ url, eventId, bundleHashHex }) {
  let body;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    let resp;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        // Refuse 30x — same model as xrpl.js (B2.8 / DA §3).
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (resp.status !== 200) {
      return {
        status: 'https-fetch-failed',
        source: 'https',
        reason: `http-${resp.status}`,
      };
    }
    body = await resp.json();
  } catch (err) {
    return {
      status: 'https-fetch-failed',
      source: 'https',
      reason: String(err?.message ?? err),
    };
  }

  if (!body || typeof body !== 'object') {
    return {
      status: 'https-response-invalid',
      source: 'https',
      reason: 'response-not-object',
    };
  }
  const { otsProofBase64, merkleProofJson } = body;
  if (typeof otsProofBase64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(otsProofBase64)) {
    return {
      status: 'https-response-invalid',
      source: 'https',
      reason: 'otsProofBase64-missing-or-not-base64',
    };
  }
  if (typeof merkleProofJson !== 'string' || merkleProofJson.length === 0) {
    return {
      status: 'https-response-invalid',
      source: 'https',
      reason: 'merkleProofJson-missing-or-empty',
    };
  }
  // Cross-check identifiers when supplied so a misrouted response is
  // caught early. Both fields are optional in the response shape (the
  // proof bytes themselves are the load-bearing payload), but if the
  // issuer echoes them back they must agree.
  if (typeof body.eventId === 'string' && body.eventId.toLowerCase() !== String(eventId).toLowerCase()) {
    return {
      status: 'https-response-invalid',
      source: 'https',
      reason: 'eventId-mismatch',
    };
  }
  if (typeof body.bundleHash === 'string' && body.bundleHash.toLowerCase() !== String(bundleHashHex).toLowerCase()) {
    return {
      status: 'https-response-invalid',
      source: 'https',
      reason: 'bundleHash-mismatch',
    };
  }

  return {
    status: 'verified-via-https',
    source: 'https',
    otsProofBase64,
    merkleProofJson,
  };
}

/**
 * xrpl-sf1ots Tier-3 verification (Phase 4 design spec §5.2 step 5).
 *
 * 1. Scan the registry account's `account_tx` history forward.
 * 2. Find a validated self-pay Payment carrying the OTS upgrade memo set
 *    (4 memos: SF1.bundle / SF1.merkleProof / SF1.ots / SF1.sig) whose
 *    SF1.bundle bundleHash matches the original anchor's bundleHash.
 * 3. Verify SF1.sig (Ed25519) over `bundle || merkleProof || ots`.
 * 4. Reapply the Merkle branch (double-SHA-256 per step) to derive the
 *    batch root.
 * 5. Run OpenTimestamps verification (best-effort: if the optional
 *    `javascript-opentimestamps` library isn't installed, surface the
 *    reason and return `attested-on-chain`).
 *
 * Tier-3 is non-blocking: any of `not-found` / `attested-on-chain` /
 * `verified` keeps `verified: true` at the top level. Hard failures
 * (`invalid-signature`, `invalid-merkle-branch`, `memo-set-malformed`)
 * surface as Tier-3 failures but still don't fail Tiers 1+2 — the
 * top-level `verified` flag is unchanged.
 */
async function verifyXrplSf1OtsTier({
  registryEntry,
  bundleHashHex,
  rippledUrl,
  scanTimeoutMs = 30_000,
}) {
  const account = registryEntry.xrplAccount;
  let found;
  try {
    found = await findSF1OtsByBundleHash(account, bundleHashHex, {
      rippledUrl,
      scanTimeoutMs,
    });
  } catch (err) {
    // Tier-3 is best-effort: a network error / malformed rippled
    // response degrades to `not-found` rather than failing the
    // overall verification. Surface the underlying reason for ops.
    return {
      status: 'not-found',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      reason: `scan-failed:${String(err?.message ?? err)}`,
    };
  }
  if (!found) {
    return {
      status: 'not-found',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
    };
  }

  // Memo decode already happened inside findSF1OtsByBundleHash; if it
  // surfaced a malformed memo set on a candidate-by-bundleHash match the
  // helper returns {decoded: {ok:false, reason}}.
  if (!found.decoded.ok) {
    return {
      status: 'memo-set-malformed',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      reason: found.decoded.reason,
    };
  }
  const { bundle, merkleProof, ots, sig } = found.decoded;

  // (1) Verify SF1.sig over bundle || merkleProof || ots.
  const merkleProofBytes = Buffer.from(merkleProof, 'utf8');
  const sigInput = Buffer.concat([bundle, merkleProofBytes, ots]);
  const publicKey = Buffer.from(registryEntry.appPublicKey, 'hex');
  const sigOk = verifySignature({
    message: sigInput,
    signature: sig,
    publicKey,
  });
  if (!sigOk) {
    return {
      status: 'invalid-signature',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      reason: 'sf1-ots-sig-invalid',
    };
  }

  // (2) Decode merkleProof JSON: list of { side: 'L'|'R', hash: hex32 }.
  let branch;
  try {
    branch = JSON.parse(merkleProof);
  } catch {
    return {
      status: 'memo-set-malformed',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      reason: 'merkle-proof-not-json',
    };
  }
  if (!Array.isArray(branch)) {
    return {
      status: 'memo-set-malformed',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      reason: 'merkle-proof-not-array',
    };
  }

  // (3) Reapply branch to derive batch root. Empty branch = leaf is root.
  let merkleRoot;
  try {
    merkleRoot = applyMerkleBranch(bundleHashHex.toLowerCase(), branch);
  } catch (err) {
    return {
      status: 'invalid-merkle-branch',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      reason: String(err.message ?? err),
    };
  }

  // (4) Run OTS verification (optional dependency).
  const ots3 = await verifyOtsProof(ots, merkleRoot);
  if (ots3.status === 'verified') {
    return {
      status: 'verified',
      source: 'xrpl',
      bitcoinProofSource: 'xrpl',
      upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
      merkleRoot,
      bitcoin: ots3.bitcoin,
    };
  }
  // OTS library not installed or proof unresolved: still surface that
  // Tiers 1+2 work AND the SF1.ots tx is on-chain and signature-valid.
  return {
    status: 'attested-on-chain',
    source: 'xrpl',
    bitcoinProofSource: 'xrpl',
    upgrade: { txHash: found.txHash, ledgerIndex: found.ledgerIndex },
    merkleRoot,
    reason: ots3.reason,
  };
}

/**
 * Scan the account's account_tx history for a SF1.ots upgrade tx whose
 * SF1.bundle bundleHash equals `bundleHashHex`. Forward-only scan, capped
 * by the supplied timeout. Returns the first match (or null).
 *
 * If a candidate is found by bundleHash but the OTS-upgrade memo decode
 * fails, returns `{ txHash, ledgerIndex, decoded: {ok:false, reason} }`
 * so the caller can surface `memo-set-malformed` rather than silently
 * skipping a malformed-but-targeted upgrade tx.
 */
async function findSF1OtsByBundleHash(account, bundleHashHex, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.scanTimeoutMs ?? 30_000);
  try {
    const wantHex = bundleHashHex.toLowerCase();
    for await (const { tx, ledger_index, validated } of accountTx(account, {
      rippledUrl: opts.rippledUrl,
      signal: ctrl.signal,
    })) {
      if (!validated) continue;
      if (tx.TransactionType !== 'Payment') continue;
      if (tx.Account !== account || tx.Destination !== account) continue;
      const memos = tx.Memos ?? [];
      // Cheap shape filter: SF1.ots upgrade has exactly 4 memos. The
      // anchor (3-memo) and any unrelated tx is skipped without
      // attempting a full memo decode.
      if (memos.length !== 4) continue;
      // Quickest correlation: peek at SF1.bundle MemoData (first 32
      // bytes are the bundleHash) BEFORE running the full decode. This
      // keeps the per-tx cost low across a large scan.
      const candidateHex = peekBundleHashFromMemos(memos);
      if (!candidateHex || candidateHex.toLowerCase() !== wantHex) continue;

      const decoded = extractOtsUpgradeMemos(memos);
      return {
        txHash: tx.hash,
        ledgerIndex: typeof ledger_index === 'number' ? ledger_index : tx.ledger_index,
        decoded,
      };
    }
    return null;
  } catch (err) {
    if (ctrl.signal.aborted) return null;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Peek at the SF1.bundle memo's first 32 bytes (the bundleHash) without
 * running the full strict memo-set decode. Returns lowercase hex or null
 * if no SF1.bundle memo is present / the data is too short.
 */
function peekBundleHashFromMemos(memos) {
  for (const wrapper of memos) {
    const m = wrapper && (wrapper.Memo ?? wrapper);
    if (!m || typeof m.MemoType !== 'string' || typeof m.MemoData !== 'string') continue;
    let typeStr;
    try {
      typeStr = Buffer.from(m.MemoType, 'hex').toString('utf8');
    } catch {
      continue;
    }
    if (typeStr !== 'SF1.bundle') continue;
    let bytes;
    try {
      bytes = Buffer.from(m.MemoData, 'hex');
    } catch {
      return null;
    }
    if (bytes.length < 32) return null;
    return bytes.subarray(0, 32).toString('hex');
  }
  return null;
}

/**
 * Reapply a Merkle branch starting from `leafHex` (lowercase hex32) to
 * derive the root. Each step combines the running hash with the sibling
 * via double-SHA-256 (Bitcoin / NBitcoin convention; SPEC §6.1.7).
 *
 * Branch entries: { side: 'L' | 'R', hash: hex32 }. 'L' means the
 * sibling is on the LEFT (i.e. running hash on the right of H(L||R));
 * 'R' means the sibling is on the right.
 *
 * An empty branch returns the leaf itself, which models the "single-event
 * batch" case (the bundle hash IS the batch root).
 */
function applyMerkleBranch(leafHex, branch) {
  if (!/^[0-9a-f]{64}$/.test(leafHex)) {
    throw new Error('leaf must be 64-char lowercase hex');
  }
  let acc = Buffer.from(leafHex, 'hex');
  for (let i = 0; i < branch.length; i++) {
    const step = branch[i];
    if (
      !step ||
      (step.side !== 'L' && step.side !== 'R') ||
      typeof step.hash !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(step.hash)
    ) {
      throw new Error(`merkle-branch-step-${i}-malformed`);
    }
    const sib = Buffer.from(step.hash.toLowerCase(), 'hex');
    const concat =
      step.side === 'L' ? Buffer.concat([sib, acc]) : Buffer.concat([acc, sib]);
    acc = doubleSha256(concat);
  }
  return acc.toString('hex');
}

function doubleSha256(buf) {
  const a = createHash('sha256').update(buf).digest();
  return createHash('sha256').update(a).digest();
}

/**
 * Run OpenTimestamps verification on the SF1.ots bytes. The verifier
 * deliberately keeps `javascript-opentimestamps` as an OPTIONAL dep:
 * the library is heavy and not always desired (Phase 4 design note).
 *
 * Returns:
 *   { status: 'verified', bitcoin: { blockHeight, blockTimeUtc } }
 *   { status: 'unresolved', reason: 'ots-library-not-installed' | <other> }
 */
async function verifyOtsProof(otsBytes, merkleRootHex) {
  let opentimestamps;
  try {
    // Dynamic import so node doesn't fail at module load when the
    // library isn't installed. The import string is deliberately
    // bare so node's resolver consults node_modules.
    opentimestamps = await import('javascript-opentimestamps');
  } catch {
    return { status: 'unresolved', reason: 'ots-library-not-installed' };
  }

  try {
    // The library exposes DetachedTimestampFile for Buffer-style proof
    // bytes. Cosmetic API differences across versions are caught and
    // reported as `ots-library-incompatible` rather than crashing.
    const ots = opentimestamps.default ?? opentimestamps;
    const detached = ots.DetachedTimestampFile?.deserialize?.(otsBytes);
    if (!detached) {
      return { status: 'unresolved', reason: 'ots-library-incompatible' };
    }
    const fileDigest = detached.fileDigest?.();
    if (fileDigest && Buffer.from(fileDigest).toString('hex') !== merkleRootHex) {
      return { status: 'unresolved', reason: 'ots-digest-mismatch' };
    }
    const result = await ots.verify(detached);
    if (!result || typeof result !== 'object') {
      return { status: 'unresolved', reason: 'ots-no-attestation' };
    }
    // The library returns either a plain object (newer) or a Map (older)
    // keyed by chain. We're interested in the 'bitcoin' attestation.
    const bitcoin =
      result.bitcoin ?? (typeof result.get === 'function' ? result.get('bitcoin') : null);
    if (!bitcoin || typeof bitcoin.height !== 'number') {
      return { status: 'unresolved', reason: 'ots-no-bitcoin-attestation' };
    }
    const blockTimeUtc =
      typeof bitcoin.timestamp === 'number'
        ? new Date(bitcoin.timestamp * 1000).toISOString()
        : (typeof bitcoin.blockTimeUtc === 'string' ? bitcoin.blockTimeUtc : null);
    return {
      status: 'verified',
      bitcoin: { blockHeight: bitcoin.height, blockTimeUtc },
    };
  } catch (err) {
    return { status: 'unresolved', reason: `ots-verify-failed:${String(err.message ?? err)}` };
  }
}

/** Standard failure shape. */
function fail(reason, extra = {}) {
  return { verified: false, reason, ...extra, warnings: [] };
}

/** Convert XRPL ripple time (seconds since 2000-01-01T00:00:00Z) to ms. */
function rippleTimeToUnixMs(rippleSeconds) {
  if (typeof rippleSeconds !== 'number') return NaN;
  // 946684800 = unix seconds at 2000-01-01T00:00:00Z.
  return (rippleSeconds + 946684800) * 1000;
}

/**
 * Best-effort duplicate-anchor discovery (B2.7 / D6).
 *
 * Calls the supplied rippled `account_tx` JSON-RPC method and scans the
 * recent transactions for any *other* validated Payment tx from the same
 * account whose SF1.bundle eventIdGuid matches. Cost: one extra HTTP
 * round-trip. Behind a 2s timeout. Network failures, missing memos, and
 * malformed responses are silently swallowed -- this is a SOFT signal,
 * never a hard failure.
 */
async function detectDuplicateAnchor({ account, eventId, txHash, rippledUrl }) {
  const warnings = [];
  if (!account || !eventId) return warnings;
  try {
    const url = rippledUrl ?? 'https://xrplcluster.com';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    let json;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method: 'account_tx',
          params: [
            {
              account,
              limit: 50,
              binary: false,
              forward: false,
            },
          ],
        }),
        redirect: 'manual',
        signal: controller.signal,
      });
      if (resp.status !== 200) return warnings;
      json = await resp.json();
    } finally {
      clearTimeout(timer);
    }
    const txs = json?.result?.transactions ?? [];
    const wantId = String(eventId).toLowerCase();
    for (const wrapper of txs) {
      const inner = wrapper.tx ?? wrapper.transaction ?? wrapper;
      if (!inner || inner.TransactionType !== 'Payment') continue;
      if (inner.hash && inner.hash.toLowerCase() === txHash.toLowerCase()) continue;
      if (wrapper.validated === false) continue;
      const memos = inner.Memos ?? [];
      const memoRes = extractMemosResult(memos);
      if (!memoRes.ok) continue;
      let decoded;
      try {
        decoded = decodeBundleMemo(memoRes.bundle);
      } catch {
        continue;
      }
      if (decoded.eventId && decoded.eventId.toLowerCase() === wantId) {
        warnings.push({
          code: 'duplicate-anchor-suspected',
          message:
            `multiple anchors found for eventId ${eventId} -- ` +
            `re-anchor detected (other tx: ${inner.hash ?? '?'})`,
          otherTxHash: inner.hash ?? null,
        });
        break;
      }
    }
  } catch {
    // best-effort -- network/timeout/malformed JSON all collapse to
    // "no warning". The primary verification result is unchanged.
  }
  return warnings;
}

/**
 * Verify a video file against an on-chain anchor.
 *
 * @param {object} args
 * @param {string} args.filePath
 * @param {string} args.txHash
 * @param {object} [args.manifest]      - if you already have the manifest off-chain
 * @param {string} [args.rippledUrl]
 * @returns {Promise<VerificationResult>}
 */
export async function verifyFile({ filePath, txHash, manifest, rippledUrl }) {
  // If no manifest is supplied, the manifest is taken from the on-chain SF1.event memo.
  let manifestToUse = manifest;
  if (!manifestToUse) {
    const tx = await fetchTransaction(txHash, { rippledUrl });
    const memos = tx.Memos ?? tx.tx?.Memos ?? [];
    const memoRes = extractMemosResult(memos);
    if (!memoRes.ok) {
      return { verified: false, reason: memoRes.reason };
    }
    manifestToUse = JSON.parse(Buffer.from(memoRes.event).toString('utf8'));
  }

  const manifestResult = await verifyManifest({
    manifest: manifestToUse,
    txHash,
    rippledUrl,
  });
  if (!manifestResult.verified) return manifestResult;

  const fileHash = await sha256File(filePath);
  const channelMatch = manifestToUse.channels.find((c) => c.sha256 === fileHash);
  if (!channelMatch) {
    return {
      verified: false,
      reason: 'File hash does not match any channel in the anchored manifest',
      fileHash,
      channelHashes: manifestToUse.channels.map((c) => c.sha256),
      anchor: manifestResult.anchor,
    };
  }

  return {
    ...manifestResult,
    file: {
      path: filePath,
      sha256: fileHash,
      matchedChannel: channelMatch.channelId,
    },
  };
}

/**
 * @typedef {object} VerificationResult
 * @property {boolean} verified
 * @property {string} [reason]   - present on failure
 * @property {object} [anchor]
 * @property {object} [manifest]
 * @property {object} [bundle]
 * @property {object} [file]
 */

export { canonicalise } from './canonical.js';
export { sha256File, sha256Hex } from './hash.js';
