/**
 * Registry of published SecureFusion-compliant XRPL accounts.
 *
 * In production, this will be a signed JSON document published at a
 * well-known URL maintained by the standard's governance body. Each entry
 * lists an implementing organisation, its XRPL anchor account, its
 * application Ed25519 public key, the network it anchors on, the spec
 * version it implements, and an optional revocation timestamp.
 *
 * For v1.0 the registry is a bundled fixture. v1 has NO signed-registry
 * fetch and NO transparency log -- this is documented as a known limit
 * (joint-plan D10) and v2 will introduce a signed registry per separate
 * spec.
 *
 * Procedure for adding a new entry: see reference-verifier/README.md
 * (Registry section). Maintainer review required for every PR that
 * mutates this file.
 */

/**
 * @typedef {object} RegistryEntry
 * @property {string} organisation
 * @property {string} xrplAccount        r-prefixed XRPL classic address
 * @property {string} appPublicKey       64-char hex of 32-byte Ed25519 key
 * @property {"mainnet"|"testnet"} network  Ledger family this entry binds to.
 *                                          Verifier MUST refuse if the tx's
 *                                          network does not match (D5).
 * @property {string} specVersion        e.g. "SF1"
 * @property {string} certifiedAt        ISO 8601
 * @property {string|null} revokedAt     ISO 8601 or null. Verifier MUST
 *                                       treat any tx confirmed AFTER this
 *                                       timestamp as invalid; pre-revocation
 *                                       txs remain valid (D10).
 * @property {boolean} active
 * @property {"xrpl-sf1ots"|"https"|"none"} bitcoinProofMode
 *   Round-4 D12: how this provider exposes the Bitcoin (Tier-3) proof.
 *     - "xrpl-sf1ots": the provider publishes a per-event SF1.ots upgrade
 *       transaction to XRPL (FleetFusion default — fully trustless).
 *     - "https": the provider exposes the OTS proof + Merkle branch via
 *       a documented HTTPS URL pattern (see `bitcoinProofUrlTemplate`).
 *       Cryptographic verification still runs locally; trust degrades to
 *       "trust the issuer's HTTPS endpoint".
 *     - "none": the provider does NOT offer a Bitcoin tier. Tier-1 (XRPL)
 *       and Tier-2 (Ed25519) still apply; the verifier surfaces a
 *       "not provided" Tier-3 result rather than failing.
 * @property {string} [bitcoinProofUrlTemplate]
 *   Required iff `bitcoinProofMode === "https"`, otherwise omitted.
 *   HTTPS URL template with `{eventId}` and `{bundleHash}` placeholders.
 *   See SPEC §9.4 for the full grammar and response shape.
 */

/** @type {RegistryEntry[]} */
const STATIC_REGISTRY = [
  // Bundled testnet entry. Used by conformance vectors signed with the
  // deterministic public test seed (joint-plan D11, bytes 0x00..0x1F).
  // The xrplAccount is a TESTNET account -- never use this entry on mainnet.
  {
    organisation: 'FleetFusion (TESTNET -- DEMO ONLY)',
    // The conformance fixtures in conformance/vectors/ all anchor at this
    // demo testnet account. It is NOT a real funded XRPL account; the
    // value is symbolic and pinned so the conformance vectors verify
    // against a registered entry without further configuration.
    xrplAccount: 'rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx',
    // Ed25519 public key derived from SF1_TEST_APP_SEED = bytes 0x00..0x1F
    // (joint-plan D11). The test in tests/verify.test.js recomputes this
    // from the seed at runtime and asserts equality. Schema dev's S9
    // conformance/README.md publishes the same value as the canonical
    // record; if it drifts, fix the registry, not the test.
    appPublicKey:
      '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8',
    network: 'testnet',
    specVersion: 'SF1',
    certifiedAt: '2026-05-04T00:00:00.000Z',
    revokedAt: null,
    active: true,
    // Round-4 D12: FleetFusion's bundled testnet entry publishes per-event
    // SF1.ots upgrade transactions to XRPL (the trustless default mode).
    bitcoinProofMode: 'xrpl-sf1ots',
    // bitcoinProofUrlTemplate intentionally omitted — only meaningful when
    // bitcoinProofMode === "https".
  },
];

/**
 * Find an active registry entry by XRPL account address.
 *
 * The returned entry surfaces `network` and `revokedAt` so the verifier
 * (verifyManifest) can enforce both the network discriminator (D5) and
 * the revocation rule (D10).
 *
 * @param {string} xrplAccount
 * @returns {RegistryEntry | undefined}
 */
export function findByAccount(xrplAccount) {
  return STATIC_REGISTRY.find(
    (e) => e.xrplAccount === xrplAccount && e.active
  );
}

/**
 * Returns a copy of the full registry (active entries only).
 *
 * @returns {RegistryEntry[]}
 */
export function listActive() {
  return STATIC_REGISTRY.filter((e) => e.active).map((e) => ({ ...e }));
}
