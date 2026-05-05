import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hashCanonical } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(__dirname, '..', '..', 'examples');

test('test vectors match published bundleHashes', async () => {
  const vectorsText = await readFile(join(EXAMPLES, 'test-vectors.json'), 'utf8');
  const vectors = JSON.parse(vectorsText).vectors;

  for (const vector of vectors) {
    const manifestText = await readFile(join(EXAMPLES, vector.manifest), 'utf8');
    const manifest = JSON.parse(manifestText);
    const computed = hashCanonical(manifest);
    assert.equal(
      computed,
      vector.bundleHash,
      `bundleHash drift for ${vector.manifest}: vectors file says ${vector.bundleHash}, verifier produces ${computed}`
    );
  }
});
