/**
 * SecureFusion v1.0 — Bitcoin / OpenTimestamps submission example (TypeScript).
 *
 * Submits a SecureFusion bundleHash to OpenTimestamps calendar servers,
 * which aggregate digests and anchor them to Bitcoin.
 *
 * Uses Node's built-in fetch (Node 18+) — no third-party dependencies.
 *
 * Run:
 *     cd samples/typescript
 *     npx tsx submit_bitcoin.ts
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildAnchorPayload } from './anchor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CALENDAR_SERVERS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
];

async function submitToCalendar(digest: Buffer, calendarUrl: string): Promise<Buffer> {
  if (digest.length !== 32) {
    throw new Error('OpenTimestamps digest must be 32 bytes (SHA-256)');
  }

  const url = calendarUrl.replace(/\/$/, '') + '/digest';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Convert Buffer to Uint8Array — fetch's BodyInit accepts the latter
      // unconditionally; Buffer's typing under @types/node 20+ no longer
      // satisfies BodyInit. The bytes are identical. (B7.)
      body: new Uint8Array(digest),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<number> {
  // 1. Load example manifest, compute bundleHash.
  const examplesDir = resolve(__dirname, '..', '..', 'examples');
  const manifestText = await readFile(join(examplesDir, 'single-channel-event.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const payload = buildAnchorPayload(manifest, null);

  console.log('SecureFusion v1.0 -- OpenTimestamps (Bitcoin) submission');
  console.log('='.repeat(60));
  console.log(`  bundleHash:  ${payload.bundleHash}`);
  console.log();

  // 2. Submit to multiple calendars.
  console.log('Anchoring to OpenTimestamps calendar servers:');
  const digest = Buffer.from(payload.bundleHash, 'hex');
  const proofs: Record<string, Buffer> = {};

  for (const server of CALENDAR_SERVERS) {
    process.stdout.write(`  Submitting to ${server}... `);
    try {
      const proof = await submitToCalendar(digest, server);
      proofs[server] = proof;
      console.log(`[OK] (${proof.length} bytes)`);
    } catch (err: any) {
      console.log(`[FAIL] ${err.message}`);
    }
  }

  if (Object.keys(proofs).length === 0) {
    console.error();
    console.error('[FAIL] All OpenTimestamps calendars failed.');
    return 1;
  }

  // 3. Save partial proofs.
  const outputPath = `${payload.bundleHash.slice(0, 16)}.partial.ots`;
  const chunks: Buffer[] = [];
  for (const [url, proof] of Object.entries(proofs)) {
    chunks.push(Buffer.from(`--- ${url} ---\n`, 'utf8'));
    chunks.push(proof);
    chunks.push(Buffer.from('\n', 'utf8'));
  }
  await writeFile(outputPath, Buffer.concat(chunks));

  console.log();
  console.log(`[OK] Saved partial proof: ${outputPath}`);
  console.log();
  console.log('Next steps:');
  console.log('  1. The proof is currently \'partial\' -- calendars have aggregated');
  console.log('     your digest but Bitcoin has not yet committed to it.');
  console.log('  2. Wait at least 1 hour, then call the calendars\' upgrade API');
  console.log('     to get the full Bitcoin block commitment.');
  console.log('  3. Store the upgraded .ots proof in the SecureFusion ledger.');
  console.log();
  console.log('For production with full proof upgrading, consider using:');
  console.log('  npm install javascript-opentimestamps');

  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
