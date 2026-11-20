import { parseOtsProof, verifyOtsProof } from './ots';
import { hexToBytes } from './verifier/bytes';
import { OTS_TEST_FIXTURE as fixture } from './ots-test-fixture';
const proof = () => Uint8Array.from(atob(fixture.base64), c => c.charCodeAt(0));
describe('OpenTimestamps Bitcoin verification', () => {
  function mockHeaders(disagree = false): jasmine.Spy {
    return spyOn(window, 'fetch').and.callFake(async input => {
      const url = String(input);
      return new Response(url.endsWith('/header') ? fixture.blocks[0].header : disagree && url.startsWith('https://mempool.space') ? 'f'.repeat(64) : fixture.blocks[0].blockHash);
    });
  }
  it('replays an independent real proof to its Bitcoin Merkle root', async () => {
    const parsed = await parseOtsProof(proof(), fixture.digest);
    expect(parsed.attestations[0].height).toBe(358391);
    expect(Array.from(parsed.attestations[0].digest)).toEqual(Array.from(hexToBytes(fixture.blocks[0].digest)));
  });
  it('verifies the real proof, block header hash and proof of work with two operators', async () => {
    const fetchSpy = mockHeaders();
    const r = await verifyOtsProof(proof(), fixture.digest);
    expect(r.status).toBe('verified');
    if (r.status === 'verified') { expect(r.bitcoin.blockHeight).toBe(358391); expect(r.bitcoin.blockHash).toBe(fixture.blocks[0].blockHash); }
    expect(fetchSpy.calls.allArgs().some(a => String(a[0]).startsWith('https://mempool.space/'))).toBeTrue();
    expect(fetchSpy.calls.allArgs().every(a => a[1]?.method !== 'POST')).toBeTrue();
  });
  it('rejects a proof for a different event digest before any network request', async () => {
    const fetchSpy = mockHeaders(); const r = await verifyOtsProof(proof(), 'a'.repeat(64));
    expect(r.status).toBe('invalid'); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('never confirms Bitcoin when independent services disagree', async () => {
    mockHeaders(true); expect((await verifyOtsProof(proof(), fixture.digest)).status).toBe('unresolved');
  });
  it('does not confirm a proof if the block header was changed', async () => {
    spyOn(window, 'fetch').and.callFake(async input => new Response(String(input).endsWith('/header') ? fixture.blocks[0].header.slice(0,-2)+'00' : fixture.blocks[0].blockHash));
    expect((await verifyOtsProof(proof(), fixture.digest)).status).not.toBe('verified');
  });
  it('does not confirm a raw proof attached to a different digest', async () => {
    mockHeaders(); expect((await verifyOtsProof(proof().slice(65), 'a'.repeat(64))).status).toBe('invalid');
  });
  it('rejects truncated, empty, trailing and oversized proofs', async () => {
    for (const bytes of [proof().slice(0,-1), new Uint8Array(0), new Uint8Array([...proof(),0]), new Uint8Array(65537)]) expect((await verifyOtsProof(bytes, fixture.digest)).status).toBe('invalid');
  });
  it('rejects a malformed digest', async () => { expect((await verifyOtsProof(proof(), 'short')).status).toBe('invalid'); });
});
