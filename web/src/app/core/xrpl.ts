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

const DEFAULT_RIPPLED_URL = 'https://xrplcluster.com';

export interface FetchTransactionOptions {
  rippledUrl?: string;
  multiNodeUrls?: string[];
  agreementThreshold?: number;
  signal?: AbortSignal;
}

export interface AccountTxOptions {
  rippledUrl?: string;
  fromLedger?: number;
  pageSize?: number;
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
    agreementThreshold = 2,
    signal,
  } = options;

  if (Array.isArray(multiNodeUrls) && multiNodeUrls.length > 0) {
    return fetchTransactionMultiNode(txHash, multiNodeUrls, agreementThreshold, signal);
  }

  return fetchTransactionFromUrl(txHash, rippledUrl, signal);
}

async function fetchTransactionFromUrl(
  txHash: string,
  rippledUrl: string,
  signal?: AbortSignal,
): Promise<RippledTxResult> {
  const body = {
    method: 'tx',
    params: [{ transaction: txHash, binary: false }],
  };

  const response = await fetch(rippledUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
    signal,
  });

  if (response.status !== 200) {
    throw new Error(
      `rippled HTTP ${response.status} from ${rippledUrl} ` +
        `(redirects are refused; user must point at a trusted node)`,
    );
  }

  const json = (await response.json()) as { result?: RippledTxResult & { status?: string; error?: string } };
  if (!json.result) {
    throw new Error('rippled response missing result');
  }
  if (json.result.status === 'error') {
    throw new Error(`rippled error: ${json.result.error}`);
  }
  if (!json.result.validated) {
    throw new Error('Transaction is not yet validated');
  }
  return json.result;
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
    pageSize = 200,
    signal,
  } = options;

  let marker: unknown;
  while (true) {
    if (signal && signal.aborted) return;

    const params: Record<string, unknown> = {
      account,
      ledger_index_min: fromLedger,
      ledger_index_max: -1,
      binary: false,
      forward: true,
      limit: pageSize,
    };
    if (marker !== undefined) params['marker'] = marker;

    let json: { result?: { transactions?: unknown[]; marker?: unknown; status?: string; error?: string } };
    try {
      const resp = await fetch(rippledUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'account_tx', params: [params] }),
        redirect: 'manual',
        signal,
      });
      if (resp.status !== 200) {
        throw new Error(
          `rippled HTTP ${resp.status} from ${rippledUrl} ` +
            `(redirects are refused; user must point at a trusted node)`,
        );
      }
      json = await resp.json();
    } catch (err) {
      if (signal && signal.aborted) return;
      throw err;
    }

    const result = json?.result;
    if (!result) {
      throw new Error('rippled account_tx response missing result');
    }
    if (result.status === 'error') {
      throw new Error(`rippled error: ${result.error}`);
    }

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
      yield { tx, meta, ledger_index, validated: true };
    }

    if (result.marker === undefined || result.marker === null) {
      return;
    }
    marker = result.marker;
  }
}
