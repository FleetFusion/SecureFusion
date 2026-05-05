#!/usr/bin/env node
/**
 * SecureFusion verifier CLI.
 *
 * Usage:
 *   securefusion-verify --file <video> [--tx <hash>] [--manifest <path>]
 *   securefusion-verify --manifest <path> --tx <hash>
 */

import { readFile } from 'node:fs/promises';
import { argv, exit } from 'node:process';
import { verifyFile, verifyManifest, hashCanonical } from './index.js';

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--file') out.file = args[++i];
    else if (a === '--tx') out.tx = args[++i];
    else if (a === '--manifest') out.manifest = args[++i];
    else if (a === '--rippled-url') out.rippledUrl = args[++i];
    else if (a === '--hash-only') out.hashOnly = true;
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`SecureFusion reference verifier

Usage:
  securefusion-verify --file <video> --tx <xrpl-tx-hash>
  securefusion-verify --manifest <path> --tx <xrpl-tx-hash>
  securefusion-verify --manifest <path> --hash-only

Options:
  --file <path>          Video file to verify
  --manifest <path>      Off-chain manifest JSON
  --tx <hash>            XRPL transaction hash (64 uppercase hex)
  --rippled-url <url>    Override the default rippled JSON-RPC endpoint
  --hash-only            Compute the canonical bundleHash only; no chain lookup
  -h, --help             Show this message

Exit codes:
  0   verification passed
  1   verification failed
  2   usage error
`);
}

async function main() {
  const args = parseArgs(argv.slice(2));

  if (args.help || (!args.file && !args.manifest)) {
    usage();
    exit(args.help ? 0 : 2);
  }

  if (args.hashOnly) {
    if (!args.manifest) {
      console.error('--hash-only requires --manifest');
      exit(2);
    }
    const text = await readFile(args.manifest, 'utf8');
    const obj = JSON.parse(text);
    console.log(hashCanonical(obj));
    return;
  }

  if (!args.tx) {
    console.error('--tx is required for verification');
    exit(2);
  }

  const result = args.file
    ? await verifyFile({
        filePath: args.file,
        txHash: args.tx,
        manifest: args.manifest
          ? JSON.parse(await readFile(args.manifest, 'utf8'))
          : undefined,
        rippledUrl: args.rippledUrl,
      })
    : await verifyManifest({
        manifest: JSON.parse(await readFile(args.manifest, 'utf8')),
        txHash: args.tx,
        rippledUrl: args.rippledUrl,
      });

  console.log(JSON.stringify(result, null, 2));
  exit(result.verified ? 0 : 1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  exit(1);
});
