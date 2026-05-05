/**
 * Browser SHA-256 hasher.
 *
 * The reference verifier uses Node's `crypto.createHash('sha256')` and
 * `fs.createReadStream`. The SPA replaces both:
 *   - Small files (≤ 256 MB by default): one-shot
 *     `crypto.subtle.digest('SHA-256', bytes)`. Native-fast and zero
 *     dependencies.
 *   - Large files: streaming SHA-256 via `hash-wasm`. We chunk through
 *     the `Blob.stream()` reader at 4 MB at a time so even multi-GB
 *     dashcam recordings hash without buffering the whole file in RAM.
 *
 * Both paths support cancellation (`AbortSignal`) and progress
 * reporting (`onProgress(fraction)`), so the orchestrator can wire the
 * hashing-progress UI in Phase C.
 */

import { createSHA256 } from 'hash-wasm';

import { bytesToHex } from './verifier/bytes';

/** Files above this size route through the streaming hasher. */
export const SHA256_NATIVE_THRESHOLD_BYTES = 256 * 1024 * 1024; // 256 MB

/** Streaming chunk size — small enough to keep memory bounded, large
 *  enough that wasm boundary-crossing overhead is amortised. */
const STREAMING_CHUNK_BYTES = 4 * 1024 * 1024;

export interface HashOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Hash a `File` (or any `Blob` with a known size) and return the
 * lowercase hex SHA-256 digest.
 */
export async function sha256File(file: File | Blob, opts: HashOptions = {}): Promise<string> {
  if (file.size <= SHA256_NATIVE_THRESHOLD_BYTES) {
    return sha256FileNative(file, opts);
  }
  return sha256FileStreaming(file, opts);
}

async function sha256FileNative(file: File | Blob, opts: HashOptions): Promise<string> {
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const buffer = await file.arrayBuffer();
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  opts.onProgress?.(1);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256FileStreaming(file: File | Blob, opts: HashOptions): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();

  const reader = file.stream().getReader();
  let read = 0;
  try {
    while (true) {
      if (opts.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new DOMException('aborted', 'AbortError');
      }
      const { value, done } = await reader.read();
      if (done) break;
      // value is a Uint8Array. Slice into bounded chunks so the wasm
      // boundary cost is amortised but memory stays low.
      let offset = 0;
      while (offset < value.byteLength) {
        const slice = value.subarray(
          offset,
          Math.min(offset + STREAMING_CHUNK_BYTES, value.byteLength),
        );
        hasher.update(slice);
        offset += slice.byteLength;
      }
      read += value.byteLength;
      if (file.size > 0) opts.onProgress?.(read / file.size);
    }
  } finally {
    // best-effort: if the loop bailed early, release the underlying
    // stream so the file handle isn't pinned.
    reader.releaseLock?.();
  }
  opts.onProgress?.(1);
  return hasher.digest('hex');
}
