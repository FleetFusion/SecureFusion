/**
 * Ed25519 signature verification for the SF1.sig memo.
 *
 * Uses Node.js native crypto (Node 20+).
 */

import { createPublicKey, verify as nodeVerify } from 'node:crypto';

/**
 * Verify an Ed25519 signature.
 *
 * @param {object} args
 * @param {Buffer} args.message    - bundleBytes || eventBytes (concatenated raw bytes)
 * @param {Buffer} args.signature  - 64-byte Ed25519 signature
 * @param {Buffer} args.publicKey  - 32-byte raw Ed25519 public key
 * @returns {boolean}
 */
export function verifySignature({ message, signature, publicKey }) {
  if (signature.length !== 64) {
    throw new Error(`Ed25519 signature must be 64 bytes, got ${signature.length}`);
  }
  if (publicKey.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }

  // Wrap the raw 32-byte public key in DER format for Node's createPublicKey.
  const der = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    publicKey,
  ]);

  const keyObject = createPublicKey({
    key: der,
    format: 'der',
    type: 'spki',
  });

  return nodeVerify(null, message, keyObject, signature);
}
