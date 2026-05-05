/**
 * SecureFusion v1.0 (SF1) anchor producer — TypeScript / Node 20+ sample.
 *
 * Builds the three-memo XRPL transaction payload for a video event.
 * Uses only Node.js built-ins (crypto, fs, path) — no third-party deps.
 *
 * Run:
 *     cd samples/typescript
 *     npx tsx anchor.ts
 *     # or:  npx ts-node anchor.ts
 *     # or compile: tsc && node dist/anchor.js
 *
 * Expected bundleHash for the bundled examples (see examples/test-vectors.json):
 *     single-channel: e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
 *     four-channel:   8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
 *
 * For XRPL submission see submit_xrpl.ts (using xrpl.js).
 * For Bitcoin/OpenTimestamps see submit_bitcoin.ts.
 */

import { createHash, sign as nodeSign, createPrivateKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------------
// Types.
// ----------------------------------------------------------------------

export interface XrplMemo {
  MemoType: string;
  MemoFormat: string;
  MemoData: string;
}

export interface AnchorPayload {
  bundleHash: string;
  bundleBytes: Buffer;
  eventBytes: Buffer;
  signature: Buffer;
  memos: { Memo: XrplMemo }[];
}

// SecureFusion v1: ingestSource is a single-value enum on the wire — always
// "fleetfusion" — and the source-code byte in SF1.bundle is always 0x01.
// Per-upstream-provider distinctions never leak onto the public ledger. v2 may extend.
const INGEST_SOURCE_CODES: Record<string, number> = {
  fleetfusion: 1,
};

// ----------------------------------------------------------------------
// Canonical JSON serialisation (RFC 8785-compatible subset).
// ----------------------------------------------------------------------

export function canonicalise(value: unknown): Buffer {
  return Buffer.from(serialise(value), 'utf8');
}

function serialise(v: unknown): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) {
      throw new Error('Non-finite numbers are not permitted in canonical JSON');
    }
    return Number.isInteger(v) ? String(v) : String(v);
  }

  if (typeof v === 'string') return serialiseString(v);

  if (Array.isArray(v)) {
    return '[' + v.map(serialise).join(',') + ']';
  }

  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => serialiseString(k) + ':' + serialise(obj[k])).join(',') + '}';
  }

  throw new Error(`Cannot canonicalise value of type ${typeof v}`);
}

function serialiseString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += '\\\\';
    else if (c === 0x08) out += '\\b';
    else if (c === 0x0c) out += '\\f';
    else if (c === 0x0a) out += '\\n';
    else if (c === 0x0d) out += '\\r';
    else if (c === 0x09) out += '\\t';
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0');
    else out += s[i];
  }
  return out + '"';
}

// ----------------------------------------------------------------------
// SF1.bundle binary header (50 bytes).
// ----------------------------------------------------------------------

export function encodeBundleMemo(opts: {
  bundleHash: string;
  eventId: string;
  ingestSource: string;
  channelCount: number;
}): Buffer {
  if (!/^[0-9a-f]{64}$/.test(opts.bundleHash)) {
    throw new Error('bundleHash must be 64 lowercase hex chars');
  }
  const sourceCode = INGEST_SOURCE_CODES[opts.ingestSource];
  if (sourceCode === undefined) {
    throw new Error(`Unknown ingestSource: ${opts.ingestSource}`);
  }
  if (!Number.isInteger(opts.channelCount) || opts.channelCount < 1 || opts.channelCount > 255) {
    throw new Error('channelCount must be 1..255');
  }
  const uuidHex = opts.eventId.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(uuidHex)) {
    throw new Error('eventId must be a hyphenated UUID');
  }

  const buf = Buffer.alloc(50);
  Buffer.from(opts.bundleHash, 'hex').copy(buf, 0);
  // FleetFusion writes the eventId via .NET Guid.ToByteArray(), which is
  // little-endian for the first 3 fields. Match that wire format so the
  // 50-byte SF1.bundle agrees with C#/Java/Python/Go byte-for-byte.
  const raw = Buffer.from(uuidHex, 'hex');
  const dotnet = Buffer.alloc(16);
  dotnet[0] = raw[3]; dotnet[1] = raw[2]; dotnet[2] = raw[1]; dotnet[3] = raw[0];
  dotnet[4] = raw[5]; dotnet[5] = raw[4];
  dotnet[6] = raw[7]; dotnet[7] = raw[6];
  raw.copy(dotnet, 8, 8, 16);
  dotnet.copy(buf, 32);
  buf[48] = sourceCode;
  buf[49] = opts.channelCount;
  return buf;
}

// ----------------------------------------------------------------------
// Memo construction for the XRPL Payment.
// ----------------------------------------------------------------------

function hexUtf8(s: string): string {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase();
}

export function buildMemos(args: {
  bundleBytes: Buffer;
  eventBytes: Buffer;
  signature: Buffer;
}): { Memo: XrplMemo }[] {
  if (args.bundleBytes.length !== 50) throw new Error('SF1.bundle must be 50 bytes');
  if (args.signature.length !== 64) throw new Error('Ed25519 signature must be 64 bytes');

  return [
    {
      Memo: {
        MemoType: hexUtf8('SF1.bundle'),
        MemoFormat: hexUtf8('application/octet-stream'),
        MemoData: args.bundleBytes.toString('hex').toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: hexUtf8('SF1.event'),
        MemoFormat: hexUtf8('application/json'),
        MemoData: args.eventBytes.toString('hex').toUpperCase(),
      },
    },
    {
      Memo: {
        MemoType: hexUtf8('SF1.sig'),
        MemoFormat: hexUtf8('application/octet-stream'),
        MemoData: args.signature.toString('hex').toUpperCase(),
      },
    },
  ];
}

// ----------------------------------------------------------------------
// Ed25519 signing using Node's built-in crypto (Node 20+).
// ----------------------------------------------------------------------

function ed25519Sign(message: Buffer, secretKey32: Buffer): Buffer {
  if (secretKey32.length !== 32) {
    throw new Error('Ed25519 seed must be 32 bytes');
  }
  // PKCS#8 wrapper for a raw Ed25519 seed.
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    secretKey32,
  ]);
  const keyObject = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  return nodeSign(null, message, keyObject);
}

// ----------------------------------------------------------------------
// End-to-end builder.
// ----------------------------------------------------------------------

export function buildAnchorPayload(
  manifest: Record<string, unknown>,
  applicationKey32: Buffer | null = null
): AnchorPayload {
  const eventBytes = canonicalise(manifest);
  const bundleHash = createHash('sha256').update(eventBytes).digest('hex');

  const eventId = manifest.eventId as string;
  const ingestSource = manifest.ingestSource as string;
  const channels = manifest.channels as unknown[];

  const bundleBytes = encodeBundleMemo({
    bundleHash,
    eventId,
    ingestSource,
    channelCount: channels.length,
  });

  const sigInput = Buffer.concat([bundleBytes, eventBytes]);
  const signature = applicationKey32
    ? ed25519Sign(sigInput, applicationKey32)
    : Buffer.alloc(64);

  const memos = buildMemos({ bundleBytes, eventBytes, signature });

  return { bundleHash, bundleBytes, eventBytes, signature, memos };
}

// ----------------------------------------------------------------------
// Demo entry point.
// ----------------------------------------------------------------------

// Mirror of examples/test-vectors.json.
const EXPECTED_BUNDLE_HASHES: Record<string, string> = {
  'single-channel-event.json': 'e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05',
  'four-channel-event.json': '8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb',
};

async function main(): Promise<number> {
  console.log('SecureFusion v1.0 -- TypeScript anchor producer sample');
  console.log('='.repeat(60));

  const examplesDir = resolve(__dirname, '..', '..', 'examples');

  let allOk = true;
  for (const [filename, expected] of Object.entries(EXPECTED_BUNDLE_HASHES)) {
    const path = join(examplesDir, filename);
    const text = await readFile(path, 'utf8');
    const manifest = JSON.parse(text);

    const payload = buildAnchorPayload(manifest, null);
    const ok = payload.bundleHash === expected;
    allOk = allOk && ok;

    console.log();
    console.log(`  Manifest:    ${filename}`);
    console.log(`  bundleHash:  ${payload.bundleHash}`);
    console.log(`  expected:    ${expected}`);
    console.log(`  match:       ${ok ? '[OK]' : '[FAIL]'}`);
    console.log(`  channels:    ${(manifest.channels as unknown[]).length}`);
    console.log(`  memos:       ${payload.memos.length}`);
    console.log(`  bundle hex:  ${payload.bundleBytes.toString('hex').slice(0, 64)}...`);
  }

  console.log();
  if (allOk) {
    console.log('[OK] All test vectors match.');
    return 0;
  }
  console.log('[FAIL] One or more test vectors did not match.');
  return 1;
}

// Only run the demo when this file is invoked directly, not when imported
// as a module (B6, joint-plan dispatch order).
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
