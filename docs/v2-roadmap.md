# SecureFusion v2 — roadmap

**Status:** draft, soliciting feedback. Subject to change as v1 hits production and surfaces real-world constraints.

This document captures the design space for SecureFusion v2. v1 is intentionally minimal — it ships the smallest thing that lets a third party verify a video against a public ledger. v2 graduates the standard from "small clean v1" to a self-sustaining ecosystem with multiple compliant providers, a real trust path, and operational maturity.

The guiding rule: **v2 should be motivated by problems v1 actually hits in production, not speculation.** This document is a candidate list. The actual v2 spec freeze should follow 6–12 months of v1 operational experience.

---

## 1. Where v1 stands today

The v1 registry is a `STATIC_REGISTRY` array (`reference-verifier/src/registry.js` and `web/src/assets/trust-anchors/registry.json`) shipped inside the verifier package. Each entry carries:

| Field | Required | Meaning |
|---|---|---|
| `organisation` | yes | Display name |
| `xrplAccount` | yes | r-prefixed XRPL classic address used for SF1 anchor txs |
| `appPublicKey` | yes | 32-byte Ed25519 hex of the application signing key (SF1.sig) |
| `network` | yes | `mainnet` / `testnet` — verifier rejects ledger-family mismatch |
| `specVersion` | yes | `SF1` today; informational in v1 |
| `bitcoinProofMode` | yes | `xrpl-sf1ots` / `https` / `none` (round-4 D12) |
| `bitcoinProofUrlTemplate` | iff `https` | URL with `{eventId}` / `{bundleHash}` placeholders |
| `certifiedAt` | yes | When the entry was approved into the registry |
| `revokedAt` | no | Verifier marks anchors after this timestamp invalid |
| `active` | yes | Soft-disable without deletion |

Trust path: verifier consumers trust the GitHub repo of the standard. Tampering with a fork is detectable only by comparing against the canonical repo. Provider additions go via PR + maintainer review.

**Documented v1 limitations** (`spec/SPEC.md` §9, `spec/threat-model.md`):

- No signed-fetch protocol — registry is git-bundled
- No transparency log
- No on-chain CRL — `revokedAt` is honoured but not cross-checked against a public revocation feed
- Verifier-package staleness expected (a year-old release trusts a year-old registry)
- Forward-incompatible by construction (`v: const 1`)

---

## 2. v2 architectural options for the registry

### 2.1 — Signed static registry (recommended v2.0 floor)

Smallest delta from v1. Two artefact additions, one new spec section.

- `registry.signed.json` — the v2 registry payload + a detached Ed25519 signature by a "governance key"
- Governance key public half is baked into each verifier release
- Verifier refuses to load an unsigned registry, or one signed by a key it does not recognise
- Adopters propose new entries via PR; a governance-key signing ceremony attaches the signature on each release
- Rotation: dual-key overlap window (90 days), procedure documented

**Pros:** detects fork tampering immediately; minimal operational burden (one signing ceremony per release); no new infrastructure.

**Cons:** governance-key compromise resets the standard's trust posture; rotation is fiddly and requires coordination with every active verifier deployment.

This alone closes ~80% of the gap from "nice idea" to "real standard." Recommended as the v2.0 release scope.

### 2.2 — Transparency log + signed registry (v2.x stretch)

Adds a Sigstore-style append-only log of every registry add / remove / revocation. Conceptually equivalent to Certificate Transparency for TLS roots.

- Each registry mutation produces a log entry: hash of the entry + signed timestamp by the governance key
- Independent witnesses (≥ 2) countersign log roots — a 3rd-party operator runs a witness daemon, periodically signs the log root, publishes their signatures
- Verifier requires log-inclusion proof for every trusted entry
- Tampering remains detectable even after governance-key compromise, because witnesses dissent on tampered roots

**Pros:** post-compromise security; auditable history of who was added when by whom; aligns with how serious cross-organisation standards (TLS roots, npm, container image attestation via cosign) operate.

**Cons:** requires a log service and at least two willing witness operators; adds spec complexity; community-building problem more than a technology problem.

Defer until there is a community of multiple compliant providers willing to operate witness infrastructure.

### 2.3 — On-chain registry (v3+ aspirational)

Move the registry payload onto a public ledger.

- Each entry is an XRPL `AccountSet` tx (with structured `Domain` field) or a memo-bearing tx; governance "root" is a single canonical issuer account
- Verifier reads the registry directly from XRPL — same transitive-trust story as the anchors themselves
- Provider onboarding: provider posts a `RegisterRequest` memo tx → governance posts an approving `Endorse` tx → verifier sees both
- Revocation = a follow-up tx ("revoke entry X effective ledger Y")
- Key rotation = a `RotateKey` tx referencing the previous key

**Pros:** no GitHub repo to trust, no central server; mirrors the trust model of the anchors themselves; operational uniformity with the rest of the standard.

**Cons:** more rigid than file-based — every change costs drops; UX for adopters is harder; revocation timing semantics need careful spec text; XRPL primitives for structured registry data are limited (memo conventions would have to be invented).

Strong long-term answer. Not a v2 priority — revisit at v3+ if there are tens of providers and the GitHub-as-source-of-truth becomes a bottleneck.

---

## 3. Recommended v2 path

**v2.0 = signed static registry (§2.1) only.** Single high-leverage change. Preserves the v1 PR-based onboarding flow with minimal disruption.

**v2.1+ = transparency log (§2.2)** when there are ≥ 3 active providers and at least two community witness operators. Likely 18–24 months out.

**v3+ = on-chain registry (§2.3)** if and only if the standard scales beyond what GitHub can comfortably serve as the source of truth. Possibly never — git-tracked-and-signed is sufficient for most analogous standards (TLS root programs, RFC editor lists).

---

## 4. Adjacent v2 work (registry-related but distinct)

The list of providers is one piece. v2 also closes related gaps the v1 spec consciously punted on:

### 4.1 — Real revocation enforcement

v1 has a `revokedAt` field; the verifier reads it but the field's semantic must be locked in spec:

> *Anchors with `confirmedAt > revokedAt` are invalid. Pre-revocation anchors stay valid forever (long-term verification).*

v2 ships:

- Conformance vectors for both branches (`v2-revoked-pre-revocation.tx.json`, `v2-revoked-post-revocation.tx.json`)
- Verifier UI surfaces revocation status in the Tier-2 panel: "Signed by `<orgName>`'s key (revoked 2027-04-01; this anchor predates revocation)"
- Optional: on-chain CRL — provider posts a revocation tx with their account; verifier honours that as a more-trustworthy signal than the registry's `revokedAt`

### 4.2 — Key rotation procedure

`signerKeyId` is already in the v1 manifest schema (Phase 1 design). v2 ships:

- A worked example of rotation: provision a new app-signing key under a new `signerKeyId`, anchor a `KeyRotation` event referencing the prior key, then transition all subsequent anchors to the new key
- Conformance vector: `v2-mixed-keys.account-tx.json` containing anchors signed under two different keys, both validated under the same registry entry
- Verifier dispatch: registry entry maps `signerKeyId` → `appPublicKey`, supporting multiple historical keys per provider

### 4.3 — Per-tenant keys under a platform entry

v1 has one platform key per provider. A SaaS like FleetFusion serving 1000s of tenants might want each tenant to control their own application signing key while staying under the platform's parent registry entry.

Schema extension:

```jsonc
{
  "organisation": "FleetFusion",
  "xrplAccount": "rFleetFusion...",
  "tenantDelegations": [
    {
      "tenantId": "tnt-acme",
      "appPublicKey": "0x...",
      "delegationCert": "<base64 — parent-signed cert binding tenant key to parent>",
      "validFrom": "2027-01-01T00:00:00.000Z",
      "validUntil": null
    }
  ]
}
```

The delegation cert is a parent-signed statement: "we authorise this tenant key to sign SF1.sig memos under our XRPL account." Verifier validates the cert chain.

### 4.4 — Multi-chain anchoring

v1 anchors on XRPL with optional Bitcoin/OTS (`bitcoinProofMode`). v2 generalises:

```jsonc
{
  "anchoringChains": ["xrpl", "ethereum", "polygon"],
  "chainAdapters": {
    "xrpl": { "memoFormat": "SF1", "account": "r..." },
    "ethereum": { "contractAddress": "0x...", "eventTopic": "0x..." }
  }
}
```

Each chain has its own `findAnchor` adapter in the verifier. Adopters anchor on whichever ledger their auditors trust. The trustlessness story is preserved per-chain.

### 4.5 — Compliance metadata

Larger registry entry shape so the verifier UI can surface adopter context:

- `auditReportUrl` — public link to a recent third-party security audit
- `certifications: ["ISO27001", "SOC2"]`
- `policy.privacyUrl`, `policy.dataRetentionUrl`
- `contactSecurityEmail` — for vulnerability reports

Surfaces in the verifier UI under "About this provider" — useful for insurers / lawyers / regulators evaluating an anchor.

### 4.6 — Discovery API

Static blob of `registry.signed.json` served at a well-known URL (e.g. `https://registry.securefusion.org/v2/registry.signed.json`) with cache-control headers. Verifiers can refresh on a schedule rather than ship a snapshot. Hosting candidates: GitHub Pages of the standards repo, Cloudflare R2 + CDN, or the Azure Static Web App alongside the verifier.

### 4.7 — Federated trust roots

For adopters who don't want to trust the FleetFusion-led standard:

- Verifier configurable to accept multiple governance keys
- Each accepted key signs its own registry instance
- Verifier shows "verified under FleetFusion governance" / "verified under <other> governance"

Lets the standard fork without breaking — the spec stays one document, but governance can plurarise.

---

## 5. Out of scope for v2

These are interesting but aren't on the v2 critical path:

- **Hash agility (post-quantum, etc.).** SHA-256 has plenty of headroom for v2's lifetime. The threat-model can commit to a v3 transition window once NIST PQC standardisation lands and ages.
- **Anchored video integrity beyond the original capture.** SecureFusion attests "this is the file the platform first hashed." Going earlier (the camera sensor's electrical readings, the lens's optical attestation) is a hardware problem, not a spec problem.
- **End-to-end encryption + selective disclosure of manifest fields.** Useful for privacy-sensitive contexts (SAR redaction) but architecturally separable; could ship as v2.x or v3.

---

## 6. Prerequisites before v2 freeze

Don't touch v2 spec text until these are true:

1. **Mainnet trust anchor** for at least one provider (testnet is fine for now; mainnet validates the operational story)
2. **2–3 additional providers** in the testnet registry — proves the PR-to-add flow scales
3. **`revokedAt` enforcement test vectors** in `conformance/` — locks the semantic before v2 codifies it
4. **Public verifier site** (`verify.fleetfusion.ai`) live with real production traffic — surfaces the gaps that aren't visible from desk-design
5. **6–12 months operational experience** with v1 — long enough to accumulate the surprises that should drive v2

---

## 7. Process

The v2 spec freeze should follow these milestones:

1. **v2 design call for comments** — open a `discussion` issue on the standards repo soliciting feedback for 30 days
2. **Draft v2 spec PR** — based on §2.1 + §4.1 + §4.2 minimally, more if there's appetite
3. **Reference verifier v2 implementation** — alongside the spec PR, not after; spec changes that don't compile don't ship
4. **Conformance vectors v2** — full set of happy + tamper variants for every new field
5. **Migration guide** — what changes for a v1 provider; what changes for a v1 verifier seeing a v2 anchor
6. **Spec freeze + standards-body review** — 30-day review window before tagging `v2.0.0`

Anything that feels v1-shaped and small can ship as v1.x point releases; v2 should be the moment of meaningful design change.

---

## 8. Comments?

Open a discussion at https://github.com/FleetFusion/SecureFusion/discussions tagged `v2-roadmap`. The earlier the feedback the more shapeable v2 is.
