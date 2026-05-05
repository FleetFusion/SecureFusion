/**
 * Buffer-free byte helpers.
 *
 * The reference verifier uses Node's `Buffer`. The SPA cannot depend
 * on `node:buffer` — these helpers provide the same operations on
 * `Uint8Array` so `memo.ts` and friends stay dependency-free in the
 * browser bundle.
 */

const HEX = '0123456789abcdef';

/**
 * Decode a hex string (upper or lower case) to bytes. Throws on
 * odd-length or non-hex characters — same posture as
 * `Buffer.from(s, 'hex')` failing silently is too lax for a verifier.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new TypeError('hexToBytes: input must be a string');
  }
  if (hex.length % 2 !== 0) {
    throw new Error('hexToBytes: input must have even length');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = parseHexNibble(hex.charCodeAt(i * 2));
    const lo = parseHexNibble(hex.charCodeAt(i * 2 + 1));
    if (hi < 0 || lo < 0) {
      throw new Error(`hexToBytes: non-hex char at offset ${i * 2}`);
    }
    out[i] = (hi << 4) | lo;
  }
  return out;
}

function parseHexNibble(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;       // 0-9
  if (c >= 97 && c <= 102) return c - 87;      // a-f
  if (c >= 65 && c <= 70) return c - 55;       // A-F
  return -1;
}

/** Encode bytes to lowercase hex. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out += HEX[(b >> 4) & 0x0f] + HEX[b & 0x0f];
  }
  return out;
}

/** Encode a UTF-8 string to bytes. */
export function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** Decode UTF-8 bytes to a string. */
export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Concatenate multiple byte arrays into one. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Constant-time-ish equality (we do not need true CT here, but at
 *  least avoid a length-leak shortcut on first mismatch). */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
