# SecureFusion — Tamper-Evident Video Evidence for FleetFusion

**Status:** v1.0
**Owner:** Matt
**Stack:** .NET 8 / ABP Framework, Angular, Azure (SQL, Blob, Service Bus, Functions)
**Scope:** Vehicle media only — Phase 1 covers FleetLive and FTCloud integrations.
**Anchors:** XRP Ledger (instant tier) + Bitcoin via OpenTimestamps (durable tier).

---

## 1. Purpose

Provide cryptographic proof that **vehicle media** (dashcam and in-cab video) ingested into FleetFusion has not been modified since capture, and surface that proof to fleet operators, insurers, courts, and the public.

The feature is branded **SecureFusion**. When a vehicle media event is anchored to a public blockchain, FleetFusion displays a SecureFusion badge in the video player and exposes a public verification page where anyone can re-verify the file independently of FleetFusion.

Out of scope for v1: walkaround photos and videos captured via MAUI, manual console uploads, document/image attachments, and any non-vehicle media. These may be added later but are not part of the SecureFusion guarantee at launch.

## 1.5 Versioning

The manifest carries a top-level `v` (integer) field. v1 has `v = 1`; the schema constrains it as `const: 1`.

- **v1 verifiers MUST reject** any manifest with `v != 1` at schema validation, before any other check, with reason code `unsupported-manifest-version`. This is forward-incompatible by construction so that a v1 verifier never silently accepts a v2 anchor it does not understand.
- **v2+ verifiers MUST accept v1 manifests indefinitely** (long-term verification commitment). Anchors are immutable; the verification logic for them MUST NOT be removed when newer versions ship.
- The bundled XRPL account registry (see §9) carries a `specVersion` field per entry. In v1 this field is **informational** — verifiers do a string-equality check against the version of the spec they implement. v2 will introduce SemVer rules.

The CI in this repository runs the conformance vectors (see [conformance/](../conformance/)) on every release to enforce the long-term verification commitment.

## 2. Goals & non-goals

**Goals**
- Hash every piece of media at the earliest possible point in the ingest pipeline.
- Anchor every event to a public blockchain so that tamper-evidence does not depend on FleetFusion or Azure remaining trustworthy.
- Provide near-instant confirmation (XRP Ledger) and a long-term legally robust anchor (Bitcoin via OpenTimestamps).
- Expose a public, no-login verification flow that lets a third party drag in a video and get a yes/no plus event metadata.
- Keep operational cost under £100/month for the anchor layer at expected fleet scale.

**Non-goals**
- We are not building a custom blockchain. We are using existing public chains as trust anchors.
- We are not making evidential weight claims that require legal sign-off until that work has been done with our insurance and legal partners.
- Phase 1 does not cover hardware-level signing on the dashcam (this is a future enhancement that depends on device support).

## 2.3 Canonical encoding rule

**v1 manifests MUST NOT contain code points that would require divergent escaping between RFC 8785 minimal escaping and .NET `Utf8JsonWriter` default (the HTML-safe encoder).** The v1 schema enforces this through field-type restrictions: every field is a UUID, a regex-bounded id, an ISO timestamp, an integer, or an enumerated string. None of those can contain `<`, `>`, `&`, or non-ASCII code points. Both encoders therefore produce **byte-identical** output for any v1-conformant manifest.

This is the encoder-equivalence rule that lets FleetFusion's production builder (`Utf8JsonWriter` defaults) and the reference verifier's hand-rolled minimal-escape canonicaliser agree on bundleHash without either side having to change.

A v2+ manifest format that lifts the v1 field constraints (for example, allowing free-text `notes` or non-ASCII `vehicleId`) MUST mandate the cross-language equivalent of `JavaScriptEncoder.UnsafeRelaxedJsonEscaping` — i.e. RFC 8785 minimal escaping — and FleetFusion's builder MUST be updated in lockstep. v1 producers and v1 verifiers MUST reject anything outside the v1 constraints.

The reference verifier in `reference-verifier/tests/canonical.test.js` carries a byte-equality test that hashes the bundled single-channel example with the JS canonicaliser and asserts equality with the C#-emitted hash baked into `examples/test-vectors.json`. A negative test in the same file submits a manifest containing `<` and asserts schema-validation rejection — the v1 invariant cannot be bypassed.

## 3. Threat model

We are defending against:
1. **Internal tampering.** A FleetFusion operator, admin, or compromised account altering or replacing video after ingest.
2. **Storage layer compromise.** An attacker who gains access to Azure Blob Storage replacing original media.
3. **Disputed evidence.** A driver, insurer, or third party claiming that a video was modified or fabricated by FleetFusion.
4. **Long-term archival rot.** Video being needed for litigation 5–7 years after the event.

We are explicitly *not* defending against:
- Tampering between the dashcam sensor and our ingest endpoint (requires hardware signing).
- Anyone who controls the ingest server at the moment of first hash (the chain of custody starts at first hash; earlier modifications are out of scope until hardware signing is added).

## 4. High-level architecture

```
[Vehicle media: FleetLive / FTCloud]
              │
              ▼
   ┌─────────────────────┐
   │  Ingest Gateway     │   ← SHA-256 here, before any processing
   │  (Azure Function)   │
   └──────────┬──────────┘
              │
              ├───────────► Immutable Blob Storage (original)
              │             + WORM policy / legal hold
              │
              ▼
   ┌─────────────────────┐
   │ Event Manifest +    │   ← canonical JSON, hashed → bundleHash
   │ Bundle Hash         │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │ Anchor Service      │
   │ (Service Bus queue) │
   └──┬───────────────┬──┘
      │               │
      ▼               ▼
  XRPL memo tx   Bitcoin batch
  (per event,    (hourly Merkle,
   3–5s finality) anchored via
                  OpenTimestamps)
              │
              ▼
   ┌─────────────────────┐
   │ SecureFusion Ledger │   ← Azure SQL: event ↔ tx ↔ proof
   │ (canonical record)  │
   └─────────┬───────────┘
             │
   ┌─────────┴───────────┐
   ▼                     ▼
Player UI badge   Public verification site
```

## 5. Ingest & hashing

### 5.1 Sources

For Phase 1, SecureFusion covers only the two vehicle-media ingest paths:

| Source | Notes |
|---|---|
| **FleetLive** | Live and event-triggered dashcam media from connected vehicles. Multi-channel (front, cabin, side cameras) common. |
| **FTCloud** | Cloud-pulled vehicle media from MDVR / dashcam fleet. Often delivered as post-event bundles. |

Both paths must route through the SecureFusion ingest gateway before any FleetFusion processing touches the bytes. Any future vehicle-media integration (e.g. additional MDVR vendors) is added by extending the gateway with a new source adapter; the rest of the pipeline is source-agnostic.

Non-vehicle media paths (MAUI walkaround, manual upload, document attachments) are explicitly bypassed and carry no SecureFusion badge.

### 5.2 Hashing rules

- Hash is **SHA-256** over the raw bytes of the file as received.
- Hash is computed **before** any transcoding, thumbnail generation, watermarking, redaction, or metadata stripping.
- For multi-channel events (e.g. front + cabin + left + right), each channel file is hashed individually.
- The **canonical event manifest** is then constructed (see §6) and hashed to produce the **bundleHash**, which is what gets anchored.
- If the file is later transcoded for streaming, the streaming variant is treated as a *derived* asset with its own hash, linked to the original. The original is what carries the SecureFusion guarantee.

### 5.3 Storage

- Originals go into a dedicated Azure Blob Storage container with **immutability policy** (time-based retention or legal hold) enabled.
- Container is configured with versioning and soft-delete as defence-in-depth.
- Originals are never overwritten. Any redacted/edited copy (e.g. for SAR fulfilment) is stored as a new blob with its own derivation record.

## 6. Canonical event manifest

The bundle hash that goes on chain commits to a JSON manifest with stable serialisation (sorted keys, no whitespace, UTF-8, integer-only numerics, omit-when-empty optional fields). The authoritative grammar is [schema/event-manifest.schema.json](../schema/event-manifest.schema.json); the authoritative narrative is [spec/manifest-format.md](manifest-format.md).

`bundleHash = SHA-256(canonical UTF-8 bytes of the manifest JSON)`. Anything covered by the bundleHash is tamper-evident. Anything outside it (display name, tags, comments) is mutable application data.

### Field Inventory (normative)

The following table is the single normative inventory. **Implementers MUST be able to produce a valid manifest from this table alone** (devil's advocate constraint — no implementation should need to read the prose elsewhere to know what to emit).

> **Note on `ingestSource` (v1).** The wire enum is a single value: `"fleetfusion"`. SecureFusion does not expose per-upstream-provider distinctions on the public wire format — the producing platform's internal upstream routing (FleetLive, FTCloud, future MDVR partners) is intentionally hidden from the canonical manifest and the SF1.bundle source-code byte. v2 MAY extend the `ingestSource` enum and the source-code byte map; v1 verifiers MUST reject manifests carrying any other value than `"fleetfusion"`.

| Field | R/O/Omit | Type | Constraint | Example |
|---|---|---|---|---|
| `channels` | **Required** | array | minItems 1, maxItems 16. Each item is a channel object (see below). Sorted by `channelId` ordinal — see §6.1. | `[{...}]` |
| `eventId` | **Required** | string | Lowercase hyphenated UUID, regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`. In v1 equals `vehicleEventId`. | `01933f5e-7c4a-7890-abcd-1234567890ab` |
| `ingestSource` | **Required** | string | Single-value enum `"fleetfusion"` (case-sensitive). v1 does not expose per-upstream-provider distinctions on the wire; v2 may extend this enum. | `"fleetfusion"` |
| `ingestedAt` | **Required** | string | UTC ISO-8601, regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` (3-digit ms, suffix `Z`). | `"2026-04-30T12:35:02.123Z"` |
| `occurredAt` | **Required** | string | Same regex as `ingestedAt`. | `"2026-04-30T12:34:56.000Z"` |
| `sealedAt` | **Required** | string | Same regex as `ingestedAt`. Records when the manifest was canonicalised and `bundleHash` computed. | `"2026-04-30T12:35:05.456Z"` |
| `signerKeyId` | **Optional, omit-when-empty** | string | minLength 1, maxLength 64. Identifies which application signing key was active when this manifest was sealed. See §6.1.7. | `"platform-2026-04"` |
| `tenantId` | **Optional, omit-when-empty** | string | minLength 1, maxLength 64. Pseudonymous tenant identifier. See §6.1.7. | `"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"` |
| `v` | **Required** | integer | `const: 1`. v1 verifiers reject any other value with reason code `unsupported-manifest-version`. | `1` |
| `vehicleEventId` | **Required** | string | Same regex as `eventId`. The producing platform's vehicle-event identifier. | `01933f5e-7c4a-7890-abcd-1234567890ab` |
| `vehicleId` | **Required** | string | minLength 1, maxLength 64. Tenant-chosen vehicle identifier. | `"11111111-2222-3333-4444-555555555555"` |

Channel object fields:

| Field | R/O/Omit | Type | Constraint | Example |
|---|---|---|---|---|
| `capturedAt` | Optional | string | Same timestamp regex as the top-level fields. Channel-specific capture start. Omit when not known. | `"2026-04-30T12:34:56.000Z"` |
| `channelId` | **Required** | string | minLength 1, maxLength 32, regex `^[a-z0-9_-]+$`. | `"front"` |
| `durationMs` | Optional | integer | minimum 1. Floats forbidden. Omit when not known. | `12000` |
| `sha256` | **Required** | string | Lowercase hex, regex `^[0-9a-f]{64}$`. SHA-256 of the raw channel video file as received. | `"e3b0..."` |
| `sizeBytes` | **Required** | integer | minimum 1. Floats forbidden. | `8421376` |

Fields not listed here are NOT part of v1; future versions MAY add them under a bumped `v`. The schema sets `additionalProperties: false` so any unknown field at parse time is a hard failure.

### 6.1 Channel sort key (normative)

Channels MUST be sorted by `channelId` using **ordinal/Unicode-codepoint** comparison — no locale, no case folding, no Unicode normalisation. FleetFusion's reference implementation uses C# `StringComparer.Ordinal`. The reference verifier uses JavaScript `Array.prototype.sort()` on string keys, which is codepoint order. Java implementations MUST use `String.compareTo` (which is codepoint order) — NOT `Collator`. Two implementations sorting differently will produce different `bundleHash` values for the same event. Sort is part of canonical form, not a presentation choice.

**Non-normative example.** Given an unsorted input array `[{rear}, {front}, {cabin}, {AUX1}]`, the canonical (sorted) order is `[{AUX1}, {cabin}, {front}, {rear}]`, because uppercase ASCII (`0x41`) sorts before lowercase ASCII (`0x63`).

### 6.1.7 Omit-when-empty rule (normative)

Optional fields (`tenantId`, `signerKeyId`, channel `capturedAt`, channel `durationMs`) are **OMITTED** from the canonical JSON when their domain value is empty/zero. Producers MUST NOT emit `"tenantId": ""` or `"signerKeyId": null` or any other present-but-empty form. Verifiers MUST reject any manifest in which an optional field is present but fails its schema constraint (for example, an empty `signerKeyId`), because such a manifest would canonicalise to different bytes than one that simply omitted the field — the bundleHash would differ between two producers that both interpreted "no value" as "absent" vs "empty string".

The omit rule is what makes signerKeyId backward-compatible: Phase 1 anchors that pre-date the field have no value; producers omit it; the canonical bytes do not change; historical hashes remain valid.

## 7. Anchoring pipeline

### 7.1 XRP Ledger — instant tier

The XRP Ledger is used for the per-event, near-real-time anchor. Each event is anchored as a single Payment transaction (sent from the SecureFusion source account back to itself) carrying **exactly three** Memo entries that fully describe the event.

**Why XRPL:**
- **Rich memo capacity.** Each transaction supports up to 3 Memo entries. `MemoData` is hex-encoded and effectively bounded by the ~1KB transaction-size limit, giving us roughly 900 bytes total — enough to anchor the bundleHash *and* the full event record on chain in one transaction.
- **Fast finality.** 3–5 second consensus, no priority fee bidding.
- **Predictable cost.** ~10 drops per transaction (~$0.0000139 today). No surge pricing under our load.
- **Stable network.** XRPL has run continuously since 2012 with no major outages.
- **Carbon-neutral.** Useful ESG story for fleet customers.

**Transaction layout per event (v1 — three memos, no extras, no duplicates):**

```
Transaction:
  TransactionType: Payment
  Account:         <SecureFusion account>
  Destination:     <SecureFusion account>   (self-pay)
  Amount:          10                       (10 drops, configurable via SelfPayDrops)
  Fee:             12                       (drops; producer-clamped to MaxFeeDrops)

  Memos: [
    {
      MemoType:   "SF1.bundle"      (case-sensitive, ASCII bytes 5346312E62756E646C65)
      MemoFormat: "application/octet-stream"
      MemoData:   <hex of 50-byte payload>
        bundleHash       (32 bytes)
        eventIdGuid      (16 bytes — see memo-format §3.1 for byte order)
        ingestSourceCode (1 byte: v1 only defines fleetfusion=0x01; see memo-format §6)
        channelCount     (1 byte, 1..255)
    },
    {
      MemoType:   "SF1.event"       (case-sensitive)
      MemoFormat: "application/json"
      MemoData:   <hex of canonical event JSON — see §6 / spec/manifest-format.md>
    },
    {
      MemoType:   "SF1.sig"         (case-sensitive)
      MemoFormat: "application/octet-stream"
      MemoData:   <hex of Ed25519 signature by SecureFusion app key
                   over the canonical bytes of Memos 1 + 2>
    }
  ]
```

**Memo set rule (normative).** A v1 verifier MUST reject:

- Any tx whose `MemoType` set is not exactly `{SF1.bundle, SF1.event, SF1.sig}` (case-sensitive ASCII match against the byte sequences above).
- Duplicates (two memos with the same SF1 name).
- Extras (a fourth memo of any type).
- Missing memos (only two of the three SF1 names present).
- A `MemoFormat` that does not match the table above for the corresponding `MemoType`.

Each rejection returns a structured `reason` code (`memo-extra`, `memo-duplicate`, `memo-missing`, `memo-type-case`, `memo-format-mismatch`). Phase 4 SF1.ots upgrade transactions are a separate, distinct memo set (`{SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig}`) and are NOT consumed by the v1 verifier in this repository.

**Why the third memo (`SF1.sig`)** — defence in depth. The XRPL transaction is already signed by the SecureFusion XRP account key, but that key signs *transaction shape*, not application semantics. A separate Ed25519 signature held in Azure Key Vault, signing the canonical bytes of memos 1 and 2, gives us a second independent attestation that survives even if the XRP account key is rotated or compromised.

**Pipeline:**
- Each event triggers an `AnchorRequested` message on Service Bus.
- Anchor worker (Azure Function, queue-triggered) constructs the transaction above.
- XRP account keypair held in **Azure Key Vault** (Managed HSM for production); application Ed25519 signing key held separately in the same vault.
- Submit via `submit` rippled API; poll `tx` for `validated: true`.
- Confirmation typically 3–5 seconds.
- On validation: write txHash + ledgerIndex + closeTime into the SecureFusion ledger; flip event status to `XrpConfirmed`.
- On failure: exponential backoff with poison queue after N attempts; alert ops.
- On `tefMAX_LEDGER` or sequence collision: rebuild and resubmit with current sequence number.

**Account model:**
- **Single platform-level SecureFusion XRPL account.** All anchors across all tenants are signed by one account.
- Funded with reserve (10 XRP base, ~£11) plus operating float (~200 XRP recommended, refilled monthly via scheduled top-up).
- Tenant identity is carried in the `SF1.event` memo payload, not at the account level. Verifiers query our public API (or our private ledger) to map a tenant ID to a customer name; the on-chain record is tenant-pseudonymous.
- One-off setup; no per-event reserve growth; no per-tenant account proliferation.
- Account address is published in SecureFusion documentation so independent verifiers can confirm anchors come from the official source.

### 7.2 Bitcoin — durable tier

- A separate worker collects all bundleHashes from a one-hour window and builds a **Merkle tree** over them.
- The Merkle root is submitted to **OpenTimestamps** (free; aggregates with other users into a single Bitcoin transaction roughly hourly).
- Per-event proof files (`.ots`) are returned and stored against each event.
- Once OpenTimestamps reports a Bitcoin confirmation, the proof is upgraded and stored; event status flips to `BitcoinConfirmed`.
- For high-value events flagged by operator or policy (e.g. active insurance claim, DVSA case), a **direct Bitcoin transaction** is submitted with the Merkle root in `OP_RETURN`. Cost: ~£1.50/tx at current fees. This is on-demand, not default.

#### 7.2.1 Bitcoin proof modes (round-4 D12)

How the Bitcoin tier reaches a third-party verifier is configurable per provider. The provider's registry entry declares `bitcoinProofMode` (see §9), and v1 verifiers MUST handle all three modes:

| Mode | Meaning | Verifier behaviour |
|---|---|---|
| `xrpl-sf1ots` | Provider publishes a per-event SF1.ots upgrade tx to XRPL after the OTS proof is upgraded with a Bitcoin block attestation. **FleetFusion default.** | Scan for the sibling SF1.ots tx by `bundleHash` → fetch Merkle branch + OTS proof from XRPL memos → run OTS verify → render Tier-3 result. Fully trustless. See §7.2.2 for the scan procedure. |
| `https` | Provider exposes the OTS proof + Merkle branch via a documented HTTPS URL pattern. | Substitute placeholders into `bitcoinProofUrlTemplate` (see §9.4) → fetch JSON → run OTS verify locally. Trust degrades to "trust the issuer's HTTPS endpoint" — cryptographic verification still local. |
| `none` | Provider does not expose a Bitcoin tier at all. | Skip Tier-3. Render "Bitcoin attestation not provided by this issuer" — Tiers 1 + 2 still pass; the verifier MUST NOT fail the overall result. |

The mode is per-provider, not per-event. A provider runs in exactly one mode at a time; switching modes is a registry update (§9). The motivation for `https` and `none` is cost: the SF1.ots tx is one extra XRPL transaction per anchored event, which a smaller adopter may not want to pay for.

#### 7.2.2 `xrpl-sf1ots` scan procedure (Phase 4)

Verifiers in `xrpl-sf1ots` mode SHOULD scan `account_tx` for the registry's account, filter to the OTS upgrade memo set (`{SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig}`), and match by `bundleHash` against the original anchor's `SF1.bundle.bundleHash`. Scan timeout SHOULD default to 30 seconds; longer scans SHOULD use `fromLedger` resume so a verifier can break the work into bounded slices instead of repeating the whole history. If the scan exhausts without finding a match, Tier-3 status is `not-found` and the overall result MAY still verify (Tier-3 is best-effort and MUST NOT block Tiers 1 + 2).

When a matching SF1.ots tx is found, the verifier MUST:
1. Verify `SF1.sig` (Ed25519) over `SF1.bundle.data || SF1.merkleProof.data || SF1.ots.data` against the registry's `appPublicKey`. Failure surfaces as `tier3.status: "invalid-signature"` (Tier-3 fails; Tiers 1 + 2 still pass).
2. Decode `SF1.merkleProof` as canonical JSON (an array of `{ side: "L" | "R", hash: <hex32> }` steps).
3. Reapply the branch starting from the original anchor's `bundleHash` (lowercase hex). Each step uses double-SHA-256 (Bitcoin / NBitcoin convention) — `H(L || R)` then `H(...)` again. An empty branch is permitted and means the leaf is itself the batch root (the single-event-batch case).
4. Run OpenTimestamps verification on `SF1.ots`. The `javascript-opentimestamps` library is an OPTIONAL dependency of the reference verifier; verifiers without it installed SHOULD surface `tier3.status: "attested-on-chain"` (XRPL leg fully verified; Bitcoin block resolution deferred).
5. On full OTS resolution, surface `tier3.status: "verified"` plus `tier3.bitcoin = { blockHeight, blockTimeUtc }`.

The OTS upgrade memo set is decoded by a separate routine from the v1 anchor memo set (§7.1). v1 anchor verifiers MUST reject 4-memo OTS upgrade transactions with `memo-extra` (the anchor memo set is exactly 3); the OTS scanner MUST reject 3-memo anchor txs with `memo-missing` when treated as a candidate upgrade. The two decoders share the same case-sensitive ASCII MemoType comparison and the same per-memo MemoFormat constraints.

### 7.3 Why both chains

- **XRPL** gives the operator an answer in 3–5 seconds, suitable for the player badge UX and "verified" confirmation while a driver is still on scene. The rich memo carries the full event record on chain — a verifier opening the transaction in any XRPL block explorer can read the event without our help.
- **Bitcoin (via OTS)** gives the long-term, court-defensible, free-to-operate anchor. Bitcoin has the strongest case-law track record and the deepest archival guarantees.
- If XRPL is ever challenged or goes away, Bitcoin remains. If a single Bitcoin anchor needs faster proof for a specific case, we can pay for a direct one.

### 7.4 Cost envelope

Worked example: a fleet of 10,000 vehicles each producing 20 anchored video events per day = **200,000 events/day**.

| Component | Estimated monthly cost |
|---|---|
| XRPL anchors (1 tx per event, 10 drops each) | ~£65 |
| OpenTimestamps Bitcoin anchors (hourly Merkle batch) | £0 |
| On-demand direct Bitcoin anchors (high-value cases) | ~£1.50 each, capped budget |
| Azure Functions / Service Bus / Key Vault | negligible |
| **Total at 200k events/day** | **~£70–£100/month** |

Smaller fleets scale linearly: at 5,000 events/day the XRPL spend drops to ~£1.60/month. XRP price volatility moves the absolute number but the order of magnitude stays the same — at the all-time high of ~$3.40 the monthly anchor spend is still under £200 even at 200k events/day.

Recommend pre-funding the SecureFusion XRPL account with ~200 XRP and a scheduled monthly top-up; no need for live exchange integration.

## 8. Threat model — Replay and re-anchor stance

This section is part of the SecureFusion v1 protocol; companion narrative lives in [spec/threat-model.md](threat-model.md).

A v1 verifier is given a single XRPL transaction hash and asked whether it is a valid SecureFusion anchor. Discovery (scanning the ledger for related anchors) is NOT part of the primary verify path. The verifier returns `{ verified: true | false, reason?, warnings: [] }`.

**Replay across accounts.** Each registry entry pins one `appPublicKey` to one XRPL account. A tx replayed under a different account fails Ed25519 verification because the public key is per-account. Reason code: `signature-invalid`.

**Re-anchor under the same account.** The same `eventIdGuid` may legally appear in two validated XRPL transactions from the same registry account — for example because the producer retried after a transient failure but the original tx eventually validated. v1 stance:

- The primary verify path on the supplied tx still passes if all other checks pass. The supplied tx is genuine.
- The verifier MAY perform a best-effort `account_tx` lookup (rate-limit-aware, must not block primary verify) to find other validated txs from the same account whose decoded `SF1.bundle.eventIdGuid` is identical to the supplied tx's.
- If another tx is found, the verifier surfaces a `duplicate-anchor-suspected` warning in the result's `warnings: []` array. The warning is informational; the consumer decides how to react.
- If the lookup itself fails (rate-limit, network, or unsupported endpoint), the verifier emits a different diagnostic warning and continues.

The implementation lives in `reference-verifier/src/index.js`; the test that asserts the warning fires lives in `reference-verifier/tests/verify.test.js` (B2.7 / test-matrix #12).

## 9. Registry — trust model and limits

A SecureFusion verifier resolves an XRPL `Account` to an `appPublicKey` (and other metadata) through the bundled registry. The registry source-of-truth lives in [reference-verifier/src/registry.js](../reference-verifier/src/registry.js).

### 9.1 Required entry fields

Each registry entry MUST carry the following fields:

| Field | Type | Purpose |
|---|---|---|
| `account` | string | XRPL account address (classic, e.g. `r...`). |
| `network` | string | `"mainnet"` or `"testnet"`. The verifier MUST reject any tx whose ledger family does not match. |
| `appPublicKey` | string (hex) | 32-byte Ed25519 public key used for SF1.sig verification. |
| `revokedAt` | string (ISO-8601) or `null` | Revocation timestamp. Pre-revocation txs remain valid; post-revocation txs MUST be rejected. |
| `specVersion` | string | Spec version this entry was registered under (informational in v1; SemVer in v2+). |
| `organisation` | string | Display name for the operating party. Demo / testnet entries MUST include the literal substring `"TESTNET — DEMO ONLY"`. |
| `bitcoinProofMode` | string enum | One of `"xrpl-sf1ots"`, `"https"`, `"none"`. Selects how Tier-3 (Bitcoin attestation) is sourced; see §7.2.1 for verifier behaviour and round-4 D12 for the rationale. |
| `bitcoinProofUrlTemplate` | string \| omitted | Required iff `bitcoinProofMode === "https"`. HTTPS URL template; grammar in §9.5. MUST be omitted in the other two modes. |

### 9.2 Verifier rules (normative)

- The verifier MUST refuse if a tx's ledger family does not match the registry entry's `network`. Reason code: `network-mismatch`.
- The verifier MUST refuse if the tx's `closeTime` (or whatever ledger-time field rippled returns) is `> revokedAt`. Reason code: `revoked-key`. Pre-revocation txs are always accepted, even after revocation.
- The verifier MUST treat an unknown `Account` as a hard failure. Reason code: `account-not-registered`.

### 9.3 Trust limits (v1)

The v1 registry is **shipped as static JavaScript inside the npm package**. Trust is therefore inherited from:

- The repository's commit-signing and code-review controls.
- The packaging pipeline that publishes a verifier release.
- The integrity of the consumer's npm install (lockfile, package-lock or yarn.lock review).

**v1 has NO signed-registry fetch and NO transparency log.** This is a known limitation, surfaced here and in [SECURITY.md](../SECURITY.md). v2 will introduce:

- A signed registry served from a stable URL with a governance-key signature the verifier validates.
- A transparency log (Sigstore Rekor or equivalent) so revocations are publicly auditable.
- A staleness policy (the verifier refuses if the registry is older than N days when run online).

A bundled v1 verifier release implicitly trusts the registry it shipped with. Operators handling high-stakes verifications SHOULD pin to a recent verifier release and re-pin on every governance change.

### 9.4 Demo (testnet) entry

The bundled `testnet` entry's `appPublicKey` is derived from the deterministic seed `SF1_TEST_APP_SEED` (bytes `0x00..0x1F`, see [conformance/README.md](../conformance/README.md)). It exists for end-to-end conformance testing only and MUST NEVER be used to anchor production data. Its `organisation` field is hard-coded to start with `"TESTNET — DEMO ONLY"`, and its `bitcoinProofMode` is `"xrpl-sf1ots"` (FleetFusion default) so a verifier writing an audit log surfaces the demo-ness explicitly.

### 9.5 `bitcoinProofUrlTemplate` grammar (normative, applies when `bitcoinProofMode === "https"`)

The template is an HTTPS URL string. The verifier substitutes per-event values into placeholders before the GET:

| Placeholder | Substituted with |
|---|---|
| `{eventId}` | The manifest's `eventId` (lowercase hyphenated UUID). The verifier URL-encodes the value before substitution. |
| `{bundleHash}` | The 64-character lowercase hex SHA-256 of the canonical event bytes (i.e. `SF1.bundle.bundleHash`). The verifier URL-encodes the value before substitution. |

Constraints:

- The template MUST start with `https://`. The verifier MUST reject `http://` (or any other scheme) with a `mode-invalid` Tier-3 result.
- The template MAY contain neither, either, or both placeholders. Tokens that aren't placeholders are passed through verbatim.
- The verifier follows the same redirect-manual posture as `xrpl.js` (B2.8 / DA §3): a 30x response is treated as a hard failure, not silently followed. A non-200 status surfaces as a `https-fetch-failed` Tier-3 result with `reason: "http-<status>"`.

The response body MUST be a JSON object with the following shape (additional fields ignored):

| Field | Type | Required | Purpose |
|---|---|---|---|
| `otsProofBase64` | string (base64) | Yes | The standard OpenTimestamps `.ots` proof bytes for the Bitcoin batch root, base64-encoded. The verifier runs OTS verification locally on these bytes. |
| `merkleProofJson` | string (JSON) | Yes | Canonical JSON of the per-event Merkle branch (the issuer's `SecureAnchor.MerkleProofJson`). The verifier reapplies the branch to the event's `bundleHash` to derive the batch Merkle root that OTS attests. |
| `eventId` | string | Optional | If present, MUST equal the manifest's `eventId` (case-insensitive match). Misrouted responses fail with `https-response-invalid: eventId-mismatch`. |
| `bundleHash` | string | Optional | If present, MUST equal the matched `bundleHash` (case-insensitive match). Misrouted responses fail with `https-response-invalid: bundleHash-mismatch`. |

The verifier MUST validate the response shape (presence + base64 / non-empty string types) before any further processing. Failure modes return a `Tier-3` result of `{ status: 'https-response-invalid', reason: '<code>' }`; Tiers 1 + 2 still pass.

## 10. SecureFusion ledger (Azure SQL)

### 10.1 Tables (ABP entity sketches)

```
SecureEvent
  Id (Guid, PK)
  EventId (Guid, unique)
  TenantId
  BundleHash (char(64))
  ManifestJson (nvarchar(max))
  Status (enum: Pending, XrpConfirmed, BitcoinConfirmed, Failed)
  IngestedAt
  CreatedAt, ModifiedAt (ABP audit)

SecureEventChannel
  Id, SecureEventId (FK)
  ChannelId, Role
  Sha256 (char(64))
  BlobUri, SizeBytes, DurationMs, Codec, Resolution

SecureAnchor
  Id, SecureEventId (FK or null for batch anchors)
  Chain (enum: Xrpl, Bitcoin)
  TxId / BatchId
  LedgerIndex (XRPL ledger index, nullable)
  CloseTime (XRPL close time, nullable)
  MerkleRoot (for Bitcoin batches)
  MerkleProofJson (per-event proof against the batch root)
  OtsProof (varbinary(max), nullable)
  AppSignature (varbinary(64), Ed25519 sig over memos for XRPL anchors)
  ConfirmedAt
  Status (Pending, Confirmed, Failed)

SecureBatch
  Id, ChainType
  WindowStart, WindowEnd
  MerkleRoot
  AnchorTxId
  EventCount
```

### 10.2 Verification flag on media

The existing `EventMedia` (or equivalent) entity gains:

```
SecureFusionStatus  enum: NotAnchored | Pending | XrpVerified | FullyVerified
SecureFusionAnchorRef  Guid → SecureEvent.Id
```

This is what the UI keys off for badge display.

## 11. Player UI — SecureFusion badge

In the Angular video player component:

- **NotAnchored / Pending**: no badge.
- **XrpVerified**: SecureFusion logo with "Verified" label, click reveals XRPL transaction hash + link to an XRPL explorer (Bithomp, XRPScan, or our own).
- **FullyVerified**: same logo with a second tier indicator ("Bitcoin anchored"), reveals both XRPL and Bitcoin proof details.

Badge tooltip / details panel exposes:
- `bundleHash`
- Per-channel SHA-256 hashes
- XRPL transaction hash + ledger index + close time + explorer link
- OpenTimestamps `.ots` download
- Application signature (`SF1.sig` memo) for independent verification
- "Verify externally" link → public verification site (§12) with eventId pre-filled where allowed.

Badge component is a reusable Angular module so it can drop into the desktop console, MAUI WebView surfaces, and the public site.

## 12. Public verification site

### 12.1 Goals

A no-login, no-FleetFusion-account-required page where anyone (insurer, lawyer, journalist, court clerk) can drag a video file in and get an answer.

### 12.2 Flow

1. User drops video file into the upload area.
2. **Hashing happens client-side in the browser** (Web Crypto API, SHA-256 streamed). The file never leaves the user's machine.
3. The hash is sent to a public read-only API endpoint.
4. API responds with one of:
   - **Match — verified.** "This file matches event {eventId}, anchored on the XRP Ledger at {time} (tx {txHash}, ledger {ledgerIndex}) and on Bitcoin via OpenTimestamps at {time}. Captured by vehicle in tenant {tenant display name} on {date}." (Tenant-controlled redaction policy decides what is shown.)
   - **Match — pending.** "We have this hash but it has not yet been anchored to a public chain."
   - **No match.** "This file is not in the SecureFusion ledger. It was not ingested through FleetFusion, or has been modified since ingest."
5. Result page exposes the same anchor details as the player badge, plus a "verify independently" tab that walks the user through running the verification themselves against the XRP Ledger and Bitcoin without trusting our API.

### 12.3 Privacy

- Tenants opt in to public verifiability per event class (e.g. "incidents involving third parties: yes; routine walkarounds: no").
- For opt-out events, the public response is "hash known, details private — contact the fleet operator."
- Driver and vehicle PII is never exposed without tenant consent.
- The site logs queried hashes (not files) for abuse detection; logs are tenant-visible.

### 12.4 Tech

- Static Angular app on Azure Static Web Apps or Cloudflare Pages.
- Public API is a small ASP.NET minimal API behind Front Door / Cloudflare with strict rate limiting.
- Read-only credentials. No write path from the public site into the FleetFusion data plane.

## 13. Implementation phases

### Phase 1 — Foundations (Weeks 1–3)
- Ingest gateway hashing on FleetLive and FTCloud paths only.
- Source adapter pattern so new vehicle-media providers slot in without changing downstream pipeline.
- Immutable Blob container with retention policy.
- `SecureEvent`, `SecureEventChannel`, `SecureAnchor` tables, ABP entities, repository layer.
- Background service writes manifest + bundleHash; status stays `Pending`.

### Phase 2 — XRP Ledger anchoring (Weeks 4–5)
- XRPL anchor worker using `xrpl.js` or `XRPL.NET` client.
- Key Vault integration for XRP account key + Ed25519 application signing key.
- Three-memo transaction submission with retry, sequence handling, and validation polling.
- Status flips to `XrpConfirmed`.
- Player badge in Angular console.

### Phase 3 — Bitcoin anchoring (Weeks 6–7)
- Hourly Merkle batch worker.
- OpenTimestamps client integration.
- `.ots` proof storage and upgrade-on-confirmation.
- Status flips to `FullyVerified`.

### Phase 4 — Public verification site (Weeks 8–9)
- Static site with client-side hashing.
- Public read API.
- Tenant opt-in policy controls.
- "Verify independently" walkthrough.

### Phase 5 — Hardening (Weeks 10–12)
- Penetration test of public API.
- Key rotation runbook.
- Disaster recovery: how do we re-anchor if XRPL or OTS go down? (queue-and-replay; XRPL has had no major outage since 2012, but plan for it).
- Legal review with insurance and DVSA partners.
- Documentation + customer-facing marketing material.

## 14. Open questions

1. **FleetLive raw bytes.** At what point in the FleetLive pipeline do we get the file? If it has already been transcoded or repackaged upstream, "first hash" is happening on a derived asset, not the camera output. Need to map this end-to-end before Phase 1 sign-off.
2. **FTCloud raw bytes.** Same question for FTCloud — confirm we are hashing the file as delivered by the source, not after our own ingest pipeline has touched it. If FTCloud delivers a multi-file bundle, confirm whether each part is hashed individually or only the bundle.
3. **Do FleetLive and FTCloud expose any source-side hash or signature we could capture and store alongside ours?** If so, we record both and can later prove integrity from an even earlier point.
4. Do we want our own OpenTimestamps calendar server eventually, or always rely on the public ones? Public is fine for years; revisit at scale.
5. Retention: how long do we keep `.ots` proof files? Forever, in principle. They are small.
6. What's the policy when an originally anchored video needs to be redacted under a SAR? The original stays anchored; the redacted version is a derived asset with its own anchor and a documented derivation record. Need legal sign-off on this.
7. Multi-channel correlation: when FleetLive delivers channels in separate messages over time, how long do we wait before sealing the manifest? Need a policy (e.g. 60s window after first channel, then seal whatever has arrived).

## 15. Future enhancements

- **On-device hashing inside the dashcam** with secure-element-backed signing keys per device. Dependent on device firmware support.
- **Hardware-signed dashcams** as a procurement criterion for next-gen fleet hardware.
- **Additional vehicle-media providers** (third-party MDVR, direct device integrations) added via the source adapter pattern.
- **Extending SecureFusion to non-vehicle media** (MAUI walkaround, manual evidence uploads) once the vehicle-media path is proven and customer demand is established.
- **eIDAS qualified timestamp** layered on top for UK/EU regulated industries (insurance, transport regulators).
- **Per-frame hashing** for very long videos so partial extracts can be verified independently.
- **Verifier SDK** so insurance companies and law firms can verify SecureFusion media inside their own software without using our public site.
