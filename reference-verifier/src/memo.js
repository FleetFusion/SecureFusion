/**
 * SecureFusion XRPL memo encode/decode.
 *
 * Spec reference: spec/memo-format.md
 */

const SF1_BUNDLE = 'SF1.bundle';
const SF1_EVENT = 'SF1.event';
const SF1_SIG = 'SF1.sig';
const SF1_MERKLE_PROOF = 'SF1.merkleProof';
const SF1_OTS = 'SF1.ots';

const FORMAT_OCTET = 'application/octet-stream';
const FORMAT_JSON = 'application/json';

/**
 * Convert a UTF-8 string to uppercase hex.
 */
function strToHex(s) {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase();
}

/**
 * Convert uppercase or lowercase hex to a UTF-8 string.
 */
function hexToStr(h) {
  return Buffer.from(h, 'hex').toString('utf8');
}

/**
 * Encode the SF1.bundle binary header.
 *
 * @param {object} args
 * @param {string} args.bundleHash       - lowercase hex SHA-256 (32 bytes)
 * @param {string} args.eventId          - lowercase hyphenated UUID
 * @param {number} args.ingestSourceCode - 1..255
 * @param {number} args.channelCount     - 1..255
 * @returns {Buffer}                     - 50 bytes
 */
export function encodeBundleMemo({ bundleHash, eventId, ingestSourceCode, channelCount }) {
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

  const out = Buffer.alloc(50);
  Buffer.from(bundleHash, 'hex').copy(out, 0);
  // FleetFusion writes the 16-byte eventId via Guid.ToByteArray(), which
  // is .NET-native little-endian for the first 3 fields. To match, we
  // re-order the canonical UUID bytes:
  //   field1 (4B) reverse, field2 (2B) reverse, field3 (2B) reverse,
  //   then field4 (2B) and field5 (6B) untouched.
  const u = uuidToDotNetBytes(eventId);
  u.copy(out, 32);
  out[48] = ingestSourceCode;
  out[49] = channelCount;
  return out;
}

/** Convert a hyphenated UUID string to the 16-byte .NET Guid byte array. */
function uuidToDotNetBytes(eventId) {
  const hex = eventId.replace(/-/g, '');
  const raw = Buffer.from(hex, 'hex');
  const out = Buffer.alloc(16);
  // field1 (bytes 0..3) little-endian
  out[0] = raw[3]; out[1] = raw[2]; out[2] = raw[1]; out[3] = raw[0];
  // field2 (bytes 4..5) little-endian
  out[4] = raw[5]; out[5] = raw[4];
  // field3 (bytes 6..7) little-endian
  out[6] = raw[7]; out[7] = raw[6];
  // field4 (bytes 8..9) + field5 (bytes 10..15) preserved
  raw.copy(out, 8, 8, 16);
  return out;
}

/** Inverse of uuidToDotNetBytes: 16 .NET-Guid bytes -> hyphenated UUID. */
function dotNetBytesToUuid(b) {
  const r = Buffer.alloc(16);
  r[0] = b[3]; r[1] = b[2]; r[2] = b[1]; r[3] = b[0];
  r[4] = b[5]; r[5] = b[4];
  r[6] = b[7]; r[7] = b[6];
  b.copy(r, 8, 8, 16);
  const h = r.toString('hex');
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
 *
 * @param {Buffer | Uint8Array} bytes
 * @returns {object}
 */
export function decodeBundleMemo(bytes) {
  if (bytes.length !== 50) {
    throw new Error(`SF1.bundle must be 50 bytes, got ${bytes.length}`);
  }
  const buf = Buffer.from(bytes);
  const bundleHash = buf.subarray(0, 32).toString('hex');
  // The 16-byte eventId region was written via Guid.ToByteArray() in
  // FleetFusion (.NET) -- first 3 fields little-endian. Convert back
  // to the canonical hyphenated form.
  const eventId = dotNetBytesToUuid(buf.subarray(32, 48));
  const ingestSourceCode = buf[48];
  const channelCount = buf[49];
  return { bundleHash, eventId, ingestSourceCode, channelCount };
}

/**
 * Build the three Memo entries for an XRPL transaction.
 *
 * @param {object} args
 * @param {Buffer} args.bundleBytes  - 50-byte SF1.bundle payload
 * @param {Buffer} args.eventBytes   - canonical manifest UTF-8 bytes
 * @param {Buffer} args.signature    - 64-byte Ed25519 signature
 * @returns {Array}
 */
export function buildMemos({ bundleBytes, eventBytes, signature }) {
  return [
    {
      Memo: {
        MemoType: strToHex(SF1_BUNDLE),
        MemoFormat: strToHex(FORMAT_OCTET),
        MemoData: Buffer.from(bundleBytes).toString('hex').toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: strToHex(SF1_EVENT),
        MemoFormat: strToHex(FORMAT_JSON),
        MemoData: Buffer.from(eventBytes).toString('hex').toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: strToHex(SF1_SIG),
        MemoFormat: strToHex(FORMAT_OCTET),
        MemoData: Buffer.from(signature).toString('hex').toUpperCase(),
      },
    },
  ];
}

/**
 * Pull the three SecureFusion memos out of an XRPL transaction's Memos array.
 *
 * Per joint-plan D4 / B2.6, this MUST:
 *   - reject if the memo count is anything other than exactly 3,
 *   - reject case-mismatched MemoType strings (case-sensitive ASCII),
 *   - reject duplicate SF1 memo types,
 *   - reject MemoFormat that doesn't match the per-spec mapping
 *     (octet-stream for bundle/sig, json for event).
 *
 * The legacy throw-on-error contract is kept for back-compat with existing
 * callers; structured callers should prefer `extractMemosResult` which
 * returns `{ ok:false, reason:'<code>' }` on rejection.
 *
 * @param {Array} txMemos
 * @returns {{ bundle: Buffer, event: Buffer, signature: Buffer }}
 */
export function extractMemos(txMemos) {
  const result = extractMemosResult(txMemos);
  if (!result.ok) {
    throw new Error(`memo rejected: ${result.reason}`);
  }
  return { bundle: result.bundle, event: result.event, signature: result.signature };
}

/**
 * Structured variant of `extractMemos`. Never throws; returns either:
 *   { ok:true, bundle, event, signature }
 * or
 *   { ok:false, reason:'<spec-cited code>' }
 *
 * Reason codes (stable strings -- aligned with the conformance vectors
 * in conformance/vectors/v1-bad-*.expected.json):
 *   - memo-missing                 : tx has fewer than 3 memos
 *   - memo-extra                   : tx has more than 3 memos
 *   - memo-format-malformed        : a memo's hex/UTF-8 fields couldn't decode
 *   - memo-type-unknown            : a MemoType is not one of the SF1 set
 *   - memo-type-case-mismatch      : a MemoType matches case-insensitively
 *                                    but not case-sensitively
 *   - memo-duplicate               : the same SF1 memo type appears twice
 *   - memo-format-mismatch-bundle  : SF1.bundle MemoFormat != octet-stream
 *   - memo-format-mismatch-event   : SF1.event MemoFormat != json
 *   - memo-format-mismatch-sig     : SF1.sig MemoFormat != octet-stream
 *
 * @param {Array} txMemos
 */
export function extractMemosResult(txMemos) {
  if (!Array.isArray(txMemos)) {
    return { ok: false, reason: 'memo-missing' };
  }
  if (txMemos.length < 3) {
    return { ok: false, reason: 'memo-missing' };
  }

  const expectedTypes = [SF1_BUNDLE, SF1_EVENT, SF1_SIG];
  const expectedFormats = {
    [SF1_BUNDLE]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-bundle' },
    [SF1_EVENT]: { format: FORMAT_JSON, reason: 'memo-format-mismatch-event' },
    [SF1_SIG]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-sig' },
  };

  // Pass 1: decode every memo's type, format, data. Detect malformed
  // entries (bad hex/UTF-8) and case-mismatch / duplicate-of-SF1-type
  // errors. Defer unknown-type errors so a 4th junk memo doesn't beat
  // the count-based `memo-extra` reason.
  const parsed = [];
  const seenSf1 = new Set();
  for (const wrapper of txMemos) {
    const m = wrapper && (wrapper.Memo ?? wrapper);
    if (!m || typeof m.MemoType !== 'string' || typeof m.MemoData !== 'string') {
      return { ok: false, reason: 'memo-format-malformed' };
    }
    let type;
    let data;
    let formatStr;
    try {
      type = hexToStr(m.MemoType);
      data = Buffer.from(m.MemoData, 'hex');
      formatStr = typeof m.MemoFormat === 'string' ? hexToStr(m.MemoFormat) : '';
    } catch {
      return { ok: false, reason: 'memo-format-malformed' };
    }

    // Case-insensitive match of an SF1 type means the producer
    // mis-cased the memo name; verifier MUST reject (D4). This wins
    // over the count check because a case-mismatch is a deliberate
    // protocol violation, not an accident of count.
    if (!expectedTypes.includes(type)) {
      const lower = type.toLowerCase();
      if (expectedTypes.some((t) => t.toLowerCase() === lower)) {
        return { ok: false, reason: 'memo-type-case-mismatch' };
      }
    } else {
      // Duplicate SF1 type also wins over the count check. Spec D4
      // requires duplicates be a hard failure -- they're a stronger
      // signal of intent than a stray extra memo.
      if (seenSf1.has(type)) {
        return { ok: false, reason: 'memo-duplicate' };
      }
      seenSf1.add(type);
    }

    parsed.push({ type, data, formatStr });
  }

  // Now apply the count check: any extra memo (SF1 or otherwise) is
  // a hard failure when the SF1 set is otherwise complete (4+ memos).
  if (txMemos.length > 3) {
    return { ok: false, reason: 'memo-extra' };
  }

  // With exactly 3 memos: any non-SF1 type means the SF1 set is
  // incomplete. Surface that as memo-type-unknown rather than
  // memo-missing, since the user-supplied type was active garbage.
  for (const p of parsed) {
    if (!expectedTypes.includes(p.type)) {
      return { ok: false, reason: 'memo-type-unknown' };
    }
  }

  if (seenSf1.size !== 3) {
    return { ok: false, reason: 'memo-missing' };
  }

  // Per-memo format check.
  const decoded = {};
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
    bundle: decoded.bundle,
    event: decoded.event,
    signature: decoded.signature,
  };
}

/**
 * Extracts the four SF1 memos from an OTS upgrade XRPL transaction
 * (Phase 4 §6.1). Strict: exactly
 *   { SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig }
 * with case-sensitive MemoType matching, MemoFormat application/octet-stream
 * for bundle/sig/ots and application/json for merkleProof.
 *
 * Reason codes (stable):
 *   - memo-missing
 *   - memo-extra
 *   - memo-format-malformed
 *   - memo-type-unknown
 *   - memo-type-case-mismatch
 *   - memo-duplicate
 *   - memo-format-mismatch-bundle
 *   - memo-format-mismatch-merkleProof
 *   - memo-format-mismatch-ots
 *   - memo-format-mismatch-sig
 *
 * @param {Array} txMemos
 * @returns {{ok:true, bundle:Buffer, merkleProof:string, ots:Buffer, sig:Buffer}
 *           | {ok:false, reason:string}}
 */
export function extractOtsUpgradeMemos(txMemos) {
  if (!Array.isArray(txMemos)) {
    return { ok: false, reason: 'memo-missing' };
  }
  if (txMemos.length < 4) {
    return { ok: false, reason: 'memo-missing' };
  }

  const expectedTypes = [SF1_BUNDLE, SF1_MERKLE_PROOF, SF1_OTS, SF1_SIG];
  const expectedFormats = {
    [SF1_BUNDLE]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-bundle' },
    [SF1_MERKLE_PROOF]: { format: FORMAT_JSON, reason: 'memo-format-mismatch-merkleProof' },
    [SF1_OTS]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-ots' },
    [SF1_SIG]: { format: FORMAT_OCTET, reason: 'memo-format-mismatch-sig' },
  };

  const parsed = [];
  const seenSf1 = new Set();
  for (const wrapper of txMemos) {
    const m = wrapper && (wrapper.Memo ?? wrapper);
    if (!m || typeof m.MemoType !== 'string' || typeof m.MemoData !== 'string') {
      return { ok: false, reason: 'memo-format-malformed' };
    }
    let type;
    let data;
    let formatStr;
    try {
      type = hexToStr(m.MemoType);
      data = Buffer.from(m.MemoData, 'hex');
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

  const decoded = {};
  for (const p of parsed) {
    const expected = expectedFormats[p.type];
    if (p.formatStr !== expected.format) {
      return { ok: false, reason: expected.reason };
    }
    if (p.type === SF1_BUNDLE) decoded.bundle = p.data;
    else if (p.type === SF1_MERKLE_PROOF) decoded.merkleProof = p.data.toString('utf8');
    else if (p.type === SF1_OTS) decoded.ots = p.data;
    else if (p.type === SF1_SIG) decoded.sig = p.data;
  }

  return {
    ok: true,
    bundle: decoded.bundle,
    merkleProof: decoded.merkleProof,
    ots: decoded.ots,
    sig: decoded.sig,
  };
}
