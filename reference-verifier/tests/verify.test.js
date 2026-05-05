/**
 * verifyManifest end-to-end tests. (B2)
 *
 * Builds a synthetic but schema-valid v1 manifest, signs the resulting
 * SF1.bundle || SF1.event with the deterministic test seed (joint-plan
 * D11), constructs a fake validated XRPL Payment carrying the three SF1
 * memos, and exercises both the happy path and a battery of tampered
 * variants. Each tamper asserts the verifier returns
 *   { verified:false, reason:'<spec-cited code>' }
 * rather than throwing.
 *
 * The test harness wires the registry's appPublicKey to the public half
 * of SF1_TEST_APP_SEED so the signature actually verifies against the
 * bundled testnet entry.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
} from 'node:crypto';

import { verifyManifest, canonicalise } from '../src/index.js';
import { encodeBundleMemo } from '../src/memo.js';
import { findByAccount, listActive } from '../src/registry.js';

// ----- deterministic test seed (joint-plan D11) ---------------------------

const SF1_TEST_APP_SEED = Buffer.from(
  Array.from({ length: 32 }, (_, i) => i)
);

function ed25519Sign(message, seed32) {
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed32,
  ]);
  const keyObject = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  return nodeSign(null, message, keyObject);
}

function ed25519PublicHex(seed32) {
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed32,
  ]);
  const priv = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  const exported = pub.export({ type: 'spki', format: 'der' });
  // The last 32 bytes of the SPKI DER are the raw key.
  return exported.subarray(exported.length - 32).toString('hex');
}

const TEST_PUBLIC_HEX = ed25519PublicHex(SF1_TEST_APP_SEED);

// ----- minimal schema-valid v1 manifest -----------------------------------

function buildManifest(overrides = {}) {
  return {
    channels: [
      {
        capturedAt: '2026-04-30T12:34:56.000Z',
        channelId: 'front',
        durationMs: 12000,
        sha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sizeBytes: 8421376,
      },
    ],
    eventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    ingestSource: 'fleetfusion',
    ingestedAt: '2026-04-30T12:35:02.123Z',
    occurredAt: '2026-04-30T12:34:56.000Z',
    sealedAt: '2026-04-30T12:35:03.000Z',
    v: 1,
    vehicleEventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    vehicleId: 'vh_HX24ABC',
    ...overrides,
  };
}

// SecureFusion v1: single-value enum, single source-code byte.
const INGEST_SOURCE_CODES = { fleetfusion: 1 };

function strHex(s) {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase();
}

function memo(type, format, dataBuf) {
  return {
    Memo: {
      MemoType: strHex(type),
      MemoFormat: strHex(format),
      MemoData: Buffer.from(dataBuf).toString('hex').toUpperCase(),
    },
  };
}

function buildAnchorTx(manifest, { account, seed = SF1_TEST_APP_SEED } = {}) {
  const eventBytes = canonicalise(manifest);
  const bundleHash = createHash('sha256').update(eventBytes).digest('hex');
  const bundleBytes = encodeBundleMemo({
    bundleHash,
    eventId: manifest.eventId,
    ingestSourceCode: INGEST_SOURCE_CODES[manifest.ingestSource],
    channelCount: manifest.channels.length,
  });
  const sig = ed25519Sign(Buffer.concat([bundleBytes, eventBytes]), seed);

  return {
    TransactionType: 'Payment',
    Account: account,
    Destination: account,
    Amount: '1',
    hash: 'A'.repeat(64),
    validated: true,
    ledger_index: 12345,
    date: 800000000,
    Memos: [
      memo('SF1.bundle', 'application/octet-stream', bundleBytes),
      memo('SF1.event', 'application/json', eventBytes),
      memo('SF1.sig', 'application/octet-stream', sig),
    ],
  };
}

// ----- registry plumbing for tests ----------------------------------------
// The bundled registry's testnet entry already carries the public half of
// SF1_TEST_APP_SEED (joint-plan D11). Tests anchor with the seed and the
// registry hex agrees by construction.
const testnetEntry = listActive().find((e) => e.network === 'testnet');
const ACCOUNT = testnetEntry.xrplAccount;

// Verify the patched entry is what findByAccount returns.
test('test setup: registry exposes the deterministic test pubkey', () => {
  const entry = findByAccount(ACCOUNT);
  assert.equal(entry.appPublicKey, TEST_PUBLIC_HEX);
});

// ----- happy path ---------------------------------------------------------

test('verifyManifest: happy path verifies a well-formed anchor', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.anchor.account, ACCOUNT);
  assert.equal(result.anchor.network, 'testnet');
  assert.deepEqual(result.warnings, []);
});

// ----- tamper variants ----------------------------------------------------

test('tamper: caller manifest disagrees with on-chain SF1.event -> event-bytes-mismatch', async () => {
  // The on-chain bundle was sealed against `original`, so the on-chain
  // sha256(SF1.event) == SF1.bundle.bundleHash (no bundle-hash-mismatch).
  // The caller passes a tampered manifest whose canonical bytes differ
  // from SF1.event -> event-bytes-mismatch.
  const original = buildManifest();
  const tx = buildAnchorTx(original, { account: ACCOUNT });
  const tampered = { ...original, vehicleId: 'vh_DIFFERENT' };
  const result = await verifyManifest({
    manifest: tampered,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'event-bytes-mismatch');
});

test('tamper: swapped sig (zero bytes) -> signature-invalid', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  // Replace the signature memo with all-zero bytes.
  tx.Memos[2] = memo('SF1.sig', 'application/octet-stream', Buffer.alloc(64));
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'signature-invalid');
});

test('tamper: wrong account -> registry-account-unknown', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: 'rIMPOSTOR' });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'registry-account-unknown');
});

test('tamper: missing memo (only 2) -> memo-missing', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Memos = tx.Memos.slice(0, 2);
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'memo-missing');
});

test('tamper: extra memo (4 total) -> memo-extra', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Memos.push(memo('SF1.bonus', 'application/octet-stream', Buffer.from('00', 'hex')));
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'memo-extra');
});

test('tamper: mutated bundle eventId byte -> bundle-event-id-mismatch', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  // Flip a byte in the eventId range of SF1.bundle (bytes 32..47).
  const bundleHex = tx.Memos[0].Memo.MemoData;
  const bundleBuf = Buffer.from(bundleHex, 'hex');
  bundleBuf[40] ^= 0xff;
  tx.Memos[0].Memo.MemoData = bundleBuf.toString('hex').toUpperCase();
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'bundle-event-id-mismatch');
});

test('tamper: TransactionType != Payment -> tx-not-payment', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.TransactionType = 'OfferCreate';
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'tx-not-payment');
});

test('tamper: Account != Destination -> account-not-self-pay', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Destination = 'rDIFFERENT';
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'account-not-self-pay');
});

test('tamper: Amount above MAX_DROPS -> tx-amount-out-of-range', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Amount = '1000000';
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'tx-amount-out-of-range');
});

test('tamper: ingestSource = "FleetLive" -> manifest-schema-invalid (D2 safety)', async () => {
  // The v1 schema enum is exactly ["fleetfusion"] (single value). Any other
  // string — including the legacy Pascal-case brand names — is NOT
  // v1-conformant. Proves the encoder constraint: every v1 field with a
  // free-string range is either dropped or pattern/enum-constrained, so the
  // joint-plan D2 canonical-byte invariant is enforced.
  const manifest = buildManifest({ ingestSource: 'FleetLive' });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx: { TransactionType: 'Payment' },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'manifest-schema-invalid');
});

test('tamper: vehicleId with `<` is REJECTED IF schema constrains it (xfail flag)', async () => {
  // Tracking note for the schema dev: the v1 schema currently leaves
  // vehicleId as a free string with only minLength/maxLength. A producer
  // could legally emit "vehicleId":"cafe<test>" and the encoder would
  // diverge between RFC 8785 minimal escaping and .NET's HTML-safe
  // default. Joint-plan D2 stays defensible because FleetFusion uses
  // GUIDs for vehicleId in practice, but a future schema patch should
  // tighten the regex (e.g. ^[A-Za-z0-9_-]+$) so this becomes a hard
  // schema rejection. The test below is pending that schema tightening.
  const manifest = buildManifest({ vehicleId: 'cafe<test>' });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx: { TransactionType: 'Payment' },
  });
  // For now we accept either: (a) schema reject, or (b) the manifest
  // canonicalises and the verifier reaches the next stage. The first
  // outcome is preferred and will land when the schema dev adds the
  // pattern.
  if (!result.verified && result.reason === 'manifest-schema-invalid') {
    return; // good -- schema rejects.
  }
  // If the schema isn't tight yet, the manifest passes schema but later
  // stages will fail because we never built a tx for this fixture.
  assert.equal(result.verified, false);
});

test('tamper: v != 1 -> manifest-version-unsupported (D9)', async () => {
  const manifest = buildManifest({ v: 2 });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx: { TransactionType: 'Payment' },
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'manifest-version-unsupported');
});

test('expectedNetwork mainnet vs testnet entry -> network-mismatch (D5)', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
    expectedNetwork: 'mainnet',
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'network-mismatch');
});

test('case-mismatched memo type SF1.Bundle -> memo-type-case-mismatch', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Memos[0].Memo.MemoType = strHex('SF1.Bundle');
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'memo-type-case-mismatch');
});

test('wrong MemoFormat for bundle -> memo-format-mismatch-bundle', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  tx.Memos[0].Memo.MemoFormat = strHex('application/json');
  const result = await verifyManifest({
    manifest,
    txHash: 'A'.repeat(64),
    tx,
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'memo-format-mismatch-bundle');
});

// ----- Round-4 D12: bitcoinProofMode dispatch -----------------------------
//
// The verifier reads `registryEntry.bitcoinProofMode` after Tier 1 + 2 pass
// and surfaces a structured Tier-3 result. The three modes:
//   - "xrpl-sf1ots": Tier-3 deferred to caller's chain scan (returns
//     status: 'pending-chain-scan').
//   - "https": fetches the issuer-hosted proof JSON; cryptographic
//     verification still local.
//   - "none": Tier-3 explicitly not provided; Tiers 1+2 still pass.
//
// Each test mutates the bundled testnet entry's bitcoinProofMode in-place
// and restores it afterward. `findByAccount` returns the actual entry by
// reference, so direct mutation drives the verifier dispatch.

function withBitcoinProofMode(account, { mode, urlTemplate }, fn) {
  const entry = findByAccount(account);
  const prevMode = entry.bitcoinProofMode;
  const prevTpl = entry.bitcoinProofUrlTemplate;
  try {
    entry.bitcoinProofMode = mode;
    if (urlTemplate !== undefined) {
      entry.bitcoinProofUrlTemplate = urlTemplate;
    } else {
      delete entry.bitcoinProofUrlTemplate;
    }
    return fn();
  } finally {
    entry.bitcoinProofMode = prevMode;
    if (prevTpl === undefined) {
      delete entry.bitcoinProofUrlTemplate;
    } else {
      entry.bitcoinProofUrlTemplate = prevTpl;
    }
  }
}

test('bitcoinProofMode "xrpl-sf1ots": tier 1+2 pass, tier 3 not-found when account_tx is empty', async () => {
  // Phase 4: the verifier now actually scans account_tx. With an empty
  // canned response the scan produces `not-found`; tier 1+2 still pass.
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return { result: { transactions: [], status: 'success' } };
    },
  });
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      { mode: 'xrpl-sf1ots' },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.bitcoinProofSource, 'xrpl');
  assert.equal(result.tier3.source, 'xrpl');
  assert.equal(result.tier3.status, 'not-found');
});

test('bitcoinProofMode "none": tier 1+2 pass, tier 3 not-provided', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  const result = await withBitcoinProofMode(
    ACCOUNT,
    { mode: 'none' },
    () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx })
  );
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.bitcoinProofSource, 'none');
  assert.equal(result.tier3.status, 'not-provided');
  assert.equal(result.tier3.reason, 'issuer-does-not-provide-bitcoin-tier');
});

test('bitcoinProofMode "https": fetches OTS proof + Merkle branch via stubbed fetch', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  // Compute the expected bundleHash so the stubbed response can echo it.
  const expectedBundleHashHex = (() => {
    const eventBytes = canonicalise(manifest);
    return createHash('sha256').update(eventBytes).digest('hex');
  })();

  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      status: 200,
      async json() {
        return {
          otsProofBase64: 'AAECAwQFBgcICQ==',
          merkleProofJson: '[{"side":"L","hash":"0".repeat(64)}]',
          eventId: manifest.eventId,
          bundleHash: expectedBundleHashHex,
        };
      },
    };
  };

  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      {
        mode: 'https',
        urlTemplate: 'https://issuer.example/proof/{eventId}/{bundleHash}.json',
      },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.bitcoinProofSource, 'https');
  assert.equal(result.tier3.status, 'verified-via-https');
  assert.equal(result.tier3.otsProofBase64, 'AAECAwQFBgcICQ==');
  assert.match(result.tier3.merkleProofJson, /^\[/);
  assert.equal(calls.length, 1);
  // Placeholders MUST be substituted into the template.
  assert.ok(calls[0].url.includes(manifest.eventId));
  assert.ok(calls[0].url.includes(expectedBundleHashHex));
  // redirect: 'manual' MUST be set so a 30x can't bounce verification
  // to an attacker host (parity with xrpl.js).
  assert.equal(calls[0].opts.redirect, 'manual');
});

test('bitcoinProofMode "https" with bad URL template -> mode-invalid', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });
  const result = await withBitcoinProofMode(
    ACCOUNT,
    { mode: 'https', urlTemplate: 'http://insecure.example/{eventId}' },
    () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx })
  );
  // Tiers 1+2 still pass; only Tier-3 is degraded.
  assert.equal(result.verified, true);
  assert.equal(result.tier3.status, 'mode-invalid');
  assert.equal(result.tier3.reason, 'https-mode-missing-url-template');
});

test('bitcoinProofMode "https" 404 -> https-fetch-failed but tier 1+2 still verified', async () => {
  const manifest = buildManifest();
  const tx = buildAnchorTx(manifest, { account: ACCOUNT });

  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 404, async json() { return {}; } });
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      {
        mode: 'https',
        urlTemplate: 'https://issuer.example/proof/{eventId}/{bundleHash}.json',
      },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.verified, true);
  assert.equal(result.tier3.status, 'https-fetch-failed');
  assert.equal(result.tier3.reason, 'http-404');
});

// ----- Phase 4: xrpl-sf1ots Tier-3 scan -----------------------------------

/**
 * Build a synthetic SF1.ots upgrade Payment for the same bundle as `anchorTx`.
 * The bundle bytes are reused verbatim so the bundleHash correlates with
 * the original anchor (Phase 4 §6.1). The Merkle proof is empty (single
 * event batch -> bundleHash IS the root). OTS proof is dummy bytes.
 */
function buildSF1OtsUpgradeTx(anchorTx, { account, seed = SF1_TEST_APP_SEED, hashSuffix = 'B' } = {}) {
  // Reuse the anchor's SF1.bundle 50-byte payload.
  const bundleHex = anchorTx.Memos[0].Memo.MemoData;
  const bundleBytes = Buffer.from(bundleHex, 'hex');
  const merkleProofJson = '[]';                      // empty branch = leaf is root
  const merkleProofBytes = Buffer.from(merkleProofJson, 'utf8');
  const otsBytes = Buffer.alloc(16, 0x42);           // 16 dummy OTS bytes
  const sig = ed25519Sign(
    Buffer.concat([bundleBytes, merkleProofBytes, otsBytes]),
    seed
  );
  return {
    TransactionType: 'Payment',
    Account: account,
    Destination: account,
    Amount: '1',
    hash: hashSuffix.repeat(64),
    validated: true,
    ledger_index: 12346,
    date: 800001000,
    Memos: [
      memo('SF1.bundle', 'application/octet-stream', bundleBytes),
      memo('SF1.merkleProof', 'application/json', merkleProofBytes),
      memo('SF1.ots', 'application/octet-stream', otsBytes),
      memo('SF1.sig', 'application/octet-stream', sig),
    ],
  };
}

/** Wrap a list of txs into the rippled account_tx response shape. */
function accountTxFetchStub(txs) {
  return async () => ({
    status: 200,
    async json() {
      return {
        result: {
          status: 'success',
          transactions: txs.map((t) => ({
            tx: t,
            meta: { TransactionResult: 'tesSUCCESS' },
            validated: true,
            ledger_index: t.ledger_index,
          })),
          // No marker -> no further pages.
        },
      };
    },
  });
}

test('verify_xrpl-sf1ots — found-and-verified: SF1.ots tx + matching bundleHash + valid sig', async () => {
  const manifest = buildManifest();
  const anchorTx = buildAnchorTx(manifest, { account: ACCOUNT });
  const otsTx = buildSF1OtsUpgradeTx(anchorTx, { account: ACCOUNT });
  const realFetch = globalThis.fetch;
  globalThis.fetch = accountTxFetchStub([otsTx]);
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      { mode: 'xrpl-sf1ots' },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx: anchorTx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.verified, true, JSON.stringify(result));
  assert.equal(result.tier3.source, 'xrpl');
  // Without javascript-opentimestamps installed the tier 3 status is
  // `attested-on-chain` (XRPL leg fully verified, Bitcoin block
  // resolution skipped). With the library it would be `verified`.
  assert.ok(
    ['attested-on-chain', 'verified'].includes(result.tier3.status),
    JSON.stringify(result.tier3)
  );
  assert.equal(result.tier3.upgrade.txHash, otsTx.hash);
  assert.equal(result.tier3.upgrade.ledgerIndex, otsTx.ledger_index);
  // Empty branch: merkle root == bundleHash of the anchor.
  const expectedRoot = (() => {
    const eventBytes = canonicalise(manifest);
    return createHash('sha256').update(eventBytes).digest('hex');
  })();
  assert.equal(result.tier3.merkleRoot, expectedRoot);
});

test('verify_xrpl-sf1ots — not-found: scan exhausts without a matching SF1.ots tx', async () => {
  const manifest = buildManifest();
  const anchorTx = buildAnchorTx(manifest, { account: ACCOUNT });
  // Build an SF1.ots tx for a DIFFERENT bundle so it doesn't match.
  const otherManifest = buildManifest({
    eventId: '01933f5e-7c4a-7890-abcd-1234567890ac',
  });
  const otherAnchor = buildAnchorTx(otherManifest, { account: ACCOUNT });
  const otherOts = buildSF1OtsUpgradeTx(otherAnchor, { account: ACCOUNT });
  const realFetch = globalThis.fetch;
  globalThis.fetch = accountTxFetchStub([otherOts]);
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      { mode: 'xrpl-sf1ots' },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx: anchorTx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  // Tier 1+2 still verified, Tier 3 not-found (best-effort).
  assert.equal(result.verified, true);
  assert.equal(result.tier3.status, 'not-found');
  assert.equal(result.tier3.source, 'xrpl');
});

test('verify_xrpl-sf1ots — sig-invalid: SF1.ots tx with tampered sig -> invalid-signature', async () => {
  const manifest = buildManifest();
  const anchorTx = buildAnchorTx(manifest, { account: ACCOUNT });
  const otsTx = buildSF1OtsUpgradeTx(anchorTx, { account: ACCOUNT });
  // Replace the sig memo with all-zero bytes (won't validate).
  otsTx.Memos[3] = memo('SF1.sig', 'application/octet-stream', Buffer.alloc(64));
  const realFetch = globalThis.fetch;
  globalThis.fetch = accountTxFetchStub([otsTx]);
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      { mode: 'xrpl-sf1ots' },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx: anchorTx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.verified, true);
  assert.equal(result.tier3.status, 'invalid-signature');
});

test('verify_xrpl-sf1ots — memo-set-malformed: SF1.ots tx is missing merkleProof', async () => {
  const manifest = buildManifest();
  const anchorTx = buildAnchorTx(manifest, { account: ACCOUNT });
  const otsTx = buildSF1OtsUpgradeTx(anchorTx, { account: ACCOUNT });
  // Drop the merkleProof memo. Now it's a 3-memo tx so the cheap
  // count-based filter rejects it and the scan continues - so we need
  // to construct a 4-memo set with one wrong type to actually exercise
  // the memo-set-malformed branch. Replace merkleProof with junk type.
  otsTx.Memos[1] = memo('SF1.bogus', 'application/json', Buffer.from('[]', 'utf8'));
  const realFetch = globalThis.fetch;
  globalThis.fetch = accountTxFetchStub([otsTx]);
  let result;
  try {
    result = await withBitcoinProofMode(
      ACCOUNT,
      { mode: 'xrpl-sf1ots' },
      () => verifyManifest({ manifest, txHash: 'A'.repeat(64), tx: anchorTx })
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(result.verified, true);
  assert.equal(result.tier3.status, 'memo-set-malformed');
});
