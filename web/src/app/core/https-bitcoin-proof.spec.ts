import { fetchHttpsBitcoinProof } from './https-bitcoin-proof';
import { OTS_TEST_FIXTURE as fixture } from './ots-test-fixture';
import { makeRegistry } from './test-fixtures';
import type { RegistryEntry } from './verifier-types';
const proof = { bundleHash: fixture.digest, merkleProofJson: '[]', otsProofBase64: fixture.base64 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
async function entry(): Promise<RegistryEntry> { return { ...(await makeRegistry())[0], bitcoinProofMode: 'https', bitcoinProofUrlTemplate: 'https://proof.example/bitcoin/{bundleHash}' }; }
describe('Automatic HTTPS Bitcoin proof', () => {
 it('downloads only public proof bytes then independently verifies a real Bitcoin commitment', async () => {
  const request = spyOn(window, 'fetch').and.callFake(async (url, init) => {
   if (String(url).startsWith('https://proof.example/')) { expect(init?.method).toBe('GET'); expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error'); expect(init?.body).toBeUndefined(); return json(proof); }
   return new Response(String(url).endsWith('/header') ? fixture.blocks[0].header : fixture.blocks[0].blockHash);
  });
  const result = await fetchHttpsBitcoinProof(await entry(), fixture.digest, 'event');
  expect(result.status).toBe('verified'); expect(result.proofSource).toBe('https'); expect(result.bitcoin?.blockHeight).toBe(358391); expect(request.calls.first().args[0]).toBe('https://proof.example/bitcoin/' + fixture.digest);
 });
 it('rejects a service proof for another signed event', async () => { spyOn(window, 'fetch').and.resolveTo(json(proof)); const result = await fetchHttpsBitcoinProof(await entry(), 'a'.repeat(64), 'event'); expect(result.status).toBe('invalid'); });
 it('reports a missing proof without claiming Bitcoin verification', async () => { spyOn(window, 'fetch').and.resolveTo(json({}, 404)); expect((await fetchHttpsBitcoinProof(await entry(), fixture.digest, 'event')).status).toBe('not-found'); });
 for (const [label, response] of [['HTML', () => new Response('<html>Portal</html>', { headers: { 'content-type': 'text/html' } })], ['malformed JSON', () => json({})], ['oversize', () => json('x'.repeat(131073))], ['server error', () => json({}, 503)]] as const) {
  it('handles ' + label + ' without a false verification', async () => { spyOn(window, 'fetch').and.callFake(async () => response()); expect((await fetchHttpsBitcoinProof(await entry(), fixture.digest, 'event')).status).toBe('unavailable'); });
 }
 it('handles a network failure', async () => { spyOn(window, 'fetch').and.rejectWith(new TypeError('offline')); expect((await fetchHttpsBitcoinProof(await entry(), fixture.digest, 'event')).status).toBe('unavailable'); });
 it('rejects insecure or credential-bearing proof URLs without sending a request', async () => { const request = spyOn(window, 'fetch'); for (const template of ['http://proof.example/{bundleHash}', 'https://user:pass@proof.example/{bundleHash}', 'https://proof.example/unbound']) expect((await fetchHttpsBitcoinProof({ ...await entry(), bitcoinProofUrlTemplate: template }, fixture.digest, 'event')).status).toBe('unavailable'); expect(request).not.toHaveBeenCalled(); });
 it('propagates cancellation', async () => { const ctrl = new AbortController(); ctrl.abort(); spyOn(window, 'fetch').and.rejectWith(new DOMException('aborted', 'AbortError')); await expectAsync(fetchHttpsBitcoinProof(await entry(), fixture.digest, 'event', ctrl.signal)).toBeRejected(); });
});
