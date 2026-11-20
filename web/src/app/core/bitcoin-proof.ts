import { applyMerkleBranch } from './merkle';
import { verifyOtsProof } from './ots';
import type { SuppliedBitcoinProof, Tier3Result } from './verifier-types';
/** A local proof is untrusted input: it must link the signed event to a real Bitcoin block. */
export function parseBitcoinProofFile(text: string): SuppliedBitcoinProof {
  if (text.length > 131072) throw new Error('Bitcoin proof file is too large.');
  const value = JSON.parse(text) as Partial<SuppliedBitcoinProof> | null;
  if (!value || typeof value.bundleHash !== 'string' || !/^[0-9a-f]{64}$/i.test(value.bundleHash) ||
      typeof value.merkleProofJson !== 'string' || value.merkleProofJson.length > 32768 ||
      typeof value.otsProofBase64 !== 'string' || value.otsProofBase64.length > 90000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.otsProofBase64) || !value.otsProofBase64.length) {
    throw new Error('Choose a Bitcoin proof JSON file containing bundleHash, merkleProofJson and otsProofBase64.');
  }
  return { bundleHash: value.bundleHash.toLowerCase(), merkleProofJson: value.merkleProofJson, otsProofBase64: value.otsProofBase64 };
}
export async function verifySuppliedBitcoinProof(proof: SuppliedBitcoinProof, expectedBundle: string, signal?: AbortSignal): Promise<Tier3Result> {
  try {
    const input = parseBitcoinProofFile(JSON.stringify(proof));
    if (input.bundleHash !== expectedBundle) throw new Error('This Bitcoin proof belongs to a different video event.');
    const merkleRoot = await applyMerkleBranch(expectedBundle, JSON.parse(input.merkleProofJson));
    const bytes = Uint8Array.from(atob(input.otsProofBase64), ch => ch.charCodeAt(0));
    const result = await verifyOtsProof(bytes, merkleRoot, signal);
    if (result.status === 'verified') return { status: 'verified', bitcoin: result.bitcoin, merkleRoot, proofSource: 'local' };
    return { status: result.status === 'invalid' ? 'invalid' : 'unavailable', reason: result.reason, merkleRoot, proofSource: 'local' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'invalid', reason: (error as Error).message, proofSource: 'local' };
  }
}
