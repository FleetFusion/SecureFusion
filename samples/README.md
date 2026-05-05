# SecureFusion Sample Implementations

This directory contains sample implementations of the **SecureFusion anchor producer** in five languages, with **runnable submission examples for both anchoring tiers** (XRP Ledger instant-tier and Bitcoin via OpenTimestamps durable-tier).

The canonical reference verifier (Node.js) lives in [`../reference-verifier/`](../reference-verifier/). These samples are **producers** — code that an implementing platform runs at video ingest time. Verifiers can be implemented in any language by following the same patterns in reverse.

| Language | Anchor builder | Submit to XRPL | Submit to Bitcoin (OTS) |
|---|---|---|---|
| **C# / .NET 8** | [`csharp/Program.cs`](csharp/Program.cs) | [`csharp/submit_xrpl/`](csharp/submit_xrpl/) | [`csharp/submit_bitcoin/`](csharp/submit_bitcoin/) |
| **Python 3.10+** | [`python/securefusion_anchor.py`](python/securefusion_anchor.py) | [`python/submit_xrpl.py`](python/submit_xrpl.py) | [`python/submit_bitcoin.py`](python/submit_bitcoin.py) |
| **Java 17+** | [`java/SecureFusionAnchor.java`](java/SecureFusionAnchor.java) | [`java/submit_xrpl/`](java/submit_xrpl/) | [`java/submit_bitcoin/`](java/submit_bitcoin/) |
| **Go 1.21+** | [`go/anchor.go`](go/anchor.go) | [`go/submit_xrpl/`](go/submit_xrpl/) | [`go/submit_bitcoin/`](go/submit_bitcoin/) |
| **TypeScript / Node 20+** | [`typescript/anchor.ts`](typescript/anchor.ts) | [`typescript/submit_xrpl.ts`](typescript/submit_xrpl.ts) | [`typescript/submit_bitcoin.ts`](typescript/submit_bitcoin.ts) |

Each language directory has its own README with build/run instructions and library recommendations.

## What every sample does

The anchor builder in each language implements the same three steps:

1. **Build a canonical event manifest** — a JSON object matching the SecureFusion event manifest schema, populated with the video's bytes-as-received SHA-256 hashes per channel.
2. **Compute the `bundleHash`** — SHA-256 over the canonical (RFC 8785-style) JSON serialisation of the manifest.
3. **Build the three SecureFusion memos** for the XRPL transaction:
   - `SF1.bundle` — 50-byte binary header (bundleHash + eventId UUID + source + channel count)
   - `SF1.event` — UTF-8 JSON of the canonical manifest
   - `SF1.sig` — Ed25519 signature over `SF1.bundle || SF1.event` using the SecureFusion application signing key

The submission examples then take that output and:

- **XRPL submission** — wraps the three memos in a self-pay 1-drop `Payment` transaction and submits it via the language's idiomatic XRPL library (`xrpl-py`, `Xrpl.NET`, `xrpl4j`, `xrpl-go`, `xrpl.js`). The active library calls are commented out so each sample builds without the dependency — implementers uncomment after `pip install` / `npm install` / etc.
- **OpenTimestamps submission** — POSTs the bundleHash to multiple OpenTimestamps calendar servers via plain HTTP and saves a partial `.ots` proof file. No third-party library is required in any language for this step. Production code should call the calendars' upgrade API later (typically ~1 hour later) to attach the Bitcoin block commitment.

## Conformance: same input, same hash

Every anchor builder is verified to produce the same `bundleHash` for the published example manifests:

| Manifest | Expected `bundleHash` |
|---|---|
| `examples/single-channel-event.json` | `e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05` |
| `examples/four-channel-event.json` | `8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb` |

If your implementation of canonical JSON produces a different hash, either your serialisation is non-conformant or a sample has drifted — please file an issue.

The Python, Java, Go, and TypeScript samples have been verified against these vectors during development. The C# sample was verified by manual review against the same canonicalisation algorithm.

## Why two anchoring tiers

SecureFusion uses a two-tier anchoring strategy because the two networks have complementary properties:

- **XRP Ledger (instant tier)** — 3-5 second finality, predictable cost (~$0.0000139 per transaction), supports rich memos. Anchors arrive at the ledger before a video has even finished uploading. This is what verifiers query in the common case.
- **Bitcoin via OpenTimestamps (durable tier)** — free, anchored hourly to the most secure and longest-running blockchain. The strongest evidentiary precedent of any cryptocurrency network. This is what an evidentiary expert witness can rely on years from now.

The submission examples show both because real production deployments do both — typically the XRPL anchor goes out within seconds of video ingest, and the OTS submission happens shortly after. The two anchor records are stored alongside the video in the SecureFusion ledger.

See [spec/SPEC.md §7](../spec/SPEC.md) for the full architecture.

## Architecture pattern

```
                     ┌──────────────────────┐
[video ingest]       │  build manifest      │
       │             │  - per-channel       │
       │             │    SHA-256           │
       ▼             │  - event metadata    │
[your code]  ──────► │  - operator notes    │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │  canonicalise + hash │
                     │  → bundleHash        │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │  build three memos   │
                     │  + Ed25519 sign      │
                     └──────────┬───────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
   ┌──────────────────────┐            ┌──────────────────────┐
   │  submit XRPL Payment │            │  submit hash to      │
   │  ~5 second finality  │            │  OpenTimestamps      │
   │  (instant tier)      │            │  ~1 hour to Bitcoin  │
   └──────────────────────┘            │  (durable tier)      │
                                       └──────────────────────┘
```

## Required cryptography

| Primitive | Purpose | Per-language source |
|---|---|---|
| SHA-256 | File and manifest hashing | Standard library in every language |
| Ed25519 | Application signing key (for `SF1.sig`) | C#: `NSec.Cryptography` or BC; Python: `cryptography` or `PyNaCl`; Java: JDK 15+ EdDSA or `BouncyCastle`; Go: `crypto/ed25519`; TS: Node `crypto` |
| Hex/UTF-8 | Memo encoding | Standard library |

No exotic primitives. No proprietary cryptography. Auditable by anyone with a passing knowledge of standard public-key signing.

## Ed25519 application key — operational notes

The application key is **separate** from the XRP Ledger account key:

- The XRPL account key signs the *transaction wrapper* (handled by the XRPL library).
- The application key signs the *memo payload* (handled by the sample code, in the `SF1.sig` memo).

This separation is deliberate: the application key can survive XRPL key rotation, and gives verifiers a second independent attestation. Hold the application key in a hardware-backed keystore (HSM, Azure Key Vault Managed HSM, AWS CloudHSM, GCP Cloud KMS, or platform-native equivalent). The samples here load the key from an environment variable for clarity; production code MUST NOT do this.

## Producing more languages

If you build SecureFusion in another language (Rust, Kotlin, Swift, PHP, Ruby, Elixir...), please contribute it back. The contract is small:

1. Match the published `bundleHash` test vectors.
2. Produce the three memos in the documented hex/format.
3. Sign correctly with Ed25519.
4. Optionally include submission examples for both tiers, matching the layout used by the existing samples.

A pull request adding a new language directory under `samples/` is welcomed. See [../CONTRIBUTING.md](../CONTRIBUTING.md).
