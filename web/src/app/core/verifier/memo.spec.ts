/**
 * Tests for the vendored memo encoder/decoder.
 * Mirrors `reference-verifier/tests/memo.test.js`.
 */

import {
  buildMemos,
  decodeBundleMemo,
  encodeBundleMemo,
  extractMemos,
  extractMemosResult,
  extractOtsUpgradeMemos,
} from './memo';
import { bytesToHex, utf8Decode, utf8Encode } from './bytes';

function strHex(s: string): string {
  return bytesToHex(utf8Encode(s)).toUpperCase();
}

function memo(type: string, format: string, dataHex: string) {
  return { Memo: { MemoType: strHex(type), MemoFormat: strHex(format), MemoData: dataHex } };
}

function bytesAlloc(size: number, fill = 0): Uint8Array {
  const b = new Uint8Array(size);
  if (fill !== 0) b.fill(fill);
  return b;
}

const goodMemos = () =>
  buildMemos({
    bundleBytes: bytesAlloc(50, 0xab),
    eventBytes: utf8Encode('{"a":1}'),
    signature: bytesAlloc(64, 0xcd),
  });

const VALID_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const VALID_UUID = '01933f5e-7c4a-7890-abcd-1234567890ab';

describe('memo encoding', () => {
  it('encodeBundleMemo produces 50 bytes', () => {
    const buf = encodeBundleMemo({
      bundleHash: VALID_HASH,
      eventId: VALID_UUID,
      ingestSourceCode: 1,
      channelCount: 4,
    });
    expect(buf.length).toBe(50);
  });

  it('encodeBundleMemo and decodeBundleMemo are inverses', () => {
    const original = {
      bundleHash: VALID_HASH,
      eventId: VALID_UUID,
      ingestSourceCode: 2,
      channelCount: 4,
    };
    const encoded = encodeBundleMemo(original);
    const decoded = decodeBundleMemo(encoded);
    expect(decoded).toEqual(original);
  });

  it('encodeBundleMemo rejects invalid bundleHash', () => {
    expect(() => encodeBundleMemo({
      bundleHash: 'short',
      eventId: VALID_UUID,
      ingestSourceCode: 1,
      channelCount: 1,
    })).toThrow();
  });

  it('encodeBundleMemo rejects invalid eventId', () => {
    expect(() => encodeBundleMemo({
      bundleHash: VALID_HASH,
      eventId: 'not-a-uuid',
      ingestSourceCode: 1,
      channelCount: 1,
    })).toThrow();
  });

  it('encodeBundleMemo rejects out-of-range ingestSourceCode', () => {
    expect(() => encodeBundleMemo({
      bundleHash: VALID_HASH,
      eventId: VALID_UUID,
      ingestSourceCode: 0,
      channelCount: 1,
    })).toThrow();
  });

  it('decodeBundleMemo rejects wrong byte length', () => {
    expect(() => decodeBundleMemo(new Uint8Array(49))).toThrow();
  });

  it('buildMemos uses correct MemoType encodings', () => {
    const memos = buildMemos({
      bundleBytes: new Uint8Array(50),
      eventBytes: utf8Encode('{"a":1}'),
      signature: new Uint8Array(64),
    });
    expect(memos.length).toBe(3);
    expect(memos[0].Memo.MemoType).toBe('5346312E62756E646C65');
    expect(memos[1].Memo.MemoType).toBe('5346312E6576656E74');
    expect(memos[2].Memo.MemoType).toBe('5346312E736967');
  });
});

describe('extractMemos / extractMemosResult', () => {
  it('finds memos regardless of ordering', () => {
    const built = goodMemos();
    const reversed = [...built].reverse();
    const out = extractMemos(reversed);
    expect(out.bundle.length).toBe(50);
    expect(utf8Decode(out.event)).toBe('{"a":1}');
    expect(out.signature.length).toBe(64);
  });

  it('throws on missing memos', () => {
    expect(() => extractMemos([])).toThrow();
  });

  it('happy path returns ok:true', () => {
    const res = extractMemosResult(goodMemos());
    expect(res.ok).toBeTrue();
    if (res.ok) {
      expect(res.bundle.length).toBe(50);
      expect(res.signature.length).toBe(64);
    }
  });

  it('4 memos rejected with memo-extra', () => {
    const memos = goodMemos();
    memos.push(memo('SF1.bonus', 'application/octet-stream', '00'));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-extra');
  });

  it('2 memos rejected with memo-missing', () => {
    const memos = goodMemos().slice(0, 2);
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-missing');
  });

  it('duplicate SF1.bundle rejected with memo-duplicate', () => {
    const memos = goodMemos();
    memos[1] = memo('SF1.bundle', 'application/octet-stream', 'AB'.repeat(50));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-duplicate');
  });

  it('wrong-case SF1.Bundle rejected with memo-type-case-mismatch', () => {
    const memos = goodMemos();
    memos[0] = memo('SF1.Bundle', 'application/octet-stream', 'AB'.repeat(50));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-type-case-mismatch');
  });

  it('bundle MemoFormat must be octet-stream', () => {
    const memos = goodMemos();
    memos[0] = memo('SF1.bundle', 'application/json', 'AB'.repeat(50));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-format-mismatch-bundle');
  });

  it('event MemoFormat must be json', () => {
    const memos = goodMemos();
    memos[1] = memo('SF1.event', 'application/octet-stream', '7B7D');
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-format-mismatch-event');
  });

  it('sig MemoFormat must be octet-stream', () => {
    const memos = goodMemos();
    memos[2] = memo('SF1.sig', 'application/json', 'CD'.repeat(64));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-format-mismatch-sig');
  });

  it('unknown type rejected with memo-type-unknown', () => {
    const memos = goodMemos();
    memos[0] = memo('SFX.bundle', 'application/octet-stream', 'AB'.repeat(50));
    const res = extractMemosResult(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-type-unknown');
  });
});

describe('extractOtsUpgradeMemos (Phase 4 §6.1)', () => {
  const goodOtsUpgradeMemos = () => {
    const bundleHex = 'AB'.repeat(50);
    const merkleProofHex = bytesToHex(utf8Encode('[]')).toUpperCase();
    const otsHex = '42'.repeat(16);
    const sigHex = 'CD'.repeat(64);
    return [
      memo('SF1.bundle', 'application/octet-stream', bundleHex),
      memo('SF1.merkleProof', 'application/json', merkleProofHex),
      memo('SF1.ots', 'application/octet-stream', otsHex),
      memo('SF1.sig', 'application/octet-stream', sigHex),
    ];
  };

  it('happy path returns ok:true with all four fields', () => {
    const res = extractOtsUpgradeMemos(goodOtsUpgradeMemos());
    expect(res.ok).toBeTrue();
    if (res.ok) {
      expect(res.bundle.length).toBe(50);
      expect(res.merkleProof).toBe('[]');
      expect(res.ots.length).toBe(16);
      expect(res.sig.length).toBe(64);
    }
  });

  it('duplicate SF1.bundle rejected with memo-duplicate', () => {
    const memos = goodOtsUpgradeMemos();
    memos[1] = memo('SF1.bundle', 'application/octet-stream', 'AB'.repeat(50));
    const res = extractOtsUpgradeMemos(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-duplicate');
  });

  it('case-mismatch SF1.MerkleProof -> memo-type-case-mismatch', () => {
    const memos = goodOtsUpgradeMemos();
    memos[1] = memo(
      'SF1.MerkleProof',
      'application/json',
      bytesToHex(utf8Encode('[]')).toUpperCase(),
    );
    const res = extractOtsUpgradeMemos(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-type-case-mismatch');
  });

  it('wrong format on merkleProof -> memo-format-mismatch-merkleProof', () => {
    const memos = goodOtsUpgradeMemos();
    memos[1] = memo(
      'SF1.merkleProof',
      'application/octet-stream',
      bytesToHex(utf8Encode('[]')).toUpperCase(),
    );
    const res = extractOtsUpgradeMemos(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-format-mismatch-merkleProof');
  });

  it('3-memo anchor rejected with memo-missing', () => {
    const memos = goodOtsUpgradeMemos().slice(0, 3);
    const res = extractOtsUpgradeMemos(memos);
    expect(res.ok).toBeFalse();
    if (!res.ok) expect(res.reason).toBe('memo-missing');
  });
});
