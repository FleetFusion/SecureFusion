/**
 * SecureFusion XRPL memo encode/decode.
 *
 * Vendored TypeScript port of `reference-verifier/src/memo.js`. See
 * `SOURCE.md` for the upstream commit hash. The reference uses Node
 * `Buffer`; this port uses `Uint8Array` plus the helpers in
 * `bytes.ts`.
 *
 * Spec reference: spec/memo-format.md
 */

import { bytesToHex, hexToBytes, utf8Decode, utf8Encode } from './bytes';

const SF1_BUNDLE = 'SF1.bundle';
const SF1_EVENT = 'SF1.event';
const SF1_SIG = 'SF1.sig';
const SF1_MERKLE_PROOF = 'SF1.merkleProof';
const SF1_OTS = 'SF1.ots';

const FORMAT_OCTET = 'application/octet-stream';
const FORMAT_JSON = 'application/json';

/** Convert a UTF-8 string to uppercase hex (for XRPL Memo fields). */
function strToHexUpper(s: string): string {
  return bytesToHex(utf8Encode(s)).toUpperCase();
}

/** Convert hex (upper or lower case) to a UTF-8 string. */
function hexToStr(h: string): string {
  return utf8Decode(hexToBytes(h));
}

export interface BundleHeader {
  bundleHash: string;
  eventId: string;
  ingestSourceCode: number;
  channelCount: number;
}

/**
 * Encode the SF1.bundle binary header (50 bytes).
 */
export function encodeBundleMemo(args: BundleHeader): Uint8Array {
  const { bundleHash, eventId, ingestSourceCode, channelCount } = args;
  if (!/^[0-9a-f]{64}$/.test(bundleHash)) {
    throw new Error('bundleHash must be 64 lowercase hex chars');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(eventId)) {
    throw new Error('eventId must be a lowercase hyphenated UUID');
  }
  if (!Number.isInteger(ingestSourceCode) || ingestSourceCode < 1 || ingestSourceCode > 255) {
    throw new Error('ingestSourceCode must be 1..255');
  }
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 255) {
    throw new Error('channelCount must be 1..255');
  }

  const out = new Uint8Array(50);
  out.set(hexToBytes(bundleHash), 0);
  // FleetFusion writes the 16-byte eventId via Guid.ToByteArray(),
  // which is .NET-native little-endian for the first 3 fields. To
  // match, we re-order the canonical UUID bytes:
  //   field1 (4B) reverse, field2 (2B) reverse, field3 (2B) reverse,
  //   then field4 (2B) and field5 (6B) untouched.
  out.set(uuidToDotNetBytes(eventId), 32);
  out[48] = ingestSourceCode;
  out[49] = channelCount;
  return out;
}

/** Convert a hyphenated UUID string to the 16-byte .NET Guid byte array. */
function uuidToDotNetBytes(eventId: string): Uint8Array {
  const hex = eventId.replace(/-/g, '');
  const raw = hexToBytes(hex);
  const out = new Uint8Array(16);
  out[0] = raw[3]; out[1] = raw[2]; out[2] = raw[1]; out[3] = raw[0];
  out[4] = raw[5]; out[5] = raw[4];
  out[6] = raw[7]; out[7] = raw[6];
  // field4 (bytes 8..9) + field5 (bytes 10..15) preserved
  out.set(raw.subarray(8, 16), 8);
  return out;
}

/** Inverse of uuidToDotNetBytes: 16 .NET-Guid bytes -> hyphenated UUID. */
function dotNetBytesToUuid(b: Uint8Array): string {
  const r = new Uint8Array(16);
  r[0] = b[3]; r[1] = b[2]; r[2] = b[1]; r[3] = b[0];
  r[4] = b[5]; r[5] = b[4];
  r[6] = b[7]; r[7] = b[6];
  r.set(b.subarray(8, 16), 8);
  const h = bytesToHex(r);
  return (
    h.slice(0, 8) + '-' +
    h.slice(8, 12) + '-' +
    h.slice(12, 16) + '-' +
    h.slice(16, 20) + '-' +
    h.slice(20, 32)
  );
}

/**
 * Decode an SF1.bundle binary header.
 */
export function decodeBundleMemo(bytes: Uint8Array): BundleHeader {
  if (bytes.length !== 50) {
    throw new Error(`SF1.bundle must be 50 bytes, got ${bytes.length}`);
  }
  const bundleHash = bytesToHex(bytes.subarray(0, 32));
  const eventId = dotNetBytesToUuid(bytes.subarray(32, 48));
  const ingestSourceCode = bytes[48];
  const channelCount = bytes[49];
  return { bundleHash, eventId, ingestSourceCode, channelCount };
}

export interface XrplMemo {
  Memo?: { MemoType?: unknown; MemoData?: unknown; MemoFormat?: unknown };
  MemoType?: unknown;
  MemoData?: unknown;
  MemoFormat?: unknown;
}

export interface BuildMemosArgs {
  bundleBytes: Uint8Array;
  eventBytes: Uint8Array;
  signature: Uint8Array;
}

/**
 * Build the three Memo entries for an XRPL transaction.
 */
export function buildMemos({ bundleBytes, eventBytes, signature }: BuildMemosArgs) {
  return [
    {
      Memo: {
        MemoType: strToHexUpper(SF1_BUNDLE),
        MemoFormat: strToHexUpper(FORMAT_OCTET),
        MemoData: bytesToHex(bundleBytes).toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: strToHexUpper(SF1_EVENT),
        MemoFormat: strToHexUpper(FORMAT_JSON),
        MemoData: bytesToHex(eventBytes).toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: strToHexUpper(SF1_SIG),
        MemoFormat: strToHexUpper(FORMAT_OCTET),
        MemoData: bytesToHex(signature).toUpperCase(),
      },
    },
  ];
}

export type ExtractMemosResult =
  | { ok: true; bundle: Uint8Array; event: Uint8Array; signature: Uint8Array }
  | { ok: false; reason: string };

/**
 * Throw-on-error variant. Structured callers should prefer
 * `extractMemosResult` which returns `{ ok:false, reason }`.
 */
export function extractMemos(txMemos: unknown): {
  bundle: Uint8Array;
  event: Uint8Array;
  signature: Uint8Array;
} {
  const result = extractMemosResult(txMemos);
  if (!result.ok) {
    throw new Error(`memo rejected: ${result.reason}`);
  }
  return { bundle: result.bundle, event: result.event, signature: result.signature };
}

/**
 * Pull the three SecureFusion memos out of an XRPL transaction's
 * Memos array. See the JS reference for the full reason-code list —
 * the strings here MUST match the conformance vectors.
 */
export function extractMemosResult(txMemos: unknown): ExtractMemosResult {
  if (!Array.isArray(txMemos)) {
    return { ok: false, reason: 'memo-missing' };
  }
  if (txMemos.length < 3) {
    return { ok: false, reason: 'memo-missing' };
  }

  const expectedTypes = [SF1_BUNDLE, SF1_EVENT, SF1_SIG];
  const expectedFormats: Record<string, { format: string; reason: string }> = {
    [SF1_BUNDLE]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-bundle' },
    [SF1_EVENT]: { format: FORMAT_JSON, reason: 'memo-format-mismatch-event' },
    [SF1_SIG]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-sig' },
  };

  interface ParsedMemo { type: string; data: Uint8Array; formatStr: string; }
  const parsed: ParsedMemo[] = [];
  const seenSf1 = new Set<string>();
  for (const wrapper of txMemos as XrplMemo[]) {
    const m = wrapper && (wrapper.Memo ?? wrapper);
    if (!m || typeof m.MemoType !== 'string' || typeof m.MemoData !== 'string') {
      return { ok: false, reason: 'memo-format-malformed' };
    }
    let type: string;
    let data: Uint8Array;
    let formatStr: string;
    try {
      type = hexToStr(m.MemoType);
      data = hexToBytes(m.MemoData);
      formatStr = typeof m.MemoFormat === 'string' ? hexToStr(m.MemoFormat) : '';
    } catch {
      return { ok: false, reason: 'memo-format-malformed' };
    }

    // Case-insensitive match of an SF1 type means the producer
    // mis-cased the memo name; verifier MUST reject (D4).
    if (!expectedTypes.includes(type)) {
      const lower = type.toLowerCase();
      if (expectedTypes.some((t) => t.toLowerCase() === lower)) {
        return { ok: false, reason: 'memo-type-case-mismatch' };
      }
    } else {
      if (seenSf1.has(type)) {
        return { ok: false, reason: 'memo-duplicate' };
      }
      seenSf1.add(type);
    }

    parsed.push({ type, data, formatStr });
  }

  if (txMemos.length > 3) {
    return { ok: false, reason: 'memo-extra' };
  }

  for (const p of parsed) {
    if (!expectedTypes.includes(p.type)) {
      return { ok: false, reason: 'memo-type-unknown' };
    }
  }

  if (seenSf1.size !== 3) {
    return { ok: false, reason: 'memo-missing' };
  }

  const decoded: { bundle?: Uint8Array; event?: Uint8Array; signature?: Uint8Array } = {};
  for (const p of parsed) {
    const expected = expectedFormats[p.type];
    if (p.formatStr !== expected.format) {
      return { ok: false, reason: expected.reason };
    }
    if (p.type === SF1_BUNDLE) decoded.bundle = p.data;
    else if (p.type === SF1_EVENT) decoded.event = p.data;
    else if (p.type === SF1_SIG) decoded.signature = p.data;
  }

  return {
    ok: true,
    bundle: decoded.bundle!,
    event: decoded.event!,
    signature: decoded.signature!,
  };
}

export type ExtractOtsUpgradeResult =
  | {
      ok: true;
      bundle: Uint8Array;
      merkleProof: string;
      ots: Uint8Array;
      sig: Uint8Array;
    }
  | { ok: false; reason: string };

/**
 * Extracts the four SF1 memos from an OTS upgrade XRPL transaction.
 * Strict: exactly { SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig }.
 */
export function extractOtsUpgradeMemos(txMemos: unknown): ExtractOtsUpgradeResult {
  if (!Array.isArray(txMemos)) {
    return { ok: false, reason: 'memo-missing' };
  }
  if (txMemos.length < 4) {
    return { ok: false, reason: 'memo-missing' };
  }

  const expectedTypes = [SF1_BUNDLE, SF1_MERKLE_PROOF, SF1_OTS, SF1_SIG];
  const expectedFormats: Record<string, { format: string; reason: string }> = {
    [SF1_BUNDLE]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-bundle' },
    [SF1_MERKLE_PROOF]: { format: FORMAT_JSON, reason: 'memo-format-mismatch-merkleProof' },
    [SF1_OTS]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-ots' },
    [SF1_SIG]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-sig' },
  };

  interface ParsedMemo { type: string; data: Uint8Array; formatStr: string; }
  const parsed: ParsedMemo[] = [];
  const seenSf1 = new Set<string>();
  for (const wrapper of txMemos as XrplMemo[]) {
    const m = wrapper && (wrapper.Memo ?? wrapper);
    if (!m || typeof m.MemoType !== 'string' || typeof m.MemoData !== 'string') {
      return { ok: false, reason: 'memo-format-malformed' };
    }
    let type: string;
    let data: Uint8Array;
    let formatStr: string;
    try {
      type = hexToStr(m.MemoType);
      data = hexToBytes(m.MemoData);
      formatStr = typeof m.MemoFormat === 'string' ? hexToStr(m.MemoFormat) : '';
    } catch {
      return { ok: false, reason: 'memo-format-malformed' };
    }

    if (!expectedTypes.includes(type)) {
      const lower = type.toLowerCase();
      if (expectedTypes.some((t) => t.toLowerCase() === lower)) {
        return { ok: false, reason: 'memo-type-case-mismatch' };
      }
    } else {
      if (seenSf1.has(type)) {
        return { ok: false, reason: 'memo-duplicate' };
      }
      seenSf1.add(type);
    }
    parsed.push({ type, data, formatStr });
  }

  if (txMemos.length > 4) {
    return { ok: false, reason: 'memo-extra' };
  }

  for (const p of parsed) {
    if (!expectedTypes.includes(p.type)) {
      return { ok: false, reason: 'memo-type-unknown' };
    }
  }

  if (seenSf1.size !== 4) {
    return { ok: false, reason: 'memo-missing' };
  }

  const decoded: {
    bundle?: Uint8Array;
    merkleProof?: string;
    ots?: Uint8Array;
    sig?: Uint8Array;
  } = {};
  for (const p of parsed) {
    const expected = expectedFormats[p.type];
    if (p.formatStr !== expected.format) {
      return { ok: false, reason: expected.reason };
    }
    if (p.type === SF1_BUNDLE) decoded.bundle = p.data;
    else if (p.type === SF1_MERKLE_PROOF) decoded.merkleProof = utf8Decode(p.data);
    else if (p.type === SF1_OTS) decoded.ots = p.data;
    else if (p.type === SF1_SIG) decoded.sig = p.data;
  }

  return {
    ok: true,
    bundle: decoded.bundle!,
    merkleProof: decoded.merkleProof!,
    ots: decoded.ots!,
    sig: decoded.sig!,
  };
}
