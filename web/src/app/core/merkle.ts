import { concatBytes, bytesToHex, hexToBytes } from './verifier/bytes';
/** Replay the publisher's Bitcoin/NBitcoin double-SHA-256 Merkle branch. */
export async function applyMerkleBranch(leafHex: string, branch: unknown): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(leafHex) || !Array.isArray(branch) || branch.length > 128) throw new Error('Invalid event Merkle proof.');
  let acc = hexToBytes(leafHex);
  for (const step of branch) {
    if (!step || (step.side !== 'L' && step.side !== 'R') || typeof step.hash !== 'string' || !/^[0-9a-f]{64}$/i.test(step.hash)) throw new Error('Invalid event Merkle proof step.');
    const sibling = hexToBytes(step.hash);
    const first = await crypto.subtle.digest('SHA-256', step.side === 'L' ? concatBytes(sibling, acc) : concatBytes(acc, sibling));
    acc = new Uint8Array(await crypto.subtle.digest('SHA-256', first));
  }
  return bytesToHex(acc);
}
