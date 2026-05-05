import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBundleMemo,
  decodeBundleMemo,
  buildMemos,
  extractMemos,
  extractMemosResult,
  extractOtsUpgradeMemos,
} from '../src/memo.js';

function strHex(s) {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase();
}

function memo(type, format, dataHex) {
  return { Memo: { MemoType: strHex(type), MemoFormat: strHex(format), MemoData: dataHex } };
}

const goodMemos = () =>
  buildMemos({
    bundleBytes: Buffer.alloc(50, 0xab),
    eventBytes: Buffer.from('{"a":1}'),
    signature: Buffer.alloc(64, 0xcd),
  });

const VALID_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VALID_UUID = '01933f5e-7c4a-7890-abcd-1234567890ab';

test('encodeBundleMemo produces 50 bytes', () => {
  const buf = encodeBundleMemo({
    bundleHash: VALID_HASH,
    eventId: VALID_UUID,
    ingestSourceCode: 1,
    channelCount: 4,
  });
  assert.equal(buf.length, 50);
});

test('encodeBundleMemo and decodeBundleMemo are inverses', () => {
  const original = {
    bundleHash: VALID_HASH,
    eventId: VALID_UUID,
    ingestSourceCode: 2,
    channelCount: 4,
  };
  const encoded = encodeBundleMemo(original);
  const decoded = decodeBundleMemo(encoded);
  assert.deepEqual(decoded, original);
});

test('encodeBundleMemo rejects invalid bundleHash', () => {
  assert.throws(() =>
    encodeBundleMemo({
      bundleHash: 'short',
      eventId: VALID_UUID,
      ingestSourceCode: 1,
      channelCount: 1,
    })
  );
});

test('encodeBundleMemo rejects invalid eventId', () => {
  assert.throws(() =>
    encodeBundleMemo({
      bundleHash: VALID_HASH,
      eventId: 'not-a-uuid',
      ingestSourceCode: 1,
      channelCount: 1,
    })
  );
});

test('encodeBundleMemo rejects out-of-range ingestSourceCode', () => {
  assert.throws(() =>
    encodeBundleMemo({
      bundleHash: VALID_HASH,
      eventId: VALID_UUID,
      ingestSourceCode: 0,
      channelCount: 1,
    })
  );
});

test('decodeBundleMemo rejects wrong byte length', () => {
  assert.throws(() => decodeBundleMemo(Buffer.alloc(49)));
});

test('buildMemos uses correct MemoType encodings', () => {
  const memos = buildMemos({
    bundleBytes: Buffer.alloc(50),
    eventBytes: Buffer.from('{"a":1}'),
    signature: Buffer.alloc(64),
  });
  assert.equal(memos.length, 3);
  // SF1.bundle in hex
  assert.equal(memos[0].Memo.MemoType, '5346312E62756E646C65');
  // SF1.event in hex
  assert.equal(memos[1].Memo.MemoType, '5346312E6576656E74');
  // SF1.sig in hex
  assert.equal(memos[2].Memo.MemoType, '5346312E736967');
});

test('extractMemos finds memos regardless of ordering', () => {
  const built = buildMemos({
    bundleBytes: Buffer.alloc(50, 0xab),
    eventBytes: Buffer.from('{"a":1}'),
    signature: Buffer.alloc(64, 0xcd),
  });

  // Reverse the order
  const reversed = [...built].reverse();
  const out = extractMemos(reversed);
  assert.equal(out.bundle.length, 50);
  assert.equal(out.event.toString('utf8'), '{"a":1}');
  assert.equal(out.signature.length, 64);
});

test('extractMemos throws on missing memos', () => {
  assert.throws(() => extractMemos([]));
});

// --- B2.6 hardening (joint-plan D4) ---------------------------------------

test('extractMemosResult: happy path returns ok:true', () => {
  const res = extractMemosResult(goodMemos());
  assert.equal(res.ok, true);
  assert.equal(res.bundle.length, 50);
  assert.equal(res.signature.length, 64);
});

test('extractMemosResult: 4 memos rejected with memo-extra', () => {
  const memos = goodMemos();
  // Append a junk memo.
  memos.push(memo('SF1.bonus', 'application/octet-stream', '00'));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-extra');
});

test('extractMemosResult: 2 memos rejected with memo-missing', () => {
  const memos = goodMemos().slice(0, 2);
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-missing');
});

test('extractMemosResult: duplicate SF1.bundle rejected with memo-duplicate', () => {
  // Replace SF1.event with a second SF1.bundle.
  const memos = goodMemos();
  memos[1] = memo('SF1.bundle', 'application/octet-stream', 'AB'.repeat(50));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-duplicate');
});

test('extractMemosResult: wrong-case SF1.Bundle rejected with memo-type-case-mismatch', () => {
  const memos = goodMemos();
  memos[0] = memo('SF1.Bundle', 'application/octet-stream', 'AB'.repeat(50));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-type-case-mismatch');
});

test('extractMemosResult: bundle MemoFormat must be octet-stream', () => {
  const memos = goodMemos();
  memos[0] = memo('SF1.bundle', 'application/json', 'AB'.repeat(50));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-format-mismatch-bundle');
});

test('extractMemosResult: event MemoFormat must be json', () => {
  const memos = goodMemos();
  memos[1] = memo('SF1.event', 'application/octet-stream', '7B7D');
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-format-mismatch-event');
});

test('extractMemosResult: sig MemoFormat must be octet-stream', () => {
  const memos = goodMemos();
  memos[2] = memo('SF1.sig', 'application/json', 'CD'.repeat(64));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-format-mismatch-sig');
});

test('extractMemosResult: unknown type rejected with memo-type-unknown', () => {
  const memos = goodMemos();
  memos[0] = memo('SFX.bundle', 'application/octet-stream', 'AB'.repeat(50));
  const res = extractMemosResult(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-type-unknown');
});

// --- Phase 4 §6.1: SF1.ots upgrade memo set --------------------------------

const goodOtsUpgradeMemos = () => {
  const bundleHex = 'AB'.repeat(50);
  const merkleProofHex = Buffer.from('[]', 'utf8').toString('hex').toUpperCase();
  const otsHex = '42'.repeat(16);
  const sigHex = 'CD'.repeat(64);
  return [
    memo('SF1.bundle', 'application/octet-stream', bundleHex),
    memo('SF1.merkleProof', 'application/json', merkleProofHex),
    memo('SF1.ots', 'application/octet-stream', otsHex),
    memo('SF1.sig', 'application/octet-stream', sigHex),
  ];
};

test('extractOtsUpgradeMemos: happy path returns ok:true with all four fields', () => {
  const res = extractOtsUpgradeMemos(goodOtsUpgradeMemos());
  assert.equal(res.ok, true);
  assert.equal(res.bundle.length, 50);
  assert.equal(res.merkleProof, '[]');
  assert.equal(res.ots.length, 16);
  assert.equal(res.sig.length, 64);
});

test('extractOtsUpgradeMemos: duplicate SF1.bundle rejected with memo-duplicate', () => {
  const memos = goodOtsUpgradeMemos();
  memos[1] = memo('SF1.bundle', 'application/octet-stream', 'AB'.repeat(50));
  const res = extractOtsUpgradeMemos(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-duplicate');
});

test('extractOtsUpgradeMemos: case-mismatch SF1.MerkleProof -> memo-type-case-mismatch', () => {
  const memos = goodOtsUpgradeMemos();
  memos[1] = memo(
    'SF1.MerkleProof',
    'application/json',
    Buffer.from('[]', 'utf8').toString('hex').toUpperCase()
  );
  const res = extractOtsUpgradeMemos(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-type-case-mismatch');
});

test('extractOtsUpgradeMemos: wrong format on merkleProof -> memo-format-mismatch-merkleProof', () => {
  const memos = goodOtsUpgradeMemos();
  // merkleProof MUST be application/json. Set it to octet-stream.
  memos[1] = memo(
    'SF1.merkleProof',
    'application/octet-stream',
    Buffer.from('[]', 'utf8').toString('hex').toUpperCase()
  );
  const res = extractOtsUpgradeMemos(memos);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'memo-format-mismatch-merkleProof');
});
