# SecureFusion Public Verifier (web/)

The SecureFusion project site, hosted at **securefusion.org**. The site has two parts: a project landing page at `/` that introduces the open standard, and the public verifier SPA at `/verify` where anyone can drop a SecureFusion-anchored video file in and confirm, independently of FleetFusion or any other platform, that the file has not been altered since ingest.

## What this is

A browser-only Angular standalone application. There is **no FleetFusion API**, no upload, and no telemetry. Everything happens in the user's browser:

- The video file is hashed locally with SHA-256 (streaming, via `hash-wasm`).
- The verifier walks the public XRP Ledger (rippled JSON-RPC) and Bitcoin OpenTimestamps calendar to find the matching anchor.
- Ed25519 signatures are checked against the trust-anchor registry shipped with the bundle.
- A three-tier result is shown: **Hash on XRPL** (instant) / **Signed by platform key** (Ed25519) / **Bitcoin-attested** (via OpenTimestamps).

## Local development

```bash
cd web
npm install
npm run start          # opens http://localhost:4200
```

## Reproducible build

A reproducible build is the cornerstone of the trust model. Anyone with the source can produce a byte-identical bundle to what is served at securefusion.org and confirm via Subresource Integrity (SRI) hashes that the live site is the open-source code.

```bash
cd web
npm ci                 # locks deps to package-lock.json
npm run build:prod     # produces dist/web/browser/
```

The canonical build is produced with:

| Tool        | Locked version |
|-------------|----------------|
| Node.js     | **22.20.0**    |
| npm         | **10.9.3**     |
| Angular CLI | **20.x** (from `package.json`) |

If your build hash differs, check that you used `npm ci` from a clean checkout (not `npm install`) and that your Node + npm versions match the table above exactly.

## Tests

```bash
cd web
npm test -- --watch=false
```

The full CI matrix (Node 20 + 22, Linux + Windows) lives in [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) under the `web-build` job.

## Verify a video

1. Open securefusion.org/verify (or your self-hosted copy).
2. Drag-drop a video file onto the page, or click and pick one.
3. The verifier hashes the bytes locally, then fetches the public XRPL transaction and the Bitcoin OTS proof.
4. The three-tier result tells you what each layer of the public record says about the file.

No upload. No server-side processing. No telemetry. Everything happens in your tab.

## Self-hosting

Anyone (insurer, regulator, journalist, family member) can host their own copy of the verifier and avoid trusting FleetFusion's CDN.

1. Fork or clone this repo.
2. (Optional) Replace the contents of `src/assets/trust-anchors/registry.json` with your own curated list of platform public keys, or extend it.
3. Set the rippled URL in the verifier's Settings page (defaults to a public XRPL cluster). Any rippled that exposes JSON-RPC on the standard endpoints will work; nothing FleetFusion-specific is required.
4. `npm ci && npm run build:prod` and serve `dist/web/browser/` from any static host.

If you need to allow additional rippled hosts beyond the defaults, edit the `connect-src` directive in [`staticwebapp.config.json`](staticwebapp.config.json). The default allowlist covers `*.xrpl.org`, `*.ripple.com`, `xrplcluster.com`, and `*.calendar.opentimestamps.org` only; anything else is blocked by the browser before the request leaves the tab.

## Threat model

A short summary of the threats this verifier defends against and the residual risks (the full model is in [../spec/threat-model.md](../spec/threat-model.md)):

- **Hostile CDN serving tampered verifier code.** Mitigated by: open-source code, reproducible builds, Subresource Integrity hashes, the option to self-host. Not eliminated; a determined attacker controlling the CDN *and* the user's first visit can still ship malicious code on a one-off basis.
- **Tampered video file.** Detected: the file's hash will not match the on-chain bundle.
- **Forged manifest with a real-looking signature.** Mitigated by trust-anchor pinning: the verifier only accepts signatures from keys in the registry shipped at build time.
- **Network-level censorship of the rippled endpoint.** Mitigated by user-configurable rippled URL + multiple defaults in the allowlist.
- **Trust-confusion via iframe embedding.** Mitigated by `X-Frame-Options: DENY` and `frame-ancestors 'none'` in the CSP.

## Trust anchors

The verifier accepts manifest signatures only from public keys registered in [`src/assets/trust-anchors/registry.json`](src/assets/trust-anchors/registry.json). The registry is git-tracked, so anyone can inspect its history with `git log src/assets/trust-anchors/registry.json` to see when an entry was added or rotated.

To propose a new trust-anchor entry:

1. Open a pull request adding the entry to `registry.json`.
2. Include in the PR description: organisation name, contact details, and the on-chain XRPL account that will issue anchors with this key.
3. Two project maintainers must countersign the PR before merge. This is a manual review process by design, since adding a trust anchor extends the universe of signatures the public verifier will accept as authentic.

A signed-fetch / transparency-log mechanism for the registry is planned for v2; for v1 the `git log` audit trail is the canonical record.

## Contributing

See [../CONTRIBUTING.md](../CONTRIBUTING.md) for the contributor workflow, code style, and review expectations.

## License

This SPA is part of the SecureFusion code distribution and is licensed under the [Apache 2.0 License](../LICENSE-CODE).
