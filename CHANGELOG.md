# Changelog

All notable changes to the SecureFusion specification, reference verifier, and supporting tooling are documented here.

The specification version (e.g. `v1.0`) and the reference verifier version (e.g. `1.0.0`) move together during the v1 series. They may diverge in the future — the verifier can receive updates while the standard remains stable.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Pending decisions
- TicketCreate-based parallel sequence handling for high-volume implementers (spec §7.1 implementation note).
- Bitcoin direct-anchor policy thresholds (when to do per-batch direct vs OpenTimestamps only).
- Dedicated security mailbox once the steering body forms.

## [1.0.0] — 2026-05-04 (in development)

### Added
- Public verifier SPA at `securefusion.org/verify` — Angular standalone, browser-only, drag-drop or file picker, three-tier result (Hash on XRPL / Signed by platform key / Bitcoin-attested). The site also serves a project landing page at `securefusion.org/` introducing the open standard.
- `bitcoinProofMode` registry field with three modes: `xrpl-sf1ots` (default for FleetFusion), `https`, `none`. Adopters choose how their Bitcoin tier is exposed.
- Reference verifier (`reference-verifier/`) — Node.js library for programmatic verification.
- Multi-language sample anchor producers (C#, Java, Go, Python, TypeScript) — all produce identical bundleHashes against the conformance vectors.
- Conformance vectors at `conformance/vectors/` — happy path + 5 tamper variants per memo set.

### Changed
- `ingestSource` field is now a single-value enum `"fleetfusion"` (was per-upstream-provider distinctions in earlier drafts).
- Schema removes `eventType`, `geo`, `driverId`, `notes`, `extras` from v1; reserved for v2.
- SF1.bundle source-code byte collapsed to single value `0x01 = FleetFusion`.

### Fixed
- Underscore-key filter removed from canonicaliser (P0 from Codex review — was breaking tamper evidence).
- Verifier now schema-validates manifests + checks XRPL tx shell + memo format/case + cross-validates eventId.
- C# sample csproj is valid XML.
- Python sample is ASCII-only (was crashing on cp1252).
- TypeScript sample is `tsc --noEmit` clean.

### Known limitations (v1)
- Registry is shipped via git (no signed-fetch or transparency log yet — v2).
- v1 verifiers reject `v != 1` manifests (forward-incompatible by design).
- `https` mode trust degrades to "trust the issuer's HTTPS endpoint" — full trustlessness only with `xrpl-sf1ots`.

## [1.0.0-rc] — 2026-05 (initial public release candidate)

### Added
- **Specification.** SecureFusion v1.0 (SF1) — complete and stable.
- **XRP Ledger memo format** — three memos per anchor (`SF1.bundle`, `SF1.event`, `SF1.sig`).
- **Canonical event manifest format** with RFC 8785 (JCS) compatible serialisation.
- **JSON schemas** for event manifest and decoded bundle memo.
- **Worked examples** — single-channel and four-channel manifests with published `bundleHash` test vectors.
- **Reference verifier** (Node.js, no third-party dependencies):
  - Canonical JSON serialisation
  - SHA-256 hashing (buffer and streaming file)
  - Memo encode/decode
  - XRPL transaction fetch over rippled JSON-RPC
  - Ed25519 signature verification
  - End-to-end `verifyManifest` and `verifyFile` APIs
  - CLI: `securefusion-verify`
  - Test suite (28 tests, all passing on Node 20 / 22)
- **Sample anchor producers** in five languages — C# (.NET 8), Python, Java, Go, TypeScript. Each produces the canonical `bundleHash` matching the published test vectors.
- **Threat model** documentation.
- **Governance, contributing, and security policy** documents.
- **GitHub issue templates** for spec issues, verifier bugs, and registry requests.
- **CI workflow** running tests on Node 20 and Node 22.

### Decided
- Use XRP Ledger as the instant-tier anchor (selected over Solana and Stellar after technical and cost evaluation).
- Use Bitcoin via OpenTimestamps as the durable-tier anchor.
- Single platform-level XRPL account model (rather than per-tenant accounts).
- SHA-256 as the hash primitive.
- Ed25519 as the application signature primitive.
- Tenants identified pseudonymously on chain; no personal data on chain.
- Spec under CC BY 4.0; code under Apache 2.0.

### Out of scope for v1.0
- Hardware-signed capture at the camera (target: SF2).
- Per-frame hashing (target: SF2).
- Public verification web app (separate repository).
- Production registry of compliant implementations (manual until enough implementers exist).
