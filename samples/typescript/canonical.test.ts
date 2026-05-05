/**
 * Round-trip golden test for the TypeScript anchor sample. (B9.5)
 *
 * Reads each vector listed in examples/test-vectors.json, builds the anchor
 * payload using buildAnchorPayload, and asserts the resulting bundleHash
 * matches the vector's published value. Proves the TS canonicaliser stays
 * byte-for-byte aligned with the reference implementation.
 *
 * Run via Node's built-in test runner:
 *     npx tsc --noEmit
 *     npx tsx --test canonical.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildAnchorPayload } from './anchor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = resolve(__dirname, '..', '..', 'examples');

interface Vector {
  manifest: string;
  bundleHash: string;
}

interface VectorFile {
  vectors: Vector[];
}

test('published bundleHash vectors match the TS canonicaliser', async () => {
  const vectorsText = await readFile(join(EXAMPLES, 'test-vectors.json'), 'utf8');
  const vf: VectorFile = JSON.parse(vectorsText);
  assert.ok(vf.vectors && vf.vectors.length > 0, 'test-vectors.json has no vectors');

  for (const v of vf.vectors) {
    const manifestText = await readFile(join(EXAMPLES, v.manifest), 'utf8');
    const manifest = JSON.parse(manifestText);
    const payload = buildAnchorPayload(manifest, null);
    assert.equal(
      payload.bundleHash,
      v.bundleHash,
      `bundleHash drift for ${v.manifest}: ` +
        `want ${v.bundleHash}, got ${payload.bundleHash}`
    );
  }
});
