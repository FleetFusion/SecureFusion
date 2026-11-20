/** Verify a Bitcoin commitment against a main-chain header agreed by two operators. */
import { bytesEqual, bytesToHex, hexToBytes } from './verifier/bytes';
export type BitcoinHeaderResult =
  | { status: 'verified'; bitcoin: { blockHeight: number; blockTimeUtc: string; blockHash: string } }
  | { status: 'invalid' | 'unresolved'; reason: string };
const PROVIDERS = ['https://blockstream.info/api', 'https://mempool.space/api'];
async function getText(url: string, signal?: AbortSignal): Promise<string> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    if (!response.ok) throw new Error('Bitcoin header service unavailable');
    const text = await response.text();
    if (text.length > 512) throw new Error('Bitcoin header response too large');
    return text.trim().toLowerCase();
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function verifyBitcoinHeader(height: number, digest: Uint8Array, signal?: AbortSignal): Promise<BitcoinHeaderResult> {
  if (!Number.isSafeInteger(height) || height < 0 || digest.length !== 32) return { status: 'invalid', reason: 'Invalid Bitcoin block attestation.' };
  try {
    const hashes = await Promise.all(PROVIDERS.map(p => getText(p + '/block-height/' + height, signal)));
    if (hashes.some(h => !/^[0-9a-f]{64}$/.test(h)) || hashes[0] !== hashes[1]) return { status: 'unresolved', reason: 'Independent Bitcoin services did not agree on the block. Please retry.' };
    let headerHex: string;
    try { headerHex = await getText(PROVIDERS[0] + '/block/' + hashes[0] + '/header', signal); }
    catch { headerHex = await getText(PROVIDERS[1] + '/block/' + hashes[0] + '/header', signal); }
    if (!/^[0-9a-f]{160}$/.test(headerHex)) return { status: 'unresolved', reason: 'Bitcoin service returned an invalid header.' };
    const header = hexToBytes(headerHex);
    const first = await crypto.subtle.digest('SHA-256', header);
    const hashed = new Uint8Array(await crypto.subtle.digest('SHA-256', first));
    if (bytesToHex(hashed.slice().reverse()) !== hashes[0]) return { status: 'unresolved', reason: 'Bitcoin header does not match the agreed block hash.' };
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const bits = view.getUint32(72, true), exponent = bits >>> 24, coefficient = bits & 0x7fffff;
    if ((bits & 0x800000) || !coefficient || exponent < 3 || exponent > 32) return { status: 'unresolved', reason: 'Invalid Bitcoin proof of work.' };
    const target = BigInt(coefficient) << BigInt(8 * (exponent - 3));
    const powLimit = 0xffffn << 208n;
    if (target > powLimit || BigInt('0x' + hashes[0]) > target) return { status: 'unresolved', reason: 'Invalid Bitcoin proof of work.' };
    if (!bytesEqual(digest, header.subarray(36, 68))) return { status: 'invalid', reason: 'OpenTimestamps commitment does not match the Bitcoin block Merkle root.' };
    return { status: 'verified', bitcoin: { blockHeight: height, blockHash: hashes[0], blockTimeUtc: new Date(view.getUint32(68, true) * 1000).toISOString() } };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    return { status: 'unresolved', reason: 'Bitcoin block verification could not be completed. Please retry.' };
  }
}
