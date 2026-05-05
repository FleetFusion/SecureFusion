/**
 * SHA-256 hashing primitives for SecureFusion.
 *
 * Files are streamed rather than buffered, so hashing a 4 GB dashcam
 * recording does not require 4 GB of RAM.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Hash a buffer or string.
 *
 * @param {Uint8Array | string} data
 * @returns {string} - lowercase hex SHA-256
 */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash bytes and return raw bytes.
 *
 * @param {Uint8Array | string} data
 * @returns {Buffer}
 */
export function sha256Bytes(data) {
  return createHash('sha256').update(data).digest();
}

/**
 * Hash a file by streaming it from disk.
 *
 * @param {string} filePath
 * @returns {Promise<string>} - lowercase hex SHA-256
 */
export async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
