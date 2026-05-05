/**
 * Verifier type contracts.
 *
 * Phase C UI components import EXCLUSIVELY from this file. Once Phase B
 * lands these types must remain backwards-compatible — adding fields is
 * allowed, breaking renames are not. Treat the file as the seam between
 * the verification core (in `core/`) and the UI shell (in `ui/`).
 *
 * Mutability: every field is `readonly` so a UI component cannot
 * accidentally mutate a result it received.
 */

import type {
  BitcoinProofMode,
  Network,
  RegistryEntry,
} from './verifier/registry';

// Re-export the registry shapes so Phase C only ever needs to import
// from `verifier-types`.
export type { BitcoinProofMode, Network, RegistryEntry };

/** Tier-1: a channel sha256 matches an SF1.bundle on-chain anchor. */
export type Tier1Status =
  | 'verified'      // channel sha matched an anchor; bundle hash agrees
  | 'not-found'     // no anchor tx contains this channel sha
  | 'invalid'       // anchor found but bundle-hash mismatch / tampered
  | 'pending';      // scan in progress (intermediate UI state)

/** Tier-2: SF1.sig over (bundle || event) verifies under platform key. */
export type Tier2Status =
  | 'verified'
  | 'not-found'        // happens only when Tier-1 was not-found
  | 'invalid'          // signature did not verify
  | 'not-applicable'   // Tier-1 failed first
  | 'pending';

/** Tier-3: Bitcoin attestation via SF1.ots upgrade or HTTPS proof. */
export type Tier3Status =
  | 'verified'           // OTS proof resolved to a Bitcoin block
  | 'attested-on-chain'  // SF1.ots upgrade exists + sig valid; OTS deferred
  | 'verified-via-https' // HTTPS proof returned + signature checks pending UI
  | 'not-provided'       // registry entry's bitcoinProofMode === 'none'
  | 'not-found'          // proof mode = xrpl-sf1ots but no upgrade tx found
  | 'not-applicable'     // Tier-1 / Tier-2 failed first
  | 'invalid'            // merkle / signature failure on the OTS upgrade
  | 'pending';

export interface MerkleProofStep {
  /** 'L' means sibling on the LEFT of the running hash; 'R' on the right. */
  readonly side: 'L' | 'R';
  /** 64-char lowercase hex of the sibling node. */
  readonly hash: string;
}

export interface BitcoinAttestation {
  readonly blockHeight: number;
  readonly blockTimeUtc: string | null;
}

export interface AnchorRef {
  /** XRPL transaction hash of the original 3-memo anchor. */
  readonly txHash: string;
  readonly ledgerIndex: number;
  /** ISO 8601 string of the validated ledger close time, or null. */
  readonly ledgerCloseTimeUtc: string | null;
  /** Account that signed the anchor — the registry key cross-reference. */
  readonly account: string;
  /** Network the anchor is on (must match the verifier's expected network). */
  readonly network: Network;
}

export interface Tier1Result {
  readonly status: Tier1Status;
  readonly reason?: string;
  /** Present on `verified`. */
  readonly anchor?: AnchorRef;
  /** sha256 hex of the channel that matched (lowercase). */
  readonly matchedChannelSha?: string;
  /** Expected vs computed bundle hash on `invalid`. */
  readonly bundleHashExpected?: string;
  readonly bundleHashActual?: string;
}

export interface Tier2Result {
  readonly status: Tier2Status;
  readonly reason?: string;
  /** keyId from the manifest's `signerKeyId` field. */
  readonly signerKeyId?: string;
  /** Hex of the public key that verified (or would have verified). */
  readonly publicKey?: string;
}

export interface Tier3Result {
  readonly status: Tier3Status;
  readonly reason?: string;
  /** Reflects the registry entry's bitcoinProofMode for forensics. */
  readonly bitcoinProofMode?: BitcoinProofMode;
  /** XRPL upgrade tx if dispatch landed on `xrpl-sf1ots`. */
  readonly upgrade?: { readonly txHash: string; readonly ledgerIndex: number };
  /** Reapplied Merkle root (lowercase hex64). */
  readonly merkleRoot?: string;
  /** Bitcoin block + timestamp on `verified`. */
  readonly bitcoin?: BitcoinAttestation;
}

/** Streaming progress events emitted while verification is in flight. */
export type VerificationProgress =
  | { readonly kind: 'hashing'; readonly fileSize: number; readonly fraction: number }
  | { readonly kind: 'cache-hit'; readonly channelSha: string }
  | {
      readonly kind: 'scanning';
      readonly ledgersWalked: number;
      readonly txsDecoded: number;
      readonly cursor: number;
    }
  | { readonly kind: 'tier1'; readonly result: Tier1Result }
  | { readonly kind: 'tier2'; readonly result: Tier2Result }
  | { readonly kind: 'tier3'; readonly result: Tier3Result };

/** Mirror of `VerificationProgress.kind` for typed scan progress UI. */
export interface ScanProgress {
  readonly ledgersWalked: number;
  readonly txsDecoded: number;
  readonly cursor: number;
}

/** Final result emitted on the same observable's completion frame. */
export interface VerificationResult {
  readonly fileName: string;
  readonly fileSizeBytes: number;
  readonly fileSha256: string;
  readonly tier1: Tier1Result;
  readonly tier2: Tier2Result;
  readonly tier3: Tier3Result;
  /** Decoded SF1.event manifest, when Tier-1 verified. */
  readonly manifest?: Readonly<Record<string, unknown>>;
  /** Wall-clock ms the orchestrator spent end-to-end. */
  readonly elapsedMs: number;
}

/** Discriminated union the Phase C UI subscribes to. */
export type VerificationEvent =
  | (VerificationProgress & { readonly type: 'progress' })
  | (VerificationResult & { readonly type: 'result' });

export interface VerifyOptions {
  readonly file: File | Blob;
  /** Display name. Defaults to `file.name` for File, 'blob' otherwise. */
  readonly fileName?: string;
  /** Trust anchor bundle, typically loaded via `loadTrustAnchors`. */
  readonly trustAnchorBundle: {
    readonly xrplAccount: string;
    readonly registry: readonly RegistryEntry[];
  };
  /** rippled JSON-RPC URL — defaults to xrplcluster.com. */
  readonly rippledUrl?: string;
  /** OTS calendar URL — defaults to btc.calendar.opentimestamps.org. */
  readonly otsCalendarUrl?: string;
  /** Force a full rescan; equivalent to `purgeScanCache` then verify. */
  readonly forceRescan?: boolean;
  /** Cancellation. */
  readonly signal?: AbortSignal;
}
