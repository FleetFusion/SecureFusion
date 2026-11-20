/**
 * XRPL transaction fetching, browser variant.
 *
 * Vendored TypeScript port of `reference-verifier/src/xrpl.js`.
 * The reference uses Node's global `fetch`; the browser global is
 * the same shape, including support for `redirect: 'manual'` and
 * `signal` (AbortSignal). Behavioural rules — refuse 30x redirects,
 * filter `validated:true`, multi-node N-of-M agreement check —
 * preserved verbatim.
 *
 * Security model (B2.8 / DA §3):
 *   - The user is responsible for choosing a TRUSTED rippled URL.
 *   - `redirect: 'manual'` so a 30x cannot bounce the call to an
 *     attacker host.
 *   - `multiNodeUrls` enables an integrity cross-check across N
 *     independent operators.
 */

import { abortableDelay, requestRippled, RippledUnavailableError, type RetryNotice } from './rippled-request';

const DEFAULT_RIPPLED_URL = 'https://xrplcluster.com';
// Official alias of the same public Mainnet cluster. Custom endpoints never switch networks.
function ledgerEndpoints(url: string): string[] {
  return [DEFAULT_RIPPLED_URL, DEFAULT_RIPPLED_URL + '/'].includes(url) ? [url, 'https://xrpl.ws/'] : [url];
}

export interface FetchTransactionOptions {
  rippledUrl?: string;
  multiNodeUrls?: string[];
  onRetry?: (notice: RetryNotice) => void;
  agreementThreshold?: number;
  signal?: AbortSignal;
}

export interface AccountTxOptions {
  rippledUrl?: string;
  fromLedger?: number;
  /** Newest-first discovery is used to find later Bitcoin proof upgrades. */
  forward?: boolean;
  pageSize?: number;
  /** Bounded recent-history probe; omitted for complete history traversal. */
  maxPages?: number;
  onRetry?: (notice: RetryNotice) => void;
  signal?: AbortSignal;
}

// rippled response payloads are highly variable; we type them as
// loose records and let the orchestrator narrow downstream.
export type RippledTxResult = Record<string, unknown> & {
  hash?: string;
  validated?: boolean;
  ledger_index?: number;
  TransactionType?: string;
  Account?: string;
  Destination?: string;
  Amount?: string | number;
  Memos?: unknown[];
  date?: number;
};

export interface AccountTxYield {
  tx: RippledTxResult;
  meta: unknown;
  ledger_index: number;
  validated: true;
}

/**
 * Fetch a validated transaction by hash.
 */
export async function fetchTransaction(
  txHash: string,
  options: FetchTransactionOptions = {},
): Promise<RippledTxResult> {
  if (!/^[0-9A-F]{64}$/.test(txHash)) {
    throw new Error('txHash must be 64 uppercase hex characters');
  }

  const {
    rippledUrl = DEFAULT_RIPPLED_URL,
    multiNodeUrls,
    onRetry,
    agreementThreshold = 2,
    signal,
  } = options;

  if (Array.isArray(multiNodeUrls) && multiNodeUrls.length > 0) {
    return fetchTransactionMultiNode(txHash, multiNodeUrls, agreementThreshold, signal);
  }

  const endpoints = ledgerEndpoints(rippledUrl);
  for (let i = 0; i < endpoints.length; i++) {
    try { return await fetchTransactionFromUrl(txHash, endpoints[i], signal, onRetry); }
    catch (error) {
      if (!(error instanceof RippledUnavailableError) || error.reason !== 'connection' || i === endpoints.length - 1 || signal?.aborted) throw error;
      onRetry?.({waitMs: 0, attempt: 1});
    }
  }
  throw new RippledUnavailableError();
}

async function fetchTransactionFromUrl(
  txHash: string,
  rippledUrl: string,
  signal?: AbortSignal,
  onRetry?: (notice: RetryNotice) => void,
): Promise<RippledTxResult> {
  const body = {
    method: 'tx',
    params: [{ transaction: txHash, binary: false }],
  };

  const result = await requestRippled<RippledTxResult>(rippledUrl, body, signal, onRetry);

  if (!result.validated) {
    throw new Error('Transaction is not yet validated');
  }
  return result;
}

async function fetchTransactionMultiNode(
  txHash: string,
  urls: string[],
  threshold: number,
  signal?: AbortSignal,
): Promise<RippledTxResult> {
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new Error('multi-node agreementThreshold must be an integer >= 2');
  }

  const settled = await Promise.allSettled(
    urls.map((u) => fetchTransactionFromUrl(txHash, u, signal)),
  );

  const successes = settled
    .map((r, i) => ({ r, url: urls[i] }))
    .filter(({ r }) => r.status === 'fulfilled') as Array<{
    r: PromiseFulfilledResult<RippledTxResult>;
    url: string;
  }>;

  if (successes.length < threshold) {
    throw new Error(
      `multi-node fetch: only ${successes.length}/${urls.length} nodes ` +
        `responded; need at least ${threshold}`,
    );
  }

  const fingerprintOf = (result: RippledTxResult) =>
    JSON.stringify({
      Account: result.Account,
      Destination: result.Destination,
      Amount: result.Amount,
      Memos: result.Memos,
      hash: result.hash,
      validated: result.validated,
      ledger_index: result.ledger_index,
    });

  const first = successes[0].r.value;
  const expectedFp = fingerprintOf(first);
  const disagreed = successes.find(({ r }) => fingerprintOf(r.value) !== expectedFp);
  if (disagreed) {
    throw new Error(
      `multi-node fetch: disagreement on tx ${txHash} between ` +
        `${successes[0].url} and ${disagreed.url}`,
    );
  }

  return first;
}

/**
 * Pulls the validated transaction history for a given XRPL account,
 * paginated via rippled's marker. Forward-only (oldest first) so
 * callers can resume by passing `fromLedger`. Same redirect/host
 * hardening as `fetchTransaction`. Filters to `validated: true` only.
 *
 * Honours `AbortSignal` between pages — once aborted the generator
 * returns silently rather than throwing.
 */
export async function* accountTx(
  account: string,
  options: AccountTxOptions = {},
): AsyncIterable<AccountTxYield> {
  if (typeof account !== 'string' || account.length === 0) {
    throw new Error('accountTx requires a non-empty account');
  }
  const {
    rippledUrl = DEFAULT_RIPPLED_URL,
    fromLedger = -1,
    forward = true,
    pageSize = 200,
    maxPages = Infinity,
    onRetry,
    signal,
  } = options;

  if (!(maxPages > 0) || (maxPages !== Infinity && !Number.isInteger(maxPages))) throw new Error('maxPages must be a positive integer');
  const endpoints = ledgerEndpoints(rippledUrl);
  let endpoint = 0, pages = 0;
  let lowerBound = fromLedger, upperBound = -1;
  let resumeLedger: number | undefined;
  const deliveredAtBoundary = new Set<string>();
  let marker: unknown;
  while (true) {
    if (signal && signal.aborted) return;

    const params: Record<string, unknown> = {
      account,
      ledger_index_min: lowerBound,
      ledger_index_max: upperBound,
      binary: false,
      forward,
      limit: pageSize,
    };
    if (marker !== undefined) params['marker'] = marker;

    let result: { transactions?: unknown[]; marker?: unknown };
    try {
      result = await requestRippled(endpoints[endpoint], { method: 'account_tx', params: [params] }, signal, onRetry);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof RippledUnavailableError && err.reason === 'connection' && endpoint < endpoints.length - 1) {
        endpoint++; marker = undefined;
        if (resumeLedger !== undefined) { if (forward) lowerBound = resumeLedger; else upperBound = resumeLedger; }
        onRetry?.({waitMs: 0, attempt: 1});
        continue; // Markers are node-specific: restart from the inclusive last yielded ledger.
      }
      throw err;
    }

    if (signal?.aborted) return;
    const txs = Array.isArray(result.transactions) ? result.transactions : [];
    for (const wrapper of txs as Array<{
      tx?: RippledTxResult;
      transaction?: RippledTxResult;
      meta?: unknown;
      metadata?: unknown;
      validated?: boolean;
      ledger_index?: number;
    }>) {
      if (signal && signal.aborted) return;
      const tx = wrapper.tx ?? wrapper.transaction ?? null;
      const meta = wrapper.meta ?? wrapper.metadata ?? null;
      if (!tx) continue;
      const validated = wrapper.validated === true;
      if (!validated) continue;
      const ledger_index =
        typeof wrapper.ledger_index === 'number'
          ? wrapper.ledger_index
          : typeof tx.ledger_index === 'number'
            ? tx.ledger_index
            : -1;
      if (resumeLedger !== ledger_index) { resumeLedger = ledger_index; deliveredAtBoundary.clear(); }
      const hash = typeof tx.hash === 'string' ? tx.hash : '';
      if (hash && deliveredAtBoundary.has(hash)) continue;
      if (hash) deliveredAtBoundary.add(hash);
      yield { tx, meta, ledger_index, validated: true };
    }

    pages++;
    if (pages >= maxPages || result.marker === undefined || result.marker === null) {
      return;
    }
    marker = result.marker;
    try { await abortableDelay(1000, signal); } catch (err) {
      if (signal?.aborted) return;
      throw err;
    }
  }
}
