import { accountTx, fetchTransaction } from './xrpl';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchTransaction', () => {
  afterEach(() => {
    // jasmine cleans spies between specs but keep this explicit so
    // a forgotten `and.callFake` can't bleed.
  });

  it('rejects non-64-char tx hashes', async () => {
    await expectAsync(fetchTransaction('abc')).toBeRejectedWithError(/64 uppercase hex/);
  });

  it('throws on non-200 (redirects refused)', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse({}, 302));
    await expectAsync(fetchTransaction('A'.repeat(64))).toBeRejectedWithError(
      /HTTP 302/,
    );
  });

  it('throws when not yet validated', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse({ result: { validated: false } }));
    await expectAsync(fetchTransaction('A'.repeat(64))).toBeRejectedWithError(
      /not yet validated/,
    );
  });

  it('returns result on success', async () => {
    spyOn(window, 'fetch').and.resolveTo(
      jsonResponse({ result: { validated: true, hash: 'A'.repeat(64), Memos: [] } }),
    );
    const r = await fetchTransaction('A'.repeat(64));
    expect(r['hash']).toBe('A'.repeat(64));
  });

  it('passes redirect:manual to fetch', async () => {
    const spy = spyOn(window, 'fetch').and.resolveTo(
      jsonResponse({ result: { validated: true, hash: 'A'.repeat(64), Memos: [] } }),
    );
    await fetchTransaction('A'.repeat(64));
    const init = spy.calls.mostRecent().args[1]!;
    expect(init.redirect).toBe('manual');
  });
});

describe('accountTx', () => {
  it('yields validated txs page-by-page and stops when no marker', async () => {
    const calls: unknown[] = [];
    spyOn(window, 'fetch').and.callFake(async (_url, init) => {
      calls.push(JSON.parse(init!.body as string));
      if (calls.length === 1) {
        return jsonResponse({
          result: {
            transactions: [
              {
                tx: { hash: 'X', TransactionType: 'Payment' },
                validated: true,
                ledger_index: 100,
              },
            ],
            marker: { ledger: 200 },
          },
        });
      }
      return jsonResponse({ result: { transactions: [], marker: undefined } });
    });
    const yields: unknown[] = [];
    for await (const t of accountTx('rTEST')) yields.push(t);
    expect(yields.length).toBe(1);
    expect(calls.length).toBe(2);
  });

  it('honours AbortSignal between pages', async () => {
    const ctrl = new AbortController();
    spyOn(window, 'fetch').and.callFake(async () => {
      ctrl.abort();
      return jsonResponse({
        result: { transactions: [], marker: { ledger: 1 } },
      });
    });
    const yields: unknown[] = [];
    for await (const t of accountTx('rTEST', { signal: ctrl.signal })) yields.push(t);
    expect(yields.length).toBe(0);
  });

  it('forwards the marker on subsequent calls (resume contract)', async () => {
    const calls: Array<Record<string, unknown>> = [];
    spyOn(window, 'fetch').and.callFake(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      calls.push(body.params[0]);
      if (calls.length === 1) {
        return jsonResponse({
          result: { transactions: [], marker: { ledger: 42, seq: 7 } },
        });
      }
      return jsonResponse({ result: { transactions: [], marker: undefined } });
    });
    for await (const _ of accountTx('rTEST')) {
      /* drain */
    }
    expect(calls.length).toBe(2);
    expect(calls[0]['marker']).toBeUndefined();
    expect(calls[1]['marker']).toEqual({ ledger: 42, seq: 7 });
  });

  it('skips unvalidated txs', async () => {
    spyOn(window, 'fetch').and.resolveTo(
      jsonResponse({
        result: {
          transactions: [
            { tx: { hash: 'A' }, validated: false, ledger_index: 1 },
            { tx: { hash: 'B' }, validated: true, ledger_index: 2 },
          ],
          marker: undefined,
        },
      }),
    );
    const yields: Array<{ tx: { hash?: string } }> = [];
    for await (const t of accountTx('rTEST')) yields.push(t);
    expect(yields.length).toBe(1);
    expect(yields[0].tx.hash).toBe('B');
  });
});

describe('Public ledger connection fallback',()=>{
 const rpcResponse=(body:unknown)=>({status:200,headers:new Headers(),json:async()=>body}) as Response;
 beforeEach(()=>jasmine.clock().install());afterEach(()=>jasmine.clock().uninstall());
 async function flush(){for(let i=0;i<30;i++)await Promise.resolve();}
 it('uses the official cluster alias after primary connection failures',async()=>{
  const requests=spyOn(window,'fetch').and.callFake(async url=>{if(String(url).includes('xrplcluster.com'))throw new TypeError('offline');return rpcResponse({result:{validated:true,hash:'A'.repeat(64)}});});
  const pending=fetchTransaction('A'.repeat(64));for(const delay of [1250,2250,4250]){await flush();jasmine.clock().tick(delay);}expect((await pending).validated).toBeTrue();expect(String(requests.calls.mostRecent().args[0])).toBe('https://xrpl.ws/');
 });
 it('never changes a user-selected custom ledger node or network',async()=>{
  const requests=spyOn(window,'fetch').and.rejectWith(new TypeError('offline'));const pending=fetchTransaction('A'.repeat(64),{rippledUrl:'https://custom.testnet.example'}).catch(error=>error);
  for(const delay of [1250,2250,4250]){await flush();jasmine.clock().tick(delay);}await pending;expect(requests.calls.allArgs().every(args=>args[0]==='https://custom.testnet.example')).toBeTrue();
 });
 it('restarts pagination on the alias from the inclusive boundary without reusing the marker or losing records',async()=>{
  const requests:Array<{url:string,params:Record<string,unknown>}>=[];let primary=0;
  spyOn(window,'fetch').and.callFake(async(url,init)=>{const params=JSON.parse(init!.body as string).params[0];requests.push({url:String(url),params});
   if(String(url).includes('xrplcluster.com')){if(primary++===0)return rpcResponse({result:{transactions:[{tx:{hash:'first'},validated:true,ledger_index:100}],marker:{ledger:100,seq:1}}});throw new TypeError('offline');}
   return rpcResponse({result:{transactions:[{tx:{hash:'first'},validated:true,ledger_index:100},{tx:{hash:'same-ledger-unseen'},validated:true,ledger_index:100},{tx:{hash:'next'},validated:true,ledger_index:101}]}});
  });
  const hashes:string[]=[];const pending=(async()=>{for await(const row of accountTx('rTEST',{fromLedger:50}))hashes.push(row.tx.hash!);})();
  await flush();jasmine.clock().tick(1000);for(const delay of [1250,2250,4250]){await flush();jasmine.clock().tick(delay);}await pending;
  expect(hashes).toEqual(['first','same-ledger-unseen','next']);const alias=requests.at(-1)!;expect(alias.url).toBe('https://xrpl.ws/');expect(alias.params['marker']).toBeUndefined();expect(alias.params['ledger_index_min']).toBe(100);
 });
 it('limits the recent probe to one page even if the ledger advertises more history',async()=>{
  const requests=spyOn(window,'fetch').and.resolveTo(rpcResponse({result:{transactions:[{tx:{hash:'recent'},validated:true,ledger_index:100}],marker:{ledger:99}}}));let count=0;for await(const _ of accountTx('rTEST',{forward:false,maxPages:1}))count++;expect(count).toBe(1);expect(requests).toHaveBeenCalledTimes(1);
 });
});
