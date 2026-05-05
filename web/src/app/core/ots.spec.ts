import { verifyOtsProof } from './ots';

describe('verifyOtsProof (browser shim)', () => {
  it('returns digest-mismatch:not-64-hex when digest is malformed', async () => {
    const r = await verifyOtsProof(new Uint8Array([1]), 'short');
    expect(r.status).toBe('unresolved');
    if (r.status === 'unresolved') expect(r.reason).toContain('digest-mismatch');
  });

  it('returns ots-bytes-empty when otsBytes is zero-length', async () => {
    const r = await verifyOtsProof(new Uint8Array(0), 'a'.repeat(64));
    expect(r.status).toBe('unresolved');
    if (r.status === 'unresolved') expect(r.reason).toBe('ots-bytes-empty');
  });

  it('reports ots-library-not-installed when the optional lib is absent', async () => {
    // The SPA does not depend on javascript-opentimestamps in package.json,
    // so the dynamic import will reject. The wrapper must surface that as
    // ots-library-not-installed, matching the Node reference.
    const r = await verifyOtsProof(new Uint8Array([1, 2, 3]), 'a'.repeat(64));
    expect(r.status).toBe('unresolved');
    if (r.status === 'unresolved') {
      expect(r.reason).toBe('ots-library-not-installed');
    }
  });
});
