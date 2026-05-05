/**
 * Ed25519 signature verification.
 *
 * Replaces the reference verifier's Node `crypto.verify(null, ...)` with
 * a browser-friendly wrapper. Strategy:
 *
 *   1. Try `crypto.subtle.verify('Ed25519', cryptoKey, sig, msg)`. The
 *      WebCrypto Ed25519 API is shipping in Chrome 113+, Edge 113+,
 *      Safari 16+, Firefox 130+ and reaches the browser's hardware /
 *      JIT-accelerated implementation.
 *   2. Fall back to `@noble/ed25519` (lazy-loaded) when native rejects
 *      or `crypto.subtle.importKey` throws — covers Firefox <130 and
 *      any future spec wobble.
 *
 * The fallback is lazy: the noble bundle is only fetched if native
 * verify fails on first use (per-process cached). On the headless
 * Karma Chrome that drives our test suite, only the native path runs.
 */

const ED25519_RAW_PUBKEY_LEN = 32;
const ED25519_SIG_LEN = 64;

let nobleLoader: Promise<typeof import('@noble/ed25519')> | null = null;
let nativeUnsupported = false;

export interface VerifyEd25519Args {
  message: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}

/**
 * Verify an Ed25519 signature. Returns false on a tampered signature;
 * throws only on caller errors (wrong-size key/signature). Network
 * failures inside `import('@noble/ed25519')` propagate as throws.
 */
export async function verifyEd25519(args: VerifyEd25519Args): Promise<boolean> {
  if (args.signature.length !== ED25519_SIG_LEN) {
    throw new Error(
      `Ed25519 signature must be 64 bytes, got ${args.signature.length}`,
    );
  }
  if (args.publicKey.length !== ED25519_RAW_PUBKEY_LEN) {
    throw new Error(
      `Ed25519 public key must be 32 bytes, got ${args.publicKey.length}`,
    );
  }

  if (!nativeUnsupported) {
    try {
      return await verifyNative(args);
    } catch {
      // The browser doesn't ship Ed25519 yet (e.g. Firefox <130) or
      // the implementation rejected at importKey. Latch the flag so
      // we don't pay the throw cost on every subsequent verify.
      nativeUnsupported = true;
    }
  }

  return verifyWithNoble(args);
}

async function verifyNative(args: VerifyEd25519Args): Promise<boolean> {
  // crypto.subtle.importKey accepts the raw 32-byte public key when
  // the algorithm is the string 'Ed25519' (Chromium, Safari) — no DER
  // wrapping needed, unlike Node's crypto.createPublicKey.
  const key = await crypto.subtle.importKey(
    'raw',
    args.publicKey as BufferSource,
    { name: 'Ed25519' } as AlgorithmIdentifier,
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    { name: 'Ed25519' } as AlgorithmIdentifier,
    key,
    args.signature as BufferSource,
    args.message as BufferSource,
  );
}

async function verifyWithNoble(args: VerifyEd25519Args): Promise<boolean> {
  if (!nobleLoader) {
    nobleLoader = import('@noble/ed25519');
  }
  const noble = await nobleLoader;
  const fn = noble.verifyAsync ?? noble.verify;
  return fn(args.signature, args.message, args.publicKey);
}

/** For unit tests: reset the latched native-unsupported flag. */
export function __resetForTests(): void {
  nativeUnsupported = false;
  nobleLoader = null;
}
