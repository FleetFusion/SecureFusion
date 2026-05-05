import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { hashCanonical } from '../src/index.js';
import {
  encodeBundleMemo,
  decodeBundleMemo,
} from '../src/memo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLES = join(__dirname, '..', '..', 'examples');

test('canonical hashing of single-channel example is deterministic', async () => {
  const text = await readFile(join(EXAMPLES, 'single-channel-event.json'), 'utf8');
  const manifest = JSON.parse(text);
  const h1 = hashCanonical(manifest);
  const h2 = hashCanonical(manifest);
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test('canonical hashing of four-channel example is deterministic', async () => {
  const text = await readFile(join(EXAMPLES, 'four-channel-event.json'), 'utf8');
  const manifest = JSON.parse(text);
  const h1 = hashCanonical(manifest);
  const h2 = hashCanonical(manifest);
  assert.equal(h1, h2);
});

test('changing a single byte in the manifest changes the hash', async () => {
  const text = await readFile(join(EXAMPLES, 'single-channel-event.json'), 'utf8');
  const manifest = JSON.parse(text);

  const h1 = hashCanonical(manifest);

  // Mutate a string field that is in the v1 schema. (geo was dropped
  // in the v1 rewrite.)
  manifest.vehicleId = manifest.vehicleId + 'X';
  const h2 = hashCanonical(manifest);

  assert.notEqual(h1, h2);
});

test('roundtrip: encode bundle memo from example then decode', async () => {
  const text = await readFile(join(EXAMPLES, 'single-channel-event.json'), 'utf8');
  const manifest = JSON.parse(text);
  const bundleHash = hashCanonical(manifest);

  const encoded = encodeBundleMemo({
    bundleHash,
    eventId: manifest.eventId,
    ingestSourceCode: 1, // SecureFusion v1: single-value enum, always 0x01
    channelCount: manifest.channels.length,
  });

  const decoded = decodeBundleMemo(encoded);
  assert.equal(decoded.bundleHash, bundleHash);
  assert.equal(decoded.eventId, manifest.eventId);
  assert.equal(decoded.channelCount, 1);
});
