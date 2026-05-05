/**
 * XRPL transaction fetching.
 *
 * Uses rippled JSON-RPC over fetch. No third-party dependency.
 *
 * Default node: https://xrplcluster.com (community public cluster).
 *
 * Security model (B2.8 / DA §3):
 *   - The user is responsible for choosing a TRUSTED rippled URL. The
 *     verifier cannot prevent a malicious operator returning forged tx
 *     state if the caller points at a hostile node.
 *   - We pass `redirect: 'manual'` so a 30x from the chosen host doesn't
 *     silently bounce the request to an attacker. Anything other than a
 *     200 from the original host is treated as a hard failure.
 *   - Callers wanting an integrity check pass `multiNodeUrls`. The
 *     verifier queries every URL in parallel, requires that the txn
 *     fields it cares about (Account, Destination, Amount, Memos,
 *     hash, validated, ledger_index) agree byte-for-byte across at
 *     least N-of-M responses (default 2-of-N), and rejects if any
 *     reachable node disagrees on those fields.
 */

const DEFAULT_RIPPLED_URL = 'https://xrplcluster.com';

/**
 * Fetch a validated transaction by hash.
 *
 * @param {string} txHash       - 64-char uppercase hex transaction hash
 * @param {object} [options]
 * @param {string} [options.rippledUrl]
 * @param {string[]} [options.multiNodeUrls] - if supplied, query each and
 *                                            require agreement across at
 *                                            least `agreementThreshold`
 *                                            successful responses.
 * @param {number} [options.agreementThreshold] - default 2; ignored if
 *                                                multiNodeUrls is absent.
 * @returns {Promise<object>}   - the `result` field of the rippled `tx`
 *                                response.
 */
export async function fetchTransaction(
  txHash,
  {
    rippledUrl = DEFAULT_RIPPLED_URL,
    multiNodeUrls,
    agreementThreshold = 2,
  } = {}
) {
  if (!/^[0-9A-F]{64}$/.test(txHash)) {
    throw new Error('txHash must be 64 uppercase hex characters');
  }

  if (Array.isArray(multiNodeUrls) && multiNodeUrls.length > 0) {
    return fetchTransactionMultiNode(txHash, multiNodeUrls, agreementThreshold);
  }

  return fetchTransactionFromUrl(txHash, rippledUrl);
}

async function fetchTransactionFromUrl(txHash, rippledUrl) {
  const body = {
    method: 'tx',
    params: [
      {
        transaction: txHash,
        binary: false,
      },
    ],
  };

  const response = await fetch(rippledUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    // Refuse to follow 30x. A redirect from the user-chosen host to an
    // attacker's host would silently hand control of the verification
    // pipeline to that attacker -- B2.8 / DA §3.
    redirect: 'manual',
  });

  // With redirect:'manual', fetch returns the raw 30x. Reject anything
  // other than a clean 200 from the original host.
  if (response.status !== 200) {
    throw new Error(
      `rippled HTTP ${response.status} from ${rippledUrl} ` +
        `(redirects are refused; user must point at a trusted node)`
    );
  }

  const json = await response.json();
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

/**
 * Multi-node integrity-check variant.
 *
 * Queries every URL, then asserts the security-relevant subset of the
 * response (Account, Destination, Amount, Memos, hash, validated,
 * ledger_index) is identical across at least `threshold` responses. If
 * any reachable node disagrees on those fields, the call rejects -- the
 * tx is in an inconsistent state across nodes and verification is unsafe.
 *
 * NOTE: this is a best-effort cross-check. It assumes the chosen URLs
 * are operated by independent parties; trusting two URLs run by the same
 * operator gives no extra integrity.
 */
async function fetchTransactionMultiNode(txHash, urls, threshold) {
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new Error('multi-node agreementThreshold must be an integer >= 2');
  }
  const settled = await Promise.allSettled(
    urls.map((u) => fetchTransactionFromUrl(txHash, u))
  );

  const successes = settled
    .map((r, i) => ({ r, url: urls[i] }))
    .filter(({ r }) => r.status === 'fulfilled');

  if (successes.length < threshold) {
    throw new Error(
      `multi-node fetch: only ${successes.length}/${urls.length} nodes ` +
        `responded; need at least ${threshold}`
    );
  }

  const fingerprintOf = (result) =>
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
        `${successes[0].url} and ${disagreed.url}`
    );
  }

  return first;
}

/**
 * Pulls the validated transaction history for a given XRPL account, paginated
 * via rippled's marker. Forward-only (oldest first) so callers can resume scan
 * by passing `fromLedger`. Same redirect/host hardening as fetchTransaction
 * (B2.8 / DA §3): `redirect: 'manual'` so a 30x cannot bounce the scan to an
 * attacker host. Filters to `validated: true` only — unconfirmed txs are
 * skipped so the caller never acts on a tx that could later disappear.
 *
 * Honours an `AbortSignal` so callers can cap scan time. The signal is
 * forwarded to the underlying `fetch`; an aborted call breaks out of the
 * generator without throwing once at least one page has been yielded.
 *
 * @param {string} account                    - r-prefixed XRPL classic addr
 * @param {object} [options]
 * @param {string} [options.rippledUrl]       - default xrplcluster.com
 * @param {number} [options.fromLedger]       - oldest validated ledger to scan
 *                                              from (rippled `ledger_index_min`).
 *                                              Default -1 (genesis).
 * @param {number} [options.pageSize]         - rippled `limit` per call. Default 200.
 * @param {AbortSignal} [options.signal]      - cap scan time; once aborted the
 *                                              generator returns silently.
 * @returns {AsyncIterable<{tx:object, meta:object, ledger_index:number, validated:boolean}>}
 */
export async function* accountTx(
  account,
  {
    rippledUrl = DEFAULT_RIPPLED_URL,
    fromLedger = -1,
    pageSize = 200,
    signal,
  } = {}
) {
  if (typeof account !== 'string' || account.length === 0) {
    throw new Error('accountTx requires a non-empty account');
  }

  let marker;
  // Forward-only loop. Continues until rippled returns no marker (no more
  // pages), or the caller's AbortSignal fires.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal && signal.aborted) return;

    const params = {
      account,
      ledger_index_min: fromLedger,
      ledger_index_max: -1,
      binary: false,
      forward: true,
      limit: pageSize,
    };
    if (marker !== undefined) params.marker = marker;

    let json;
    try {
      const resp = await fetch(rippledUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method: 'account_tx', params: [params] }),
        // Refuse to follow 30x — same posture as fetchTransactionFromUrl.
        redirect: 'manual',
        signal,
      });
      if (resp.status !== 200) {
        throw new Error(
          `rippled HTTP ${resp.status} from ${rippledUrl} ` +
            `(redirects are refused; user must point at a trusted node)`
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
    for (const wrapper of txs) {
      if (signal && signal.aborted) return;
      // rippled returns either { tx, meta, validated, ... } or
      // { transaction, metadata, validated, ... } depending on the
      // server flavour; normalise.
      const tx = wrapper.tx ?? wrapper.transaction ?? null;
      const meta = wrapper.meta ?? wrapper.metadata ?? null;
      if (!tx) continue;
      const validated = wrapper.validated === true;
      if (!validated) continue;
      const ledger_index =
        typeof wrapper.ledger_index === 'number'
          ? wrapper.ledger_index
          : (typeof tx.ledger_index === 'number' ? tx.ledger_index : -1);
      yield { tx, meta, ledger_index, validated };
    }

    if (result.marker === undefined || result.marker === null) {
      return;
    }
    marker = result.marker;
  }
}
