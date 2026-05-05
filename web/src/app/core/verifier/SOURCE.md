# Vendored from reference-verifier

These TypeScript modules are line-for-line ports of the JavaScript
modules in `securefusion/reference-verifier/src/`. They are vendored
(not depended on) so the SPA bundle does not pull `node:crypto`,
`node:fs`, or `node:buffer`.

| TS module                | Upstream JS source                                 |
| ------------------------ | -------------------------------------------------- |
| `bytes.ts`               | (new — Buffer-free helpers; SPA-only)              |
| `canonical.ts`           | `reference-verifier/src/canonical.js`              |
| `memo.ts`                | `reference-verifier/src/memo.js`                   |
| `registry.ts`            | `reference-verifier/src/registry.js`               |

**Upstream commit:** `1a586378` (HEAD of `Blockchain` at port time —
`feat(securefusion-repo): xrpl-sf1ots Tier-3 scan + Merkle branch + OTS verify`).

**Ported:** 2026-05-04 (Phase 4 SPA, Phase B Task 3).

## Maintenance rule

The TypeScript port preserves byte-for-byte canonicalisation and the
exact reason-code strings of the reference. Re-port (don't edit
in place) when upstream changes; record the new commit hash here.

The conformance vectors in
`securefusion/conformance/vectors/v1-*.manifest.json` are the
byte-equivalence oracle: the SPA's `canonicalise()` MUST produce the
identical UTF-8 bytes (and SHA-256) as the Node reference for every
vector. `canonical.spec.ts` enforces this with two regression tests
hashing the bundled fixtures and comparing against
`securefusion/examples/test-vectors.json`.
