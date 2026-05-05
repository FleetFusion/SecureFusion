# SecureFusion Reference Verifier

A canonical, dependency-light implementation of the SecureFusion verification procedure. Given a video file and an XRPL transaction hash (or just a file, with discovery via the SecureFusion lookup API), this verifier confirms whether the file is a SecureFusion-anchored video and produces a full provenance report.

This is the **reference** implementation — it is intentionally simple, readable, and faithful to the specification. It is not optimised for throughput. Production implementations should follow the same logic but may use language-native cryptographic libraries and parallel batch verification.

## Status

✅ **Released — v1.0.** The reference verifier is the canonical implementation of the SecureFusion verification procedure. It is stable and intended for production use as a verification tool.

## Install

Once published:

```bash
npm install -g @securefusion/reference-verifier
```

For now, from a local clone:

```bash
cd reference-verifier
npm install
npm test
```

Requires Node.js 20+.

## Use

### CLI

```bash
# Verify a video against a known XRPL transaction
securefusion-verify --file dashcam.mp4 --tx <xrpl_tx_hash>

# Verify a video by discovering the anchor automatically
securefusion-verify --file dashcam.mp4

# Verify a manifest against an on-chain anchor without the file
securefusion-verify --manifest event.json --tx <xrpl_tx_hash>
```

### Library

```javascript
import { verifyFile, verifyManifest, hashCanonical } from '@securefusion/reference-verifier';

const result = await verifyFile({
  filePath: './dashcam.mp4',
  txHash: '<xrpl_tx_hash>',
});

if (result.verified) {
  console.log('Anchored at:', result.anchor.closeTime);
  console.log('Event:', result.manifest.eventId);
} else {
  console.log('Failed:', result.reason);
}
```

## What it does

The verifier walks the eight steps from [spec/memo-format.md §7](../spec/memo-format.md):

1. Fetches the validated XRPL transaction
2. Confirms the source account matches a published SecureFusion compliant account
3. Locates the three SecureFusion memos by `MemoType`
4. Decodes and parses the `SF1.bundle` binary header
5. Decodes and parses the `SF1.event` canonical JSON
6. Recomputes SHA-256 over the canonical JSON; checks against the `bundleHash`
7. Verifies the Ed25519 application signature in `SF1.sig`
8. (When given a file) computes SHA-256 of the file and matches it against one of the channel hashes

A verification result is a structured object with `verified` (boolean) plus the full chain of evidence.

## What it doesn't do

- It doesn't store anything. No telemetry, no cookies, no logs to anyone's server.
- It doesn't fetch video files from anywhere — the user provides the file. This is deliberate: the verifier should not be the place a video file ends up on someone else's infrastructure.
- It doesn't (currently) verify the Bitcoin/OpenTimestamps tier. That is a future addition.

## Architecture

```
src/
├── index.js          — public API (verifyFile, verifyManifest, hashCanonical)
├── cli.js            — command-line entry
├── canonical.js      — RFC 8785 (JCS) canonical JSON
├── hash.js           — SHA-256 over files and buffers
├── manifest.js       — manifest validation against the published schema
├── memo.js           — encode/decode the three SecureFusion memos
├── xrpl.js           — XRPL fetch and validation (pluggable transport)
├── signature.js      — Ed25519 verification
└── registry.js       — published-account registry lookup
```

Cryptography uses the Node.js built-in `node:crypto` and `node:crypto.subtle` APIs. No third-party crypto dependencies. XRPL access uses standard `rippled` JSON-RPC over `fetch`.

## Registry

The verifier consults a bundled list of compliant XRPL anchor accounts
(`src/registry.js`). Every entry exposes:

- `organisation` — the implementing org (free-text label).
- `xrplAccount` — r-prefixed classic address.
- `appPublicKey` — 64-char lowercase hex of the 32-byte Ed25519
  application public key.
- `network` — `"mainnet"` or `"testnet"`. The verifier rejects when the
  caller-supplied `expectedNetwork` does not match the entry (joint-plan
  D5).
- `specVersion` — informational v1 spec tag (e.g. `"SF1"`).
- `certifiedAt` / `revokedAt` — ISO-8601 timestamps. The verifier treats
  any tx confirmed at or after `revokedAt` as invalid (joint-plan D10);
  pre-revocation txs remain valid forever.
- `active` — soft kill-switch.

### Adding a registry entry

1. Open a PR that edits `reference-verifier/src/registry.js` only.
   Keep the diff to one entry per PR.
2. The PR description MUST include:
   - the organisation's public canonical name,
   - a link to the on-chain XRPL account history showing at least one
     SF1-shaped Payment with valid memos,
   - the 32-byte Ed25519 application public key as 64 hex chars,
   - the network (`mainnet`/`testnet`),
   - certification date,
   - a maintainer-readable contact for revocation events.
3. A SecureFusion maintainer reviews the diff and confirms by running
   the verifier against a recent anchor from that account. The
   `appPublicKey` must verify a real SF1.sig over a real bundle/event
   pair from that account.
4. On merge, the new entry ships with the next published version of
   `@securefusion/reference-verifier`.

### Known v1 limitation

There is **no signed-registry fetch** in v1, and no transparency log.
The trust path is git: whoever can land a commit on this repo can
publish a registry entry. v2 introduces a signed registry per a separate
spec; until then, consumers should pin a verifier version they have
audited and treat the bundled registry as part of the trusted
supply chain.

## Conformance

The verifier is the canonical implementation. The conformance suite (in [../conformance/](../conformance/)) generates and verifies known-good and known-bad test vectors. Any implementation that produces the same results as the reference verifier on the conformance vectors is conformant.

## Contributing

See [../CONTRIBUTING.md](../CONTRIBUTING.md). Bug reports, ports to other languages, and additional test vectors are particularly welcome.

## Licence

Apache 2.0 — see [../LICENSE-CODE](../LICENSE-CODE).
