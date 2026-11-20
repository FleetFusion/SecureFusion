/** Verify a Bitcoin commitment against a main-chain header agreed by two operators. */
import { bytesEqual, bytesToHex, hexToBytes } from './verifier/bytes';
export type BitcoinHeaderResult =
  | { status: 'verified'; bitcoin: { blockHeight: number; blockTimeUtc: string; blockHash: string } }
  | { status: 'invalid' | 'unresolved'; reason: string };
const PROVIDERS = ['https://blockstream.info/api', 'https://mempool.space/api'];
async function getText(url: string, signal?: AbortSignal, maxBytes = 512): Promise<string> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch(url, { signal: ctrl.signal, redirect: 'manual', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('Bitcoin header service unavailable');
    const text = await response.text();
    if (text.length > maxBytes) throw new Error('Bitcoin header response too large');
    return text.trim().toLowerCase();
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function verifyBitcoinHeader(height: number, digest: Uint8Array, signal?: AbortSignal): Promise<BitcoinHeaderResult> {
  if (!Number.isSafeInteger(height) || height < 0 || digest.length !== 32) return { status: 'invalid', reason: 'Invalid Bitcoin block attestation.' };
  try {
    const settled = await Promise.allSettled(PROVIDERS.map(p => getText(p + '/block-height/' + height, signal)));
    const candidates = settled.flatMap(r => r.status === 'fulfilled' && /^[0-9a-f]{64}$/.test(r.value) ? [r.value] : []);
    if (candidates.length !== 2 || candidates[0] !== candidates[1]) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      try {
        const fallback = JSON.parse(await getText('https://api.blockcypher.com/v1/btc/main/blocks/' + height + '?txstart=1&limit=1', signal, 16384));
        if (fallback.height === height && fallback.chain === 'btc.main' && typeof fallback.hash === 'string' && /^[0-9a-f]{64}$/.test(fallback.hash)) candidates.push(fallback.hash);
      } catch { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); }
    }
    const agreedHash = candidates.find(h => candidates.filter(other => other === h).length >= 2);
    if (!agreedHash) return { status: 'unresolved', reason: 'Two independent Bitcoin services could not confirm the same block. Please retry.' };
    const hashes = [agreedHash];
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
