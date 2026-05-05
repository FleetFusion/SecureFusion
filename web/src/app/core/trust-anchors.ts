/**
 * Trust-anchor loader.
 *
 * The SPA bundles the FleetFusion testnet trust anchor in
 * `assets/trust-anchors/platform-account.json` plus per-key files in
 * `assets/trust-anchors/keys/<keyId>.json`. The loader fetches them
 * at runtime so the user can swap the URL via the settings cog
 * (Phase C Task 11) without rebuilding the SPA.
 *
 * Loaded payloads are validated structurally before they reach the
 * verifier — a malformed registry would otherwise fail with confusing
 * runtime errors deep inside the verify pipeline.
 */

import type { BitcoinProofMode, Network, RegistryEntry } from './verifier/registry';

export interface TrustAnchorBundle {
  /** r-prefixed XRPL classic address of the platform account. */
  readonly xrplAccount: string;
  readonly network: Network;
  readonly specVersion: string;
  readonly bitcoinProofMode: BitcoinProofMode;
  readonly registry: readonly RegistryEntry[];
}

export interface PlatformKey {
  readonly keyId: string;
  readonly publicKey: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly retiredReason: string | null;
}

const ALLOWED_BITCOIN_MODES: ReadonlySet<BitcoinProofMode> = new Set([
  'xrpl-sf1ots',
  'https',
  'none',
]);

/**
 * Load the bundled trust-anchor file. `baseUrl` should end with '/';
 * defaults to '/assets/trust-anchors/' (the location used by the
 * SPA's `assets` build configuration).
 */
export async function loadTrustAnchors(
  baseUrl = '/assets/trust-anchors/',
): Promise<TrustAnchorBundle> {
  const url = new URL('platform-account.json', new URL(baseUrl, location.origin)).toString();
  const resp = await fetch(url, { redirect: 'manual' });
  if (resp.status !== 200) {
    throw new Error(`trust-anchor fetch failed: HTTP ${resp.status} from ${url}`);
  }
  const body = (await resp.json()) as Partial<TrustAnchorBundle> & Record<string, unknown>;
  return validateBundle(body);
}

/**
 * Look up a platform key by id. The verifier dereferences
 * `manifest.signerKeyId` through this helper so a key rotation only
 * requires dropping a new JSON file under `keys/`.
 */
export async function lookupKey(
  keyId: string,
  baseUrl = '/assets/trust-anchors/',
): Promise<PlatformKey> {
  if (!/^[A-Za-z0-9._-]+$/.test(keyId)) {
    throw new Error(`lookupKey: keyId must match [A-Za-z0-9._-]+, got ${keyId}`);
  }
  const url = new URL(
    `keys/${keyId}.json`,
    new URL(baseUrl, location.origin),
  ).toString();
  const resp = await fetch(url, { redirect: 'manual' });
  if (resp.status !== 200) {
    throw new Error(`platform-key fetch failed: HTTP ${resp.status} from ${url}`);
  }
  const body = (await resp.json()) as Partial<PlatformKey>;
  return validateKey(body, keyId);
}

function validateBundle(body: Partial<TrustAnchorBundle> & Record<string, unknown>): TrustAnchorBundle {
  if (!body || typeof body !== 'object') {
    throw new Error('trust-anchor: response is not an object');
  }
  if (typeof body.xrplAccount !== 'string' || !body.xrplAccount.startsWith('r')) {
    throw new Error('trust-anchor: xrplAccount missing or not r-prefixed');
  }
  if (body.network !== 'mainnet' && body.network !== 'testnet') {
    throw new Error('trust-anchor: network must be mainnet|testnet');
  }
  if (typeof body.specVersion !== 'string' || body.specVersion.length === 0) {
    throw new Error('trust-anchor: specVersion missing');
  }
  if (!ALLOWED_BITCOIN_MODES.has(body.bitcoinProofMode as BitcoinProofMode)) {
    throw new Error(
      `trust-anchor: bitcoinProofMode must be one of xrpl-sf1ots|https|none, got ${String(body.bitcoinProofMode)}`,
    );
  }
  if (!Array.isArray(body.registry)) {
    throw new Error('trust-anchor: registry array missing');
  }
  for (const e of body.registry) {
    validateRegistryEntry(e);
    if (e.xrplAccount !== body.xrplAccount) {
      throw new Error(
        'trust-anchor: registry entry account does not match top-level xrplAccount',
      );
    }
  }
  return {
    xrplAccount: body.xrplAccount,
    network: body.network,
    specVersion: body.specVersion,
    bitcoinProofMode: body.bitcoinProofMode as BitcoinProofMode,
    registry: body.registry as readonly RegistryEntry[],
  };
}

function validateRegistryEntry(e: unknown): asserts e is RegistryEntry {
  if (!e || typeof e !== 'object') {
    throw new Error('trust-anchor: registry entry is not an object');
  }
  const r = e as Record<string, unknown>;
  if (typeof r['organisation'] !== 'string') {
    throw new Error('trust-anchor: registry entry missing organisation');
  }
  if (typeof r['xrplAccount'] !== 'string' || !(r['xrplAccount'] as string).startsWith('r')) {
    throw new Error('trust-anchor: registry entry missing r-prefixed xrplAccount');
  }
  if (typeof r['appPublicKey'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['appPublicKey'] as string)) {
    throw new Error('trust-anchor: registry entry appPublicKey must be 64 lowercase hex chars');
  }
  if (r['network'] !== 'mainnet' && r['network'] !== 'testnet') {
    throw new Error('trust-anchor: registry entry network must be mainnet|testnet');
  }
  if (typeof r['specVersion'] !== 'string') {
    throw new Error('trust-anchor: registry entry missing specVersion');
  }
  if (typeof r['certifiedAt'] !== 'string') {
    throw new Error('trust-anchor: registry entry missing certifiedAt');
  }
  if (r['revokedAt'] !== null && typeof r['revokedAt'] !== 'string') {
    throw new Error('trust-anchor: registry entry revokedAt must be string|null');
  }
  if (typeof r['active'] !== 'boolean') {
    throw new Error('trust-anchor: registry entry missing active boolean');
  }
  if (!ALLOWED_BITCOIN_MODES.has(r['bitcoinProofMode'] as BitcoinProofMode)) {
    throw new Error(
      `trust-anchor: registry entry bitcoinProofMode invalid: ${String(r['bitcoinProofMode'])}`,
    );
  }
  if (
    r['bitcoinProofMode'] === 'https' &&
    (typeof r['bitcoinProofUrlTemplate'] !== 'string' ||
      !(r['bitcoinProofUrlTemplate'] as string).startsWith('https://'))
  ) {
    throw new Error(
      'trust-anchor: registry entry with bitcoinProofMode=https must include bitcoinProofUrlTemplate (https://...)',
    );
  }
}

function validateKey(body: Partial<PlatformKey>, expectedKeyId: string): PlatformKey {
  if (!body || typeof body !== 'object') {
    throw new Error('platform-key: response is not an object');
  }
  if (body.keyId !== expectedKeyId) {
    throw new Error(`platform-key: keyId mismatch (expected ${expectedKeyId}, got ${body.keyId})`);
  }
  if (typeof body.publicKey !== 'string' || !/^[0-9a-f]{64}$/.test(body.publicKey)) {
    throw new Error('platform-key: publicKey must be 64 lowercase hex chars');
  }
  if (typeof body.validFrom !== 'string') {
    throw new Error('platform-key: validFrom missing');
  }
  if (body.validUntil !== null && typeof body.validUntil !== 'string') {
    throw new Error('platform-key: validUntil must be string|null');
  }
  if (body.retiredReason !== null && typeof body.retiredReason !== 'string') {
    throw new Error('platform-key: retiredReason must be string|null');
  }
  return {
    keyId: body.keyId,
    publicKey: body.publicKey,
    validFrom: body.validFrom,
    validUntil: body.validUntil ?? null,
    retiredReason: body.retiredReason ?? null,
  };
}
