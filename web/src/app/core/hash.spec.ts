import { sha256File, SHA256_NATIVE_THRESHOLD_BYTES } from './hash';

describe('sha256File', () => {
  it('hashes a small File via crypto.subtle (native path)', async () => {
    const blob = new Blob([new Uint8Array([0x61, 0x62, 0x63])]); // "abc"
    const file = new File([blob], 'tiny.mp4', { type: 'video/mp4' });
    const hex = await sha256File(file);
    expect(hex).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('exposes the streaming threshold as a constant for tests', () => {
    expect(SHA256_NATIVE_THRESHOLD_BYTES).toBe(256 * 1024 * 1024);
  });

  it('reports progress via the supplied callback (1 MB)', async () => {
    const buf = new Uint8Array(1024 * 1024).fill(0x55); // 1 MB
    const file = new File([buf], 'mid.mp4', { type: 'video/mp4' });
    const seen: number[] = [];
    await sha256File(file, { onProgress: (p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(1);
  });

  it('hashes a 5 MB File via the native path', async () => {
    const size = 5 * 1024 * 1024;
    const buf = new Uint8Array(size).fill(0x00); // 5 MB of 0x00 bytes
    const file = new File([buf], 'five.mp4', { type: 'video/mp4' });
    const hex = await sha256File(file);
    // SHA-256 of 5 MiB of 0x00. Computed deterministically.
    // openssl: dd if=/dev/zero bs=1M count=5 | sha256sum
    expect(hex).toBe(
      'c036cbb7553a909f8b8877d4461924307f27ecb66cff928eeeafd569c3887e29',
    );
  });

  it('honours AbortSignal before completion', async () => {
    const buf = new Uint8Array(1024 * 1024).fill(0xaa);
    const file = new File([buf], 'cancel.mp4');
    const ctrl = new AbortController();
    ctrl.abort();
    await expectAsync(sha256File(file, { signal: ctrl.signal })).toBeRejected();
  });

  it('routes a synthetic blob above the threshold through the streaming hasher', async () => {
    // Force the streaming path with a tiny in-memory blob by spying
    // and dropping a fake `size` larger than the threshold. We hash
    // a small payload (3 bytes "abc") but pretend it is huge so the
    // streaming code path runs. Both paths must produce the SHA-256
    // of "abc" — that is the point: the outputs are byte-identical.
    const realBlob = new Blob([new Uint8Array([0x61, 0x62, 0x63])]);
    const fake = Object.create(Blob.prototype) as Blob;
    Object.defineProperty(fake, 'size', { value: SHA256_NATIVE_THRESHOLD_BYTES + 1 });
    Object.defineProperty(fake, 'stream', { value: () => realBlob.stream() });
    Object.defineProperty(fake, 'arrayBuffer', { value: () => realBlob.arrayBuffer() });
    const hex = await sha256File(fake);
    expect(hex).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
