import { parseBitcoinProofFile, verifySuppliedBitcoinProof } from './bitcoin-proof';
import type { RegistryEntry, Tier3Result } from './verifier-types';

/** HTTPS transports public proof bytes only; every cryptographic link is checked locally. */
export async function fetchHttpsBitcoinProof(entry: RegistryEntry, bundleHash: string, eventId: unknown, signal?: AbortSignal): Promise<Tier3Result> {
  const mode = 'https' as const;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const template = entry.bitcoinProofUrlTemplate;
    if (!template || !template.includes('{bundleHash}')) throw new Error('Missing bundle-bound Bitcoin proof URL.');
    const address = template.replaceAll('{bundleHash}', encodeURIComponent(bundleHash))
      .replaceAll('{eventId}', encodeURIComponent(typeof eventId === 'string' ? eventId : ''));
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || /[{}]/.test(address)) throw new Error('Invalid Bitcoin proof URL.');
    const response = await fetch(url.href, { method: 'GET', signal: ctrl.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (response.status === 404) return { status: 'not-found', bitcoinProofMode: mode, proofSource: mode, reason: 'A completed Bitcoin proof is not yet available for this video.' };
    if (!response.ok) throw new Error('Bitcoin proof service is temporarily unavailable. Please retry.');
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('The Bitcoin proof service did not return a JSON proof.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('The Bitcoin proof service returned an empty response.');
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) { const next = await reader.read(); if (next.done) break; length += next.value.length;
        if (length > 131072) throw new Error('The Bitcoin proof response is too large.'); chunks.push(next.value); }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let proof;
    try { proof = parseBitcoinProofFile(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new Error('The Bitcoin proof service returned a malformed proof.'); }
    const checked = await verifySuppliedBitcoinProof(proof, bundleHash, signal);
    return { ...checked, bitcoinProofMode: mode, proofSource: mode };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'unavailable', bitcoinProofMode: mode, proofSource: mode,
      reason: ctrl.signal.aborted ? 'The Bitcoin proof request timed out. Please retry.' : (error as Error).message };
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
