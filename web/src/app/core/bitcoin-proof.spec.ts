import { parseBitcoinProofFile, verifySuppliedBitcoinProof } from './bitcoin-proof';
import { OTS_TEST_FIXTURE as fixture } from './ots-test-fixture';
const bundle = () => ({bundleHash:fixture.digest,merkleProofJson:'[]',otsProofBase64:fixture.base64});
describe('Locally supplied Bitcoin proof',()=>{
 it('verifies a real proof after binding it to the expected bundle',async()=>{spyOn(window,'fetch').and.callFake(async url=>new Response(String(url).endsWith('/header')?fixture.blocks[0].header:fixture.blocks[0].blockHash));const result=await verifySuppliedBitcoinProof(bundle(),fixture.digest);expect(result.status).toBe('verified');expect(result.proofSource).toBe('local');expect(result.bitcoin?.blockHeight).toBe(358391);});
 it('rejects a proof for another event without any network request',async()=>{const request=spyOn(window,'fetch');const result=await verifySuppliedBitcoinProof(bundle(),'a'.repeat(64));expect(result.status).toBe('invalid');expect(request).not.toHaveBeenCalled();});
 it('rejects malformed, oversized and HTML downloads',()=>{for(const text of ['<!DOCTYPE html><title>Portal</title>','{}',' '.repeat(131073)])expect(()=>parseBitcoinProofFile(text)).toThrow();});
 it('rejects altered proof bytes and malformed Merkle branches',async()=>{expect((await verifySuppliedBitcoinProof({...bundle(),otsProofBase64:'AA=='},fixture.digest)).status).toBe('invalid');expect((await verifySuppliedBitcoinProof({...bundle(),merkleProofJson:'[{"side":"X","hash":"bad"}]'},fixture.digest)).status).toBe('invalid');});
});
