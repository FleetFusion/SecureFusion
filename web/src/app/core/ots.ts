/** Bounded OpenTimestamps verification for raw calendar proofs and detached .ots files.
 * Replays every operation locally; Bitcoin is verified only against agreed main-chain headers.
 * No video, digest or calendar URL is uploaded. Only public block heights/hashes are requested.
 */
import { bytesEqual, bytesToHex, concatBytes, hexToBytes, utf8Encode } from './verifier/bytes';
import { verifyBitcoinHeader } from './bitcoin';
export type OtsResult =
  | { status: 'verified'; bitcoin: { blockHeight: number; blockTimeUtc: string | null; blockHash?: string } }
  | { status: 'unresolved' | 'invalid'; reason: string };
const MAGIC = hexToBytes('004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294');
const BITCOIN = '0588960d73d71901';
const PENDING = '83dfe30d2ef90c8e';
class Reader {
  pos = 0;
  readonly bytes: Uint8Array;
  constructor(bytes: Uint8Array) { this.bytes = bytes; }
  take(n: number): Uint8Array {
    if (!Number.isSafeInteger(n) || n < 0 || this.pos + n > this.bytes.length) throw new Error('Truncated OpenTimestamps proof.');
    const out = this.bytes.slice(this.pos, this.pos + n); this.pos += n; return out;
  }
  byte(): number { return this.take(1)[0]; }
  uint(): number {
    let n = 0, factor = 1;
    for (let i = 0; i < 8; i++) { const b = this.byte(); n += (b & 127) * factor;
      if (!Number.isSafeInteger(n)) throw new Error('OpenTimestamps integer overflow.');
      if (!(b & 128)) return n; factor *= 128;
    }
    throw new Error('OpenTimestamps integer overflow.');
  }
  varBytes(): Uint8Array { const n = this.uint(); if (n > 8192) throw new Error('OpenTimestamps payload too large.'); return this.take(n); }
}
export interface ParsedOts { attestations: Array<{ height: number; digest: Uint8Array }>; pending: boolean; }
export async function parseOtsProof(bytes: Uint8Array, digestHex: string): Promise<ParsedOts> {
  if (!/^[0-9a-f]{64}$/i.test(digestHex)) throw new Error('Expected a SHA-256 digest.');
  if (!bytes.length || bytes.length > 65536) throw new Error('OpenTimestamps proof must contain 1–65536 bytes.');
  const reader = new Reader(bytes), initial = hexToBytes(digestHex);
  if (bytesEqual(bytes.subarray(0, MAGIC.length), MAGIC)) {
    reader.take(MAGIC.length);
    if (reader.uint() !== 1 || reader.byte() !== 0x08) throw new Error('Unsupported detached OpenTimestamps file.');
    if (!bytesEqual(reader.take(32), initial)) throw new Error('OpenTimestamps file digest does not match the event Merkle root.');
  }
  const result: ParsedOts = { attestations: [], pending: false }; let entries = 0;
  async function entry(tag: number, message: Uint8Array, depth: number): Promise<void> {
    if (++entries > 2048) throw new Error('OpenTimestamps proof has too many operations.');
    if (tag === 0) {
      const kind = bytesToHex(reader.take(8)), payload = reader.varBytes();
      if (kind === BITCOIN) {
        const att = new Reader(payload), height = att.uint();
        if (att.pos !== payload.length || result.attestations.length >= 64) throw new Error('Invalid Bitcoin attestation.');
        result.attestations.push({ height, digest: message.slice() });
      } else if (kind === PENDING) { const pending = new Reader(payload); if (!pending.varBytes().length || pending.pos !== payload.length) throw new Error('Invalid pending timestamp.'); result.pending = true; }
      return;
    }
    let next: Uint8Array;
    if (tag === 0xf0) next = concatBytes(message, reader.varBytes());
    else if (tag === 0xf1) next = concatBytes(reader.varBytes(), message);
    else if (tag === 0xf2) next = message.slice().reverse();
    else if (tag === 0xf3) next = utf8Encode(bytesToHex(message));
    else if (tag === 0x08 || tag === 0x02) next = new Uint8Array(await crypto.subtle.digest(tag === 0x08 ? 'SHA-256' : 'SHA-1', message));
    else if (tag === 0x03) { const { ripemd160 } = await import('hash-wasm'); next = hexToBytes(await ripemd160(message)); }
    else throw new Error('Unsupported OpenTimestamps operation: ' + tag);
    if (!next.length || next.length > 4096) throw new Error('OpenTimestamps operation result too large.');
    await node(next, depth + 1);
  }
  async function node(message: Uint8Array, depth: number): Promise<void> {
    if (depth > 128) throw new Error('OpenTimestamps proof nesting too deep.');
    let tag = reader.byte();
    while (tag === 0xff) { await entry(reader.byte(), message, depth); tag = reader.byte(); }
    await entry(tag, message, depth);
  }
  await node(initial, 0);
  if (reader.pos !== bytes.length) throw new Error('Trailing bytes in OpenTimestamps proof.');
  return result;
}
export async function verifyOtsProof(bytes: Uint8Array, digestHex: string, signal?: AbortSignal): Promise<OtsResult> {
  let parsed: ParsedOts;
  try { parsed = await parseOtsProof(bytes, digestHex); }
  catch (error) { return { status: 'invalid', reason: (error as Error).message }; }
  if (!parsed.attestations.length) return { status: 'unresolved', reason: parsed.pending ? 'Bitcoin timestamp is still pending confirmation.' : 'No Bitcoin block attestation in the proof.' };
  let failure: OtsResult = { status: 'invalid', reason: 'No Bitcoin commitment matched a confirmed block.' };
  let unavailable: OtsResult | undefined;
  for (const att of parsed.attestations.sort((a, b) => a.height - b.height).slice(0, 4)) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const result = await verifyBitcoinHeader(att.height, att.digest, signal);
    if (result.status === 'verified') return result;
    if (result.status === 'unresolved') unavailable = result; else failure = result;
  }
  return unavailable ?? failure;
}
