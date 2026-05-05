import * as ed from '@noble/ed25519';

import { __resetForTests, verifyEd25519 } from './ed25519';

const SEED = new Uint8Array(Array.from({ length: 32 }, (_, i) => i));

describe('verifyEd25519', () => {
  beforeEach(() => __resetForTests());

  it('returns true on a valid signature (deterministic D11 seed)', async () => {
    const pub = await ed.getPublicKeyAsync(SEED);
    const msg = new TextEncoder().encode('hello');
    const sig = await ed.signAsync(msg, SEED);
    expect(await verifyEd25519({ message: msg, signature: sig, publicKey: pub })).toBeTrue();
  });

  it('returns false on a tampered signature', async () => {
    const pub = await ed.getPublicKeyAsync(SEED);
    const msg = new TextEncoder().encode('hello');
    const sig = await ed.signAsync(msg, SEED);
    sig[0] ^= 0xff;
    expect(await verifyEd25519({ message: msg, signature: sig, publicKey: pub })).toBeFalse();
  });

  it('returns false on a tampered message', async () => {
    const pub = await ed.getPublicKeyAsync(SEED);
    const msg = new TextEncoder().encode('hello');
    const sig = await ed.signAsync(msg, SEED);
    const tamperedMsg = new TextEncoder().encode('helloX');
    expect(
      await verifyEd25519({ message: tamperedMsg, signature: sig, publicKey: pub }),
    ).toBeFalse();
  });

  it('throws on wrong-size signature', async () => {
    await expectAsync(
      verifyEd25519({
        message: new Uint8Array(),
        signature: new Uint8Array(63),
        publicKey: new Uint8Array(32),
      }),
    ).toBeRejectedWithError(/64 bytes/);
  });

  it('throws on wrong-size public key', async () => {
    await expectAsync(
      verifyEd25519({
        message: new Uint8Array(),
        signature: new Uint8Array(64),
        publicKey: new Uint8Array(31),
      }),
    ).toBeRejectedWithError(/32 bytes/);
  });
});
