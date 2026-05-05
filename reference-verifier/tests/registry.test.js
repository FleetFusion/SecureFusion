import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findByAccount, listActive } from '../src/registry.js';

test('listActive returns at least the bundled testnet entry', () => {
  const entries = listActive();
  assert.ok(entries.length >= 1, 'registry must contain at least one entry');
  const testnet = entries.find((e) => e.network === 'testnet');
  assert.ok(testnet, 'bundled testnet entry missing');
  assert.equal(testnet.specVersion, 'SF1');
  assert.equal(testnet.revokedAt, null);
  assert.match(testnet.appPublicKey, /^[0-9a-f]{64}$/);
});

test('findByAccount returns the entry for a known testnet account', () => {
  const testnet = listActive().find((e) => e.network === 'testnet');
  const got = findByAccount(testnet.xrplAccount);
  assert.equal(got?.xrplAccount, testnet.xrplAccount);
  assert.equal(got?.network, 'testnet');
  assert.equal(typeof got?.revokedAt, 'object'); // null
});

test('findByAccount returns undefined for an unknown account', () => {
  assert.equal(findByAccount('rUNKNOWN_ACCOUNT'), undefined);
});

test('every registry entry exposes network + revokedAt fields (D5/D10)', () => {
  for (const e of listActive()) {
    assert.ok(['mainnet', 'testnet'].includes(e.network), `entry ${e.xrplAccount} missing network`);
    assert.ok(
      e.revokedAt === null || typeof e.revokedAt === 'string',
      `entry ${e.xrplAccount} revokedAt must be null or ISO 8601 string`
    );
  }
});

test('every registry entry exposes a valid bitcoinProofMode (round-4 D12)', () => {
  const validModes = ['xrpl-sf1ots', 'https', 'none'];
  for (const e of listActive()) {
    assert.ok(
      validModes.includes(e.bitcoinProofMode),
      `entry ${e.xrplAccount} bitcoinProofMode must be one of ${validModes.join('|')}, got ${e.bitcoinProofMode}`
    );
    if (e.bitcoinProofMode === 'https') {
      assert.equal(
        typeof e.bitcoinProofUrlTemplate,
        'string',
        `entry ${e.xrplAccount} https mode requires bitcoinProofUrlTemplate`
      );
      assert.ok(
        e.bitcoinProofUrlTemplate.startsWith('https://'),
        `entry ${e.xrplAccount} bitcoinProofUrlTemplate must start with https://`
      );
    } else {
      assert.equal(
        e.bitcoinProofUrlTemplate,
        undefined,
        `entry ${e.xrplAccount} bitcoinProofUrlTemplate must be omitted when mode != "https"`
      );
    }
  }
});

test('bundled testnet entry uses bitcoinProofMode = "xrpl-sf1ots" (FleetFusion default)', () => {
  const testnet = listActive().find((e) => e.network === 'testnet');
  assert.equal(testnet.bitcoinProofMode, 'xrpl-sf1ots');
  assert.equal(testnet.bitcoinProofUrlTemplate, undefined);
});
