# SecureFusion XRP Ledger Memo Format (SF1)

**Version:** SF1
**Status:** v1.0
**Scope:** This document defines the binary and JSON formats for SecureFusion anchor transactions on the XRP Ledger.

---

## 1. Overview

A SecureFusion anchor on the XRP Ledger is a single `Payment` transaction sent from the SecureFusion source account back to itself, carrying **exactly three** Memo entries that together describe a single video event.

| Memo | Type | MemoFormat | Purpose |
|---|---|---|---|
| 1 | `SF1.bundle` | `application/octet-stream` | Compact 50-byte binary header with bundleHash and core identifiers |
| 2 | `SF1.event`  | `application/json`         | Full canonical event manifest as JSON |
| 3 | `SF1.sig`    | `application/octet-stream` | Ed25519 signature over the canonical bytes of memos 1 and 2 |

All three memos are required for a transaction to be considered SecureFusion-compliant. **No other memos are permitted.** A v1 verifier MUST reject:

- Any tx whose memo set is not exactly the three SF1 names above (case-sensitive ASCII match against the bytes `SF1.bundle`, `SF1.event`, `SF1.sig`).
- Duplicates (two memos with the same SF1 name).
- Extras (a fourth memo of any type).
- Missing memos (only two of the three SF1 names present).
- A `MemoFormat` that does not match the table above for the corresponding `MemoType`.

This is locked by SPEC §7.1; see also the §8 threat model for replay considerations.

(Phase 4 SF1.ots upgrade transactions are a *separate*, distinct memo set: `{SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig}`. The v1 verifier in this repository does not consume them; that lands as a future PR.)

## 2. Transaction shell

```
{
  "TransactionType": "Payment",
  "Account":         "<SecureFusion source account>",
  "Destination":     "<SecureFusion source account>",
  "Amount":          "10",
  "Fee":             "12",
  "Sequence":        <ledger-managed>,
  "Memos":           [ <Memo 1>, <Memo 2>, <Memo 3> ]
}
```

The transaction is signed by the SecureFusion XRPL account key. The `Amount` is symbolic (10 drops, configurable via the producer's `SelfPayDrops` option); the source and destination accounts are the same, so no value transfer occurs. The verifier MUST assert `Account == Destination`.

## 3. Memo 1: `SF1.bundle`

A compact binary header — fixed structure, fast to parse without JSON.

**Encoding:** `MemoData` is the hexadecimal encoding (uppercase) of the binary payload.

**Binary layout:** 50 bytes total.

| Offset | Length | Field | Type |
|---|---|---|---|
| 0  | 32 | `bundleHash`       | SHA-256 over the canonical bytes of Memo 2's payload |
| 32 | 16 | `eventIdGuid`      | Event ID as the 16-byte UUID (see §3.1 for byte order) |
| 48 | 1  | `ingestSourceCode` | Source code (see §6) |
| 49 | 1  | `channelCount`     | Number of video channels in the event (1 to 255) |

**Memo fields:**

```json
{
  "Memo": {
    "MemoType":   "<hex of 'SF1.bundle'>",
    "MemoFormat": "<hex of 'application/octet-stream'>",
    "MemoData":   "<hex of 50-byte binary payload>"
  }
}
```

**MemoType encoded:** `5346312E62756E646C65` (`SF1.bundle` in ASCII, 10 bytes).

**MemoFormat encoded:** `6170706C69636174696F6E2F6F637465742D73747265616D` (`application/octet-stream` in ASCII).

### 3.1 GUID byte order

FleetFusion's reference producer (`SecureManifestBuilder` + `RippledXrpAnchorClient`) uses **.NET `Guid.ToByteArray()` byte order** — a mixed-endian layout where the first three fields (`Data1` 4 bytes, `Data2` 2 bytes, `Data3` 2 bytes) are little-endian and the trailing 8 bytes are written verbatim. Sample reproductions in C#, Java, JS, etc., MUST mirror this layout exactly to produce matching bundle bytes.

For the `eventId` string `aabbccdd-eeff-0011-2233-445566778899`, the on-chain 16-byte sequence is:

```
DD CC BB AA   FF EE   11 00   22 33 44 55 66 77 88 99
^^^^^^^^^^^   ^^^^^   ^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^
Data1 (LE)    Data2   Data3   Data4 (verbatim)
```

This differs from RFC 4122 big-endian. Implementers porting from a system that uses RFC 4122 byte order MUST byte-swap the first three fields before building `SF1.bundle`. The conformance vectors in [conformance/vectors/](../conformance/vectors/) freeze this convention.

## 4. Memo 2: `SF1.event`

The full canonical event record as JSON.

**Encoding:** `MemoData` is the hexadecimal encoding of the UTF-8 bytes of the canonical JSON document defined in [manifest-format.md](manifest-format.md).

**Canonicalisation:** the JSON must be serialised with sorted keys, no whitespace outside string values, and UTF-8 encoding. This is what makes the bundle hash reproducible. See manifest-format §2 for the rules.

**Size constraint:** the JSON payload is bounded by the XRPL transaction-size limit (~1KB across all memos). v1 manifests fit comfortably under 700 bytes.

**Memo fields:**

```json
{
  "Memo": {
    "MemoType":   "<hex of 'SF1.event'>",
    "MemoFormat": "<hex of 'application/json'>",
    "MemoData":   "<hex of canonical JSON>"
  }
}
```

**MemoType encoded:** `5346312E6576656E74` (`SF1.event` in ASCII, 9 bytes).

**MemoFormat encoded:** `6170706C69636174696F6E2F6A736F6E` (`application/json` in ASCII).

## 5. Memo 3: `SF1.sig`

An Ed25519 signature attesting that Memos 1 and 2 were produced by an authorised SecureFusion application key.

**Signature input:** the concatenation of:

1. The raw 50 bytes of the Memo 1 payload (pre-hex-encoding).
2. The raw UTF-8 bytes of the Memo 2 canonical JSON (pre-hex-encoding).

That is, no separator, no length prefix — just `bundle_bytes || event_bytes`.

**Signature algorithm:** Ed25519 (RFC 8032).

**Encoding:** `MemoData` is the hexadecimal encoding of the 64-byte raw signature output.

**Memo fields:**

```json
{
  "Memo": {
    "MemoType":   "<hex of 'SF1.sig'>",
    "MemoFormat": "<hex of 'application/octet-stream'>",
    "MemoData":   "<hex of 64-byte Ed25519 signature>"
  }
}
```

**MemoType encoded:** `5346312E736967` (`SF1.sig` in ASCII, 7 bytes).

### 5.1 Why a separate application signature?

The XRPL transaction is already signed by the SecureFusion XRPL account key. The application signature in Memo 3 is *additional* to this and serves a different purpose:

- The XRPL account key signs the *transaction wrapper*. If that key is rotated, lost, or compromised, only the transaction-level signature is affected.
- The application signature is held in a separate Azure Key Vault HSM and signs the *application semantics*. It can survive XRPL account rotation, and gives verifiers a second independent attestation.

Verifiers MUST check both signatures. Failure of either is a verification failure.

## 6. Ingest source codes

The `ingestSource` byte in Memo 1 identifies the producing platform. The byte value MUST be consistent with the `ingestSource` string in the Memo 2 JSON.

| Code | Hex | `ingestSource` string |
|---|---|---|
| 1 | `0x01` | `"fleetfusion"` |
| 2–127 | `0x02`–`0x7F` | Reserved for future SecureFusion-defined platforms |
| 128–255 | `0x80`–`0xFF` | Vendor-specific, requires registration in the public registry |

SecureFusion v1 defines a single value: every anchor emitted by a v1 producer carries source-code byte `0x01` and the JSON string `"fleetfusion"`. Per-upstream-provider distinctions (e.g. which telematics platform fed the underlying event) are not exposed on the public wire format — they remain internal to the producing platform. v2 may extend this enum; implementations adding a new source code SHOULD propose it via the standard's governance process before deployment.

## 7. Verification procedure

To verify a SecureFusion anchor on the XRPL:

1. Fetch the validated transaction by hash from any rippled node. The verifier is given a tx hash; it does not discover anchors (see SPEC §8 for the duplicate-anchor warning path).
2. Confirm `TransactionType == "Payment"` and `Account == Destination == <published SecureFusion source account>`.
3. Confirm the registry entry for that account matches the network of the rippled node (mainnet vs testnet — see SPEC §9).
4. Confirm the transaction's confirmation time is at or before the registry entry's `revokedAt` (if any). Post-revocation transactions MUST be rejected.
5. Locate the three memos by `MemoType`, case-sensitive. Verify the memo set is **exactly** `{SF1.bundle, SF1.event, SF1.sig}`, no duplicates, no extras, no missing entries.
6. Verify each memo's `MemoFormat` matches the table in §1.
7. Decode Memo 1 and parse the binary header. Confirm length is exactly 50 bytes.
8. Decode Memo 2 and parse the canonical JSON; schema-validate against [event-manifest.schema.json](../schema/event-manifest.schema.json).
9. Compute SHA-256 over the canonical bytes of Memo 2's JSON; confirm it matches the `bundleHash` in Memo 1.
10. Confirm the `eventIdGuid` in Memo 1 matches the `eventId` in Memo 2.
11. Confirm `ingestSourceCode` in Memo 1 maps to `ingestSource` in Memo 2 (§6 table).
12. Confirm `channelCount` in Memo 1 equals `channels.length` in Memo 2.
13. Decode Memo 3 (the signature, 64 bytes).
14. Verify the Ed25519 signature against the registry entry's `appPublicKey`, with input being the raw bytes of Memos 1 and 2 concatenated.
15. (Optional) Fetch the candidate video file. Compute SHA-256. Confirm it matches one of the `channels[].sha256` values in the event manifest.

A verification passes only if steps 1–14 succeed.

## 8. Worked example

See [examples/xrpl-transaction.json](../examples/xrpl-transaction.json) for an annotated example, and [conformance/vectors/v1-good-anchor.tx.json](../conformance/vectors/v1-good-anchor.tx.json) for a frozen, byte-stable test vector.

## 9. Future versions

The `SF1` prefix is part of the standard. Future versions of the memo format will use a new prefix (`SF2`, `SF3`, etc.) and may change the binary layout, signature algorithm, or memo count.

Verifiers must look at the `MemoType` prefix to determine which version of the standard to apply. Older anchors using earlier prefixes must remain verifiable against the version of the standard under which they were created — anchors are immutable, but the verification logic for them MUST NOT be removed (long-term verification commitment, SPEC §1.5).
