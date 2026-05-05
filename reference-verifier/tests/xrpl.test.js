/**
 * Tests for xrpl.js -- in particular the `accountTx` paginated forward
 * scanner used by the xrpl-sf1ots Tier-3 path. Stubs `globalThis.fetch`
 * the same way the existing tests in verify.test.js do.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountTx } from '../src/xrpl.js';

const ACCOUNT = 'rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx';

function makeTxWrapper({ hash, ledger_index, validated = true }) {
  return {
    tx: {
      TransactionType: 'Payment',
      Account: ACCOUNT,
      Destination: ACCOUNT,
      hash,
      ledger_index,
    },
    meta: { TransactionResult: 'tesSUCCESS' },
    validated,
    ledger_index,
  };
}

test('accountTx — paginates to end of marker chain', async () => {
  const realFetch = globalThis.fetch;
  // Two pages: first carries marker; second has no marker -> end of stream.
  let callCount = 0;
  globalThis.fetch = async (url, opts) => {
    callCount += 1;
    const body = JSON.parse(opts.body);
    const params = body.params[0];
    if (callCount === 1) {
      assert.equal(params.marker, undefined, 'first call has no marker');
      return {
        status: 200,
        async json() {
          return {
            result: {
              status: 'success',
              transactions: [
                makeTxWrapper({ hash: 'A'.repeat(64), ledger_index: 100 }),
                makeTxWrapper({ hash: 'B'.repeat(64), ledger_index: 101 }),
              ],
              marker: { ledger: 101, seq: 7 },
            },
          };
        },
      };
    }
    assert.deepEqual(params.marker, { ledger: 101, seq: 7 });
    return {
      status: 200,
      async json() {
        return {
          result: {
            status: 'success',
            transactions: [
              makeTxWrapper({ hash: 'C'.repeat(64), ledger_index: 102 }),
            ],
            // No marker -> generator returns.
          },
        };
      },
    };
  };

  const seen = [];
  try {
    for await (const item of accountTx(ACCOUNT, { rippledUrl: 'https://x.example' })) {
      seen.push(item.tx.hash);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(callCount, 2);
  assert.deepEqual(seen, ['A'.repeat(64), 'B'.repeat(64), 'C'.repeat(64)]);
});

test('accountTx — respects abort signal', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return {
        result: {
          status: 'success',
          transactions: [
            makeTxWrapper({ hash: 'A'.repeat(64), ledger_index: 100 }),
            makeTxWrapper({ hash: 'B'.repeat(64), ledger_index: 101 }),
          ],
          marker: { ledger: 101, seq: 7 },
        },
      };
    },
  });
  const ctrl = new AbortController();
  const seen = [];
  try {
    for await (const item of accountTx(ACCOUNT, {
      rippledUrl: 'https://x.example',
      signal: ctrl.signal,
    })) {
      seen.push(item.tx.hash);
      ctrl.abort(); // bail after first item
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  // The generator yields items already pulled from the in-flight page,
  // then bails on the next abort check before fetching the marker page.
  assert.ok(seen.length >= 1 && seen.length <= 2, `got ${seen.length} items`);
});

test('accountTx — filters non-validated transactions', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 200,
    async json() {
      return {
        result: {
          status: 'success',
          transactions: [
            makeTxWrapper({ hash: 'A'.repeat(64), ledger_index: 100, validated: true }),
            makeTxWrapper({ hash: 'B'.repeat(64), ledger_index: 101, validated: false }),
            makeTxWrapper({ hash: 'C'.repeat(64), ledger_index: 102, validated: true }),
          ],
        },
      };
    },
  });
  const seen = [];
  try {
    for await (const item of accountTx(ACCOUNT, { rippledUrl: 'https://x.example' })) {
      seen.push(item.tx.hash);
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(seen, ['A'.repeat(64), 'C'.repeat(64)]);
});
