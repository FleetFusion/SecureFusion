/**
 * Registry of published SecureFusion-compliant XRPL accounts.
 *
 * Vendored TypeScript port of `reference-verifier/src/registry.js`.
 * See `SOURCE.md` for the upstream commit hash.
 *
 * Unlike the Node version (which closes over a STATIC_REGISTRY
 * constant), the SPA loads the registry from `assets/trust-anchors/`
 * at runtime so users can repoint at an alternate URL. The lookup
 * helpers therefore take the registry as a parameter.
 */

export type Network = 'mainnet' | 'testnet';
export type BitcoinProofMode = 'xrpl-sf1ots' | 'https' | 'none';

export interface RegistryEntry {
  /** Human-readable organisation name. */
  readonly organisation: string;
  /** r-prefixed XRPL classic address. */
  readonly xrplAccount: string;
  /** 64-char hex of 32-byte Ed25519 application public key. */
  readonly appPublicKey: string;
  /**
   * Ledger family this entry binds to. Verifier MUST refuse if the
   * tx's network does not match (D5).
   */
  readonly network: Network;
  /** e.g. "SF1". */
  readonly specVersion: string;
  /** ISO 8601 timestamp the entry was certified. */
  readonly certifiedAt: string;
  /**
   * ISO 8601 or null. Verifier MUST treat any tx confirmed AFTER this
   * timestamp as invalid; pre-revocation txs remain valid (D10).
   */
  readonly revokedAt: string | null;
  readonly active: boolean;
  /**
   * Round-4 D12: how this provider exposes the Bitcoin (Tier-3) proof.
   *   - "xrpl-sf1ots": SF1.ots upgrade transaction on XRPL (default,
   *     fully trustless).
   *   - "https": OTS proof + Merkle branch via documented HTTPS URL
   *     (see `bitcoinProofUrlTemplate`). Crypto verify still local;
   *     trust degrades to "trust the issuer's HTTPS endpoint".
   *   - "none": Tier-3 not provided. Tier-1+2 still apply.
   */
  readonly bitcoinProofMode: BitcoinProofMode;
  /**
   * Required iff `bitcoinProofMode === "https"`, otherwise omitted.
   * URL template with `{eventId}` and `{bundleHash}` placeholders.
   * See SPEC §9.4.
   */
  readonly bitcoinProofUrlTemplate?: string;
}

/**
 * Find an active registry entry by XRPL account address.
 *
 * The returned entry surfaces `network` and `revokedAt` so the
 * verifier (verifyManifest) can enforce both the network discriminator
 * (D5) and the revocation rule (D10).
 *
 * @param xrplAccount r-prefixed XRPL classic address
 * @param registry    array of registry entries (typically loaded from
 *                    assets/trust-anchors/platform-account.json)
 */
export function findByAccount(
  xrplAccount: string,
  registry: readonly RegistryEntry[],
): RegistryEntry | undefined {
  return registry.find((e) => e.xrplAccount === xrplAccount && e.active);
}

/**
 * Returns a copy of the supplied registry filtered to active entries
 * only.
 */
export function listActive(registry: readonly RegistryEntry[]): RegistryEntry[] {
  return registry.filter((e) => e.active).map((e) => ({ ...e }));
}
