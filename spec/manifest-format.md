# SecureFusion Canonical Event Manifest Format

**Version:** SF1
**Status:** v1.0
**Scope:** This document defines the structure, semantics, and canonicalisation rules for the SecureFusion event manifest — the JSON document that is hashed to produce the `bundleHash` and embedded in the `SF1.event` memo on the XRP Ledger.

---

## 1. Purpose

The event manifest is the canonical record of a single vehicle-media event. It binds together:

- The cryptographic hashes of every video channel in the event.
- Identifying metadata (vehicle, ingest source, timestamps).
- The originating platform's vehicle-event identifier.

The whole document is hashed (SHA-256) to produce the `bundleHash`, which is what gets anchored on chain. Anything inside the manifest is therefore tamper-evident; anything outside it is not.

## 2. Canonicalisation rules

For the `bundleHash` to be reproducible by independent verifiers, the JSON must be serialised in a canonical form. Implementations MUST follow these rules:

1. **UTF-8 encoding** — the byte representation of the JSON is UTF-8, no BOM.
2. **Sorted object keys** — every object's keys are sorted in lexicographic (Unicode codepoint) order.
3. **No insignificant whitespace** — no spaces, tabs, or newlines outside string values.
4. **Numeric literals** — integers are bare (`123`), no decimal point, no leading zeros, no exponent. **Floats are forbidden in v1** (every numeric field is integer; see SPEC §1.5 / §6).
5. **String escaping** — RFC 8785 minimal-escape: only `"`, `\`, and control characters below `0x20` are escaped. Use `\uXXXX` only for control chars that have no short escape.
6. **Boolean and null** — lowercase `true`, `false`, `null`. v1 manifests never emit `null`; optional fields are OMITTED (see §6.1.7).
7. **No duplicate keys** within any object.
8. **Array ordering is significant** — channels MUST be ordered by `channelId` using ordinal/Unicode codepoint comparison (see §6.1).

This is RFC 8785 (JCS) compatible for the v1 field set. See SPEC §2.3 for the encoder-equivalence rule that lets FleetFusion's `Utf8JsonWriter` (default HTML-safe encoder) and the reference verifier's minimal-escape encoder produce byte-identical output for any v1-conformant manifest.

## 3. Schema

The authoritative grammar is [schema/event-manifest.schema.json](../schema/event-manifest.schema.json). The narrative example below is informative.

```json
{
  "channels": [
    {
      "capturedAt": "2026-04-30T12:34:56.000Z",
      "channelId": "front",
      "durationMs": 12000,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "sizeBytes": 8421376
    }
  ],
  "eventId": "01933f5e-7c4a-7890-abcd-1234567890ab",
  "ingestSource": "fleetfusion",
  "ingestedAt": "2026-04-30T12:35:02.123Z",
  "occurredAt": "2026-04-30T12:34:56.000Z",
  "sealedAt": "2026-04-30T12:35:05.456Z",
  "signerKeyId": "platform-2026-04",
  "tenantId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "v": 1,
  "vehicleEventId": "01933f5e-7c4a-7890-abcd-1234567890ab",
  "vehicleId": "11111111-2222-3333-4444-555555555555"
}
```

## 4. Versioning

`v: 1` is constrained by the schema to `const: 1`. v1 verifiers reject any other value. v2+ verifiers MUST continue to accept v1 manifests forever (long-term verification). See SPEC §1.5.

## 5. Channel identifier vocabulary

`channelId` is a free-form identifier matching `^[a-z0-9_-]+$`. Common conventions in the field:

| `channelId` | Typical role |
|---|---|
| `front` | Forward-facing dashcam |
| `rear` | Rear-facing dashcam |
| `cabin` | In-cab driver-facing camera |
| `left` / `right` | Side cameras (mirror or quarter-panel) |
| `cargo` | Trailer/cargo cameras |
| `aux1`, `aux2`, ... | Auxiliary channels |

The vocabulary is informative; producers MAY use any identifier matching the schema's pattern. The on-chain bundleHash commits to whichever identifier the producer emitted.

## 6. Field Inventory (normative)

This is the single normative field table. Implementers MUST be able to produce a valid v1 manifest from this table alone, without reading prose elsewhere. Every field in the schema appears here and vice versa.

| Field | R/O/Omit | Type | Constraint | Example |
|---|---|---|---|---|
| `channels` | **Required** | array | minItems 1, maxItems 16. Each item is a channel object (see §6.2). Sorted by `channelId` ordinal. | `[{...}]` |
| `eventId` | **Required** | string | Lowercase hyphenated UUID, regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`. In v1 equals `vehicleEventId`. | `01933f5e-7c4a-7890-abcd-1234567890ab` |
| `ingestSource` | **Required** | string | Single-value enum `"fleetfusion"` (case-sensitive). v1 does not expose per-upstream-provider distinctions on the wire; v2 may extend this enum. | `"fleetfusion"` |
| `ingestedAt` | **Required** | string | UTC ISO-8601, regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$` (3-digit ms, suffix `Z`). | `"2026-04-30T12:35:02.123Z"` |
| `occurredAt` | **Required** | string | Same regex as `ingestedAt`. | `"2026-04-30T12:34:56.000Z"` |
| `sealedAt` | **Required** | string | Same regex as `ingestedAt`. Records when the manifest was canonicalised and `bundleHash` computed. | `"2026-04-30T12:35:05.456Z"` |
| `signerKeyId` | **Optional, omit-when-empty** | string | minLength 1, maxLength 64. Identifies which application signing key was active at sealing time. Producers MUST OMIT the field when empty/null; MUST NOT emit `""` or `null`. Verifiers MUST reject manifests where it is present-but-empty. | `"platform-2026-04"` |
| `tenantId` | **Optional, omit-when-empty** | string | minLength 1, maxLength 64. Pseudonymous tenant identifier. Producers MUST OMIT when empty/zero (e.g. empty Guid); MUST NOT emit `""` or `null`. Verifiers MUST reject manifests where it is present-but-empty. | `"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"` |
| `v` | **Required** | integer | `const: 1`. v1 verifiers reject any other value with reason code `unsupported-manifest-version`. | `1` |
| `vehicleEventId` | **Required** | string | Same regex as `eventId`. The producing platform's vehicle-event identifier. | `01933f5e-7c4a-7890-abcd-1234567890ab` |
| `vehicleId` | **Required** | string | minLength 1, maxLength 64. Tenant-chosen vehicle identifier. | `"11111111-2222-3333-4444-555555555555"` |

### 6.1 Channel sort key (normative)

Channels MUST be sorted by `channelId` using **ordinal/Unicode-codepoint** comparison — no locale, no case folding, no Unicode normalisation. FleetFusion's reference implementation uses C# `StringComparer.Ordinal`; the verifier uses JavaScript `Array.prototype.sort()` on strings, which is codepoint order.

Two implementations sorting differently (for example, by `capturedAt` or by case-insensitive name) will produce different `bundleHash` values for the same event. **Sort is part of canonical form, not a presentation choice.**

**Non-normative example.** Given an unsorted input array:

```json
[
  { "channelId": "rear", ... },
  { "channelId": "front", ... },
  { "channelId": "cabin", ... },
  { "channelId": "aux1", ... }
]
```

The canonical (sorted) order is:

```
"aux1"  (codepoints 0x61 0x75 0x78 0x31)
"cabin" (0x63 0x61 ...)
"front" (0x66 ...)
"rear"  (0x72 ...)
```

i.e. uppercase ASCII sorts before lowercase ASCII because `0x41 < 0x63`.

### 6.2 Channel object fields

Each `channels[]` entry:

| Field | R/O/Omit | Type | Constraint | Example |
|---|---|---|---|---|
| `capturedAt` | Optional | string | Same timestamp regex as the top-level fields. Channel-specific capture start. | `"2026-04-30T12:34:56.000Z"` |
| `channelId` | **Required** | string | minLength 1, maxLength 32, regex `^[a-z0-9_-]+$`. | `"front"` |
| `durationMs` | Optional | integer | minimum 1. Floats forbidden. | `12000` |
| `sha256` | **Required** | string | Lowercase hex, regex `^[0-9a-f]{64}$`. SHA-256 of the raw channel video file as received. | `"e3b0..."` |
| `sizeBytes` | **Required** | integer | minimum 1. Floats forbidden. | `8421376` |

`additionalProperties: false` — the schema rejects any field not in this table. `_comment` and friends are NOT permitted in the manifest body; put them in a sibling `*.meta.json` file (see [examples/](../examples/)).

### 6.1.7 Omit-when-empty rule (normative)

Optional fields (`tenantId`, `signerKeyId`, channel `capturedAt`, channel `durationMs`) are **OMITTED** from the canonical JSON when their domain value is empty/zero. Producers MUST NOT emit `"tenantId": ""` or `"signerKeyId": null` or any other present-but-empty form. Verifiers MUST reject any manifest in which an optional field is present but fails its schema constraint (e.g. empty string for `tenantId`).

The reason is determinism. A producer that emits `"tenantId":""` and a producer that omits the field produce different canonical bytes and therefore different `bundleHash` values for the same logical event. The omit rule eliminates the ambiguity.

## 7. Worked examples

- [examples/single-channel-event.json](../examples/single-channel-event.json) (with sibling `single-channel-event.meta.json`)
- [examples/four-channel-event.json](../examples/four-channel-event.json) (with sibling `four-channel-event.meta.json`)

The `*.meta.json` siblings carry human notes, the expected `bundleHash`, and the spec version. The manifest files themselves are pretty-printed on disk for readability; the verifier re-canonicalises (alpha-sort, no whitespace) before hashing.

## 8. Validation

A manifest MUST validate against [schema/event-manifest.schema.json](../schema/event-manifest.schema.json). Implementations SHOULD reject manifests that fail schema validation rather than attempting partial verification.
