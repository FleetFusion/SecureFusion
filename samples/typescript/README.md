# SecureFusion v1.0 — TypeScript anchor producer

A self-contained TypeScript implementation of the SecureFusion anchor producer for Node.js 20+. Uses only Node built-ins (`crypto`, `fs`, `path`) — no third-party dependencies for the canonical hash or signing.

## Files

| File | Purpose |
|---|---|
| `anchor.ts` | Anchor builder + canonical JSON + demo entry point. |
| `submit_xrpl.ts` | XRPL submission example (uses `xrpl.js`). |
| `submit_bitcoin.ts` | Bitcoin / OpenTimestamps submission example (built-in `fetch`). |

## Requirements

- **Node.js 20+** (for built-in `--experimental-strip-types` or `tsx`)

For XRPL submission: [`xrpl.js`](https://github.com/XRPLF/xrpl.js) is the official TypeScript/JavaScript XRPL client.

```bash
npm install xrpl
```

For OpenTimestamps with full proof upgrading (optional): [`javascript-opentimestamps`](https://github.com/opentimestamps/javascript-opentimestamps).

```bash
npm install javascript-opentimestamps
```

## Install dev dependencies

```bash
cd samples/typescript
npm install
```

This installs `tsx` for direct TypeScript execution.

## Run the demo (anchor only, no third-party deps required)

```bash
cd samples/typescript
npx tsx anchor.ts

# Or with Node 22+ built-in TypeScript support:
node --experimental-strip-types anchor.ts
```

Expected output:

```
SecureFusion v1.0 — TypeScript anchor producer sample
============================================================

  Manifest:    single-channel-event.json
  bundleHash:  e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
  ...
  match:       [OK]

  Manifest:    four-channel-event.json
  bundleHash:  8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
  ...
  match:       [OK]

[OK] All test vectors match.
```

## Run the XRPL submission example

After `npm install xrpl` and uncommenting the active block in `submit_xrpl.ts`:

```bash
export SECUREFUSION_XRPL_SEED=s...                    # XRPL wallet seed
export SECUREFUSION_APP_KEY_HEX=64-hex-char-Ed25519   # 32-byte seed

npx tsx submit_xrpl.ts
```

For testnet, get a funded wallet at <https://xrpl.org/xrp-testnet-faucet.html>.

## Run the OpenTimestamps submission example

```bash
npx tsx submit_bitcoin.ts
```

This produces a `<bundleHash>.partial.ots` file. The proof becomes complete once Bitcoin includes the calendar's commitment (~1 hour). Production code should call the calendars' upgrade API later, or use `javascript-opentimestamps` for full client behaviour.

## TypeScript compilation (production builds)

```bash
npx tsc
node dist/anchor.js
```

`tsconfig.json` is configured for ES2022 with strict type checking.

## Relationship to the Node reference verifier

The reference verifier in `../../reference-verifier/` is **JavaScript** (Node.js, ES modules) and implements the **verifier** side. This sample is **TypeScript** and implements the **producer** side. The two share the same canonicalisation algorithm — by design, both produce identical bundleHashes for the same manifest.

## Notes for production

- **Hold the application Ed25519 key in a hardware-backed keystore** (AWS KMS / Cloud HSM, GCP KMS, Azure Key Vault Managed HSM). The samples take the key as a `Buffer` for clarity — production must not.
- **Hash inbound video bytes before any processing.** Hash at the Express/Fastify route handler that receives the upload, before passing to ffmpeg, etc.
- **Stream large files.** Use `crypto.createHash('sha256')` with `fs.createReadStream(path).pipe(hash)` for files >100MB.
- **Use TicketCreate for high-volume submission.** `xrpl.js` exposes Ticket allocation directly.
- **Use a single SecureFusion XRPL account across all tenants** — tenant identity belongs in the manifest.

## What the code does

- `buildAnchorPayload(manifest, appKey32?)` — end-to-end: parsed manifest in, ready-to-submit memo array out.
- `encodeBundleMemo({...})` — the 50-byte `SF1.bundle` binary header.
- `canonicalise(value)` — RFC 8785-compatible canonical JSON (sorted keys, no whitespace, minimal escaping). Every key is hashed; comments belong in sibling `*.meta.json` files, never in the manifest itself.
- `ed25519Sign(...)` — uses Node's built-in `crypto.sign(null, message, key)` with a PKCS#8-wrapped Ed25519 key. Works on Node 16+ and requires no native modules.

## Licence

Apache 2.0 — see [../../LICENSE-CODE](../../LICENSE-CODE).
