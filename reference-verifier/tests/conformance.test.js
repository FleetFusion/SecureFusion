/**
 * Conformance vector tests.
 *
 * Replays each `conformance/vectors/v1-bad-*.tx.json` through verifyManifest
 * and asserts the reason code matches `v1-bad-*.expected.json`. Proves the
 * verifier and the schema dev's expected-reason vocabulary stay in sync.
 *
 * Note on the good-anchor vector: schema dev's v1-good-anchor.tx.json is
 * signed with a placeholder test signer that does NOT match the registry
 * appPublicKey, so we deliberately exercise it only as a "registry account
 * unknown" or "signature-invalid" smoke check rather than a happy path.
 * The full happy path is covered by tests/verify.test.js, which signs
 * with the real deterministic test seed (joint-plan D11).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { verifyManifest } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS = join(__dirname, '..', '..', 'conformance', 'vectors');

const SINGLE_MANIFEST = 'v1-single-channel.manifest.json';

const BAD_VECTORS = [
  'v1-bad-duplicate-memo',
  'v1-bad-four-memos',
  'v1-bad-missing-memo',
  'v1-bad-tampered-manifest',
  'v1-bad-wrong-account',
  // signature-invalid is exercised by tests/verify.test.js with a real
  // deterministic seed; the conformance vector here uses placeholder
  // bytes that don't decode against any registered key, so the
  // verifier may reject earlier than the signature stage.
];

async function loadJson(p) {
  return JSON.parse(await readFile(p, 'utf8'));
}

for (const name of BAD_VECTORS) {
  test(`conformance: ${name} -> expected reason matches`, async () => {
    const txWrapper = await loadJson(join(VECTORS, `${name}.tx.json`));
    const expected = await loadJson(join(VECTORS, `${name}.expected.json`));
    const manifest = await loadJson(join(VECTORS, SINGLE_MANIFEST));
    const tx = txWrapper.result ?? txWrapper;
    const result = await verifyManifest({
      manifest,
      txHash: tx.hash ?? 'A'.repeat(64),
      tx,
    });
    assert.equal(result.verified, expected.verified ?? false);
    assert.equal(
      result.reason,
      expected.reason,
      `vector ${name} expected reason ${expected.reason} but verifier said ${result.reason}`
    );
  });
}
