import { abortableDelay, requestRippled, retryDelayMs, RippledUnavailableError } from './rippled-request';

const response = (result: Record<string, unknown>, status = 200, retryAfter?: string): Response => ({
  status,
  headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
  json: async () => ({ result }),
}) as Response;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe('rippled availability handling', () => {
  beforeEach(() => jasmine.clock().install());
  afterEach(() => jasmine.clock().uninstall());

  it('honours the reported 16923ms cooldown rather than retrying immediately', async () => {
    const busy = response({ status: 'error', error: 'tooBusy', error_message: 'rate limit: units quota (2000 per 10s) exhausted, retry in ~16923ms' });
    const fetchSpy = spyOn(window, 'fetch').and.returnValues(Promise.resolve(busy), Promise.resolve(response({ status: 'success', transactions: [] })));
    const payload = { method: 'account_tx', params: [{ account: 'rTEST', marker: { ledger: 106103443, seq: 81 } }] };
    const result = requestRippled('https://node.example', payload);
    await flush();
    jasmine.clock().tick(17172);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    jasmine.clock().tick(1);
    await result;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.calls.argsFor(0)[1]!.body).toBe(fetchSpy.calls.argsFor(1)[1]!.body);
    expect(fetchSpy.calls.argsFor(1)[1]!.redirect).toBe('manual');
  });

  it('honours HTTP Retry-After on rate-limited responses', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.returnValues(
      Promise.resolve(response({}, 429, '20')),
      Promise.resolve(response({ validated: true })),
    );
    const pending = requestRippled('https://node.example', { method: 'tx' });
    await flush();
    jasmine.clock().tick(20249);
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    jasmine.clock().tick(1);
    expect((await pending)['validated']).toBeTrue();
  });

  it('stops after bounded retries and reports unavailable, not invalid video', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.callFake(async () => response({ status: 'error', error: 'tooBusy' }));
    let failure: unknown;
    const pending = requestRippled('https://node.example', { method: 'tx' }).catch(error => { failure = error; });
    for (const delay of [1250, 2250, 4250]) { await flush(); jasmine.clock().tick(delay); }
    await pending;
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(failure instanceof RippledUnavailableError).toBeTrue();
  });

  it('cancels a cooldown without issuing another request', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.callFake(async () => response({ status: 'error', error: 'tooBusy' }));
    const ctrl = new AbortController();
    const pending = requestRippled('https://node.example', { method: 'tx' }, ctrl.signal);
    await flush();
    ctrl.abort();
    await expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    jasmine.clock().tick(60000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry or follow redirects and does not retry protocol failures', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(response({}, 302));
    await expectAsync(requestRippled('https://node.example', { method: 'tx' })).toBeRejectedWithError(/HTTP 302/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.and.resolveTo(response({ status: 'error', error: 'invalidParams' }));
    await expectAsync(requestRippled('https://node.example', { method: 'tx' })).toBeRejectedWithError(/invalidParams/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does not shorten a long server wait or hang indefinitely', async () => {
    const fetchSpy = spyOn(window, 'fetch').and.resolveTo(response({}, 429, '120'));
    await expectAsync(requestRippled('https://node.example', { method: 'tx' })).toBeRejectedWithError(RippledUnavailableError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(retryDelayMs(null, 'retry in ~16923ms', 0)).toBe(17173);
    const ctrl = new AbortController(); ctrl.abort();
    await expectAsync(abortableDelay(1000, ctrl.signal)).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
  });
});
