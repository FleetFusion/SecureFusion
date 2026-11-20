/** Read-only ledger requests. A busy node is an availability issue, not a failed proof. */
export class RippledUnavailableError extends Error {
  constructor(message = 'The ledger service is temporarily unavailable. Verification has not completed. Please try again shortly.') {
    super(message);
    this.name = 'RippledUnavailableError';
  }
}

export interface RetryNotice {
  readonly waitMs: number;
  readonly attempt: number;
}

export function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Retry-After supports seconds or an HTTP date. The cluster also reports retry in ~16923ms. */
export function retryDelayMs(header: string | null, message: string, attempt: number): number {
  const seconds = header !== null && header.trim() !== '' ? Number(header) : NaN;
  const httpDelay = Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
    : header ? Math.max(0, Date.parse(header) - Date.now()) : 0;
  const match = /retry\s+in\s*~?\s*(\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(message);
  const bodyDelay = match ? Number(match[1]) * (match[2].toLowerCase() === 'ms' ? 1 : 1000) : 0;
  return Math.max(Number.isFinite(httpDelay) ? httpDelay : 0, bodyDelay, 1000 * 2 ** attempt) + 250;
}

export async function requestRippled<T extends Record<string, unknown>>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  onRetry?: (notice: RetryNotice) => void,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    let result: (T & { error?: string; error_message?: string; status?: string }) | undefined;
    let retryable = false;
    let message = '';
    let delay = 0;
    try {
      response = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), redirect: 'manual', signal: controller.signal,
      });
      retryable = [429, 502, 503, 504].includes(response.status);
      if (response.status === 200) {
        const json = await response.json() as { result?: typeof result };
        result = json.result;
        if (!result) throw new Error('rippled response missing result');
        retryable = result.error === 'tooBusy' || result.error === 'slowDown';
        if (!retryable) {
          if (result.status === 'error' || result.error) throw new Error(`rippled error: ${result.error}`);
          return result;
        }
        message = result.error_message ?? '';
      } else if (!retryable) {
        throw new Error(`rippled HTTP ${response.status} from ${url} (redirects are refused; user must point at a trusted node)`);
      }
      delay = retryDelayMs(response.headers.get('Retry-After'), message, attempt);
    } catch (error) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      if (controller.signal.aborted || error instanceof TypeError) throw new RippledUnavailableError();
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
    // Do not retry indefinitely, and never shorten a server-requested wait.
    if (attempt === 3 || delay > 60000) throw new RippledUnavailableError();
    onRetry?.({ waitMs: delay, attempt: attempt + 1 });
    await abortableDelay(delay, signal);
  }
  throw new RippledUnavailableError();
}
