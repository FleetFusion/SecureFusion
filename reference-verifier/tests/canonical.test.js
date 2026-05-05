import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalise, canonicaliseToString } from '../src/canonical.js';

test('canonicalise sorts object keys', () => {
  const got = canonicaliseToString({ b: 1, a: 2, c: 3 });
  assert.equal(got, '{"a":2,"b":1,"c":3}');
});

test('canonicalise sorts nested keys', () => {
  const got = canonicaliseToString({ outer: { z: 1, a: 2 } });
  assert.equal(got, '{"outer":{"a":2,"z":1}}');
});

test('canonicalise produces no whitespace', () => {
  const got = canonicaliseToString({ a: [1, 2, 3] });
  assert.equal(got, '{"a":[1,2,3]}');
});

test('canonicalise preserves array order', () => {
  const got = canonicaliseToString([3, 1, 2]);
  assert.equal(got, '[3,1,2]');
});

test('canonicalise serialises booleans and null', () => {
  assert.equal(canonicaliseToString(true), 'true');
  assert.equal(canonicaliseToString(false), 'false');
  assert.equal(canonicaliseToString(null), 'null');
});

test('canonicalise serialises integers without decimals', () => {
  assert.equal(canonicaliseToString(42), '42');
  assert.equal(canonicaliseToString(-7), '-7');
  assert.equal(canonicaliseToString(0), '0');
});

test('canonicalise escapes string special characters', () => {
  assert.equal(canonicaliseToString('a"b'), '"a\\"b"');
  assert.equal(canonicaliseToString('a\\b'), '"a\\\\b"');
  assert.equal(canonicaliseToString('a\nb'), '"a\\nb"');
});

test('canonicalise does NOT drop underscore-prefixed keys (B1, joint-plan D2)', () => {
  // Tamper-evidence: every key in the manifest contributes to the hash.
  // An object with an extra _x key MUST hash differently from one without.
  const withUnderscore = canonicaliseToString({ _x: 1, a: 2 });
  const withoutUnderscore = canonicaliseToString({ a: 2 });
  assert.equal(withUnderscore, '{"_x":1,"a":2}');
  assert.equal(withoutUnderscore, '{"a":2}');
  assert.notEqual(withUnderscore, withoutUnderscore);
});

test('canonicalise: objects with and without _-prefixed keys hash differently', async () => {
  const { sha256Hex } = await import('../src/hash.js');
  const a = sha256Hex(canonicaliseToString({ _x: 1, a: 2 }));
  const b = sha256Hex(canonicaliseToString({ a: 2 }));
  assert.notEqual(a, b);
});

test('canonicalise returns UTF-8 bytes', () => {
  const bytes = canonicalise({ a: 1 });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).toString('utf8'), '{"a":1}');
});

test('canonicalise produces stable output regardless of input key order', () => {
  const a = canonicaliseToString({ z: 1, a: 2, m: 3 });
  const b = canonicaliseToString({ a: 2, m: 3, z: 1 });
  const c = canonicaliseToString({ m: 3, z: 1, a: 2 });
  assert.equal(a, b);
  assert.equal(b, c);
});

// --- B1.5: byte-equality test against the published vector --------------

test('B1.5: single-channel manifest hashes to the published bundleHash', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');
  const { sha256Hex } = await import('../src/hash.js');

  const here = dirname(fileURLToPath(import.meta.url));
  const examples = join(here, '..', '..', 'examples');
  const manifest = JSON.parse(
    await readFile(join(examples, 'single-channel-event.json'), 'utf8')
  );
  const vectors = JSON.parse(
    await readFile(join(examples, 'test-vectors.json'), 'utf8')
  );
  const expected = vectors.vectors.find(
    (v) => v.manifest === 'single-channel-event.json'
  ).bundleHash;

  const got = sha256Hex(canonicalise(manifest));
  assert.equal(
    got,
    expected,
    `bundleHash drift: examples/test-vectors.json says ${expected}, ` +
      `verifier produces ${got}`
  );
});

test('B1.5 (negative): manifest with disallowed ingestSource is rejected by the schema', async () => {
  const { validateManifest } = await import('../src/manifest.js');
  // ingestSource enum in v1 is exactly ["fleetfusion"] (single-value).
  // Any other string — including legacy "FleetLive" / "FTCloud" — is invalid.
  const bad = {
    channels: [
      {
        channelId: 'front',
        sha256:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sizeBytes: 1,
      },
    ],
    eventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    ingestSource: 'FleetLive', // bad — legacy Pascal name no longer in the enum
    ingestedAt: '2026-04-30T12:35:02.123Z',
    occurredAt: '2026-04-30T12:34:56.000Z',
    sealedAt: '2026-04-30T12:35:03.000Z',
    v: 1,
    vehicleEventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    vehicleId: 'vh_HX24ABC',
  };
  const result = validateManifest(bad);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'manifest-schema-invalid');
});
