/**
 * Tests for the vendored canonicaliser.
 *
 * The first block exercises the per-rule unit cases ported from
 * `reference-verifier/tests/canonical.test.js`.
 *
 * The second block is the byte-equivalence regression: it hashes the
 * canonical bytes of the conformance vectors in
 * `securefusion/conformance/vectors/v1-*.manifest.json` (inlined here
 * verbatim) and compares against the published bundleHash values in
 * `securefusion/examples/test-vectors.json`. Any divergence is a hard
 * fail — the SPA's canonicaliser MUST produce identical UTF-8 bytes
 * to the Node reference for every fixture, otherwise Tier-1 verification
 * would silently disagree with on-chain anchors.
 */

import { canonicalise, canonicaliseToString } from './canonical';
import { bytesToHex } from './bytes';

describe('canonicalise', () => {
  it('sorts object keys lexicographically', () => {
    expect(canonicaliseToString({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('emits booleans, null, integers verbatim', () => {
    expect(canonicaliseToString({ x: true, y: false, z: null, n: 7 }))
      .toBe('{"n":7,"x":true,"y":false,"z":null}');
  });

  it('escapes control characters in strings', () => {
    expect(canonicaliseToString({ s: 'a\nb' })).toBe('{"s":"a\\nb"}');
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicaliseToString({ n: Number.NaN })).toThrow();
    expect(() => canonicaliseToString({ n: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('returns a Uint8Array of UTF-8 bytes from canonicalise()', () => {
    const out = canonicalise({ a: 1 });
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(out)).toBe('{"a":1}');
  });

  it('canonicalises arrays in source order (no key sort applies)', () => {
    expect(canonicaliseToString([3, 1, 2])).toBe('[3,1,2]');
  });
});

// -----------------------------------------------------------------------------
// Byte-equivalence regression vs the conformance vectors. The two manifests
// below are copied verbatim from
//   securefusion/conformance/vectors/v1-single-channel.manifest.json
//   securefusion/conformance/vectors/v1-multi-channel.manifest.json
// (which are byte-identical to the matching examples/*.json — see git diff).
// The expected bundleHash values come from
//   securefusion/examples/test-vectors.json
// Treat any divergence as a hard fail of Task 3 — fix before continuing.
// -----------------------------------------------------------------------------

const V1_SINGLE_CHANNEL = {
  channels: [
    {
      capturedAt: '2026-04-30T12:34:56.000Z',
      channelId: 'front',
      durationMs: 12000,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sizeBytes: 8421376,
    },
  ],
  eventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
  ingestSource: 'fleetfusion',
  ingestedAt: '2026-04-30T12:35:02.123Z',
  occurredAt: '2026-04-30T12:34:56.000Z',
  sealedAt: '2026-04-30T12:35:05.456Z',
  signerKeyId: 'platform-2026-04',
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  v: 1,
  vehicleEventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
  vehicleId: '11111111-2222-3333-4444-555555555555',
};

const V1_MULTI_CHANNEL = {
  channels: [
    {
      capturedAt: '2026-04-30T15:22:18.000Z',
      channelId: 'cabin',
      durationMs: 30000,
      sha256: '5994471abb01112afcc18159f6cc74b4f511b99806da59b3caf5a9c173cacfc5',
      sizeBytes: 5242880,
    },
    {
      capturedAt: '2026-04-30T15:22:18.000Z',
      channelId: 'front',
      durationMs: 30000,
      sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      sizeBytes: 12582912,
    },
    {
      capturedAt: '2026-04-30T15:22:18.000Z',
      channelId: 'left',
      durationMs: 30000,
      sha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      sizeBytes: 7340032,
    },
    {
      capturedAt: '2026-04-30T15:22:18.000Z',
      channelId: 'right',
      durationMs: 30000,
      sha256: '7d793037a0760186574b0282f2f435e7d09c2ab37c47b1e5e9cd2f3b3f8a8b21',
      sizeBytes: 7340032,
    },
  ],
  eventId: '0193bc7d-9e42-7abc-89de-0123456789ab',
  ingestSource: 'fleetfusion',
  ingestedAt: '2026-04-30T15:22:31.847Z',
  occurredAt: '2026-04-30T15:22:18.000Z',
  sealedAt: '2026-04-30T15:22:35.012Z',
  signerKeyId: 'platform-2026-04',
  tenantId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  v: 1,
  vehicleEventId: '0193bc7d-9e42-7abc-89de-0123456789ab',
  vehicleId: '22222222-3333-4444-5555-666666666666',
};

// Authoritative bundleHash values from examples/test-vectors.json.
const EXPECTED_SINGLE_CHANNEL_HASH =
  'e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05';
const EXPECTED_SINGLE_CHANNEL_LENGTH = 583;
const EXPECTED_MULTI_CHANNEL_HASH =
  '8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb';
const EXPECTED_MULTI_CHANNEL_LENGTH = 1114;

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

describe('canonicalise byte-equivalence vs conformance vectors', () => {
  it('matches the published bundleHash for v1-single-channel.manifest.json', async () => {
    const bytes = canonicalise(V1_SINGLE_CHANNEL);
    expect(bytes.length).toBe(EXPECTED_SINGLE_CHANNEL_LENGTH);
    const hex = await sha256Hex(bytes);
    expect(hex).toBe(EXPECTED_SINGLE_CHANNEL_HASH);
  });

  it('matches the published bundleHash for v1-multi-channel.manifest.json', async () => {
    const bytes = canonicalise(V1_MULTI_CHANNEL);
    expect(bytes.length).toBe(EXPECTED_MULTI_CHANNEL_LENGTH);
    const hex = await sha256Hex(bytes);
    expect(hex).toBe(EXPECTED_MULTI_CHANNEL_HASH);
  });
});
