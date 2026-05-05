/**
 * SecureFusion v1.0 — XRPL submission example (TypeScript / xrpl.js).
 *
 * Submits a SecureFusion-anchored video event to the XRP Ledger as a
 * self-pay 1-drop Payment carrying the three SF1 memos.
 *
 * Requires:
 *     npm install xrpl
 *
 * To run against testnet:
 *   1. Get a funded testnet wallet at https://xrpl.org/xrp-testnet-faucet.html
 *   2. Set environment variables:
 *        SECUREFUSION_XRPL_SEED   (the wallet's seed, starts with 's')
 *        SECUREFUSION_APP_KEY_HEX (32-byte Ed25519 seed, 64 hex chars)
 *   3. Run:  npx tsx submit_xrpl.ts
 *
 * This file is REFERENCE CODE — the active xrpl.js calls are commented
 * out so the sample runs without the dependency installed. Uncomment after
 * `npm install xrpl`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildAnchorPayload } from './anchor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTNET_WS = 'wss://s.altnet.rippletest.net:51233';
const MAINNET_WS = 'wss://xrplcluster.com';

async function main(): Promise<number> {
  const seed = process.env.SECUREFUSION_XRPL_SEED;
  const appKeyHex = process.env.SECUREFUSION_APP_KEY_HEX;

  if (!seed || !appKeyHex) {
    console.error('Missing required environment variables:');
    console.error('  SECUREFUSION_XRPL_SEED      -- XRPL wallet seed (s...)');
    console.error('  SECUREFUSION_APP_KEY_HEX    -- 32-byte Ed25519 seed (64 hex chars)');
    return 2;
  }

  // 1. Load example manifest.
  const examplesDir = resolve(__dirname, '..', '..', 'examples');
  const manifestText = await readFile(join(examplesDir, 'single-channel-event.json'), 'utf8');
  const manifest = JSON.parse(manifestText);

  // 2. Build the SecureFusion payload.
  const appKey = Buffer.from(appKeyHex, 'hex');
  const payload = buildAnchorPayload(manifest, appKey);

  console.log('SecureFusion v1.0 -- XRPL submission');
  console.log('='.repeat(60));
  console.log(`  bundleHash:  ${payload.bundleHash}`);
  console.log(`  bundleBytes: ${payload.bundleBytes.length} bytes`);
  console.log(`  eventBytes:  ${payload.eventBytes.length} bytes`);
  console.log(`  signature:   ${payload.signature.length} bytes`);

  // 3. Submit to XRPL via xrpl.js.
  await submitToXrpl(payload, seed, TESTNET_WS);
  return 0;
}

async function submitToXrpl(
  payload: { memos: { Memo: { MemoType: string; MemoFormat: string; MemoData: string } }[] },
  seed: string,
  rippledUrl: string
): Promise<void> {
  // ============================================================
  // Pseudocode using xrpl.js (https://github.com/XRPLF/xrpl.js).
  // Uncomment after `npm install xrpl`.
  // ============================================================
  //
  // const { Client, Wallet } = await import('xrpl');
  //
  // const client = new Client(rippledUrl);
  // await client.connect();
  //
  // const wallet = Wallet.fromSeed(seed);
  // console.log(`  XRPL account: ${wallet.address}`);
  // console.log(`  rippled URL:  ${rippledUrl}`);
  //
  // const tx: any = {
  //   TransactionType: 'Payment',
  //   Account: wallet.address,
  //   Destination: wallet.address,
  //   Amount: '1',  // 1 drop, self-pay
  //   Memos: payload.memos,
  // };
  //
  // const prepared = await client.autofill(tx);
  // const signed = wallet.sign(prepared);
  // console.log(`  Submitting transaction ${signed.hash}...`);
  //
  // const result = await client.submitAndWait(signed.tx_blob);
  //
  // console.log();
  // console.log('[OK] Anchored to XRPL');
  // console.log(`  Transaction:  ${signed.hash}`);
  // console.log(`  Engine:       ${result.result.engine_result}`);
  // console.log(`  Validated:    ${result.result.validated}`);
  // console.log();
  // console.log(`  Verify at:    https://testnet.xrpl.org/transactions/${signed.hash}`);
  //
  // await client.disconnect();

  console.error();
  console.error('Sample skipped -- `xrpl` not installed.');
  console.error('See the comments in submitToXrpl() to enable.');
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
