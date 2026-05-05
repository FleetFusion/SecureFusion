import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, sha256File, sha256Bytes } from '../src/hash.js';

test('sha256Hex matches a known SHA-256', () => {
  // SHA-256 of empty string
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('sha256Hex of "abc"', () => {
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('sha256Bytes returns a 32-byte buffer', () => {
  const out = sha256Bytes('abc');
  assert.equal(out.length, 32);
});

test('sha256File hashes a file consistently with sha256Hex', async () => {
  const path = join(tmpdir(), `sf-test-${Date.now()}.bin`);
  const data = Buffer.from('the quick brown fox jumps over the lazy dog');
  await writeFile(path, data);
  try {
    const fileHash = await sha256File(path);
    const bufHash = sha256Hex(data);
    assert.equal(fileHash, bufHash);
  } finally {
    await unlink(path);
  }
});
