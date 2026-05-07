<p align="left">
  <img src="assets/logo.png" alt="SecureFusion" width="420" />
</p>

# SecureFusion

**An open industry standard for tamper-evident video evidence in commercial fleets.**

[![Specification: v1.0](https://img.shields.io/badge/spec-v1.0-brightgreen)](spec/SPEC.md)
[![Spec License: CC BY 4.0](https://img.shields.io/badge/spec%20license-CC%20BY%204.0-blue)](LICENSE-SPEC)
[![Code License: Apache 2.0](https://img.shields.io/badge/code%20license-Apache%202.0-blue)](LICENSE-CODE)
[![Status: Released](https://img.shields.io/badge/status-released-brightgreen)](#status)

---

## What this is

SecureFusion is an open standard that lets anyone (insurer, lawyer, regulator, journalist, family member) independently verify that a video captured by a vehicle camera has not been modified since it was first ingested into a fleet platform.

It does this by hashing every video on ingest and anchoring those hashes to public blockchains. Compliant platforms display a verification badge in their video player; a free public site lets anyone drag in a video file and check it for themselves, without needing to trust the platform that produced it.

The standard is open. Any telematics provider, camera manufacturer, fleet platform, or insurer can implement it.

## Public Verifier (securefusion.org/verify)

The public verifier is a browser-only Angular SPA that lets anyone drag in a SecureFusion-anchored video file and check it against the public ledgers, with no upload, no telemetry, and no FleetFusion API. It produces a three-tier result: **Hash on XRPL** (instant), **Signed by platform key** (Ed25519), **Bitcoin-attested** (via OpenTimestamps).

The verifier is the trust tool for this standard: *audit me, this is open source, every byte hashed*. The full source is in [`web/`](web/), the architecture is described in [spec/SPEC.md §10.2](spec/SPEC.md), and the threat model is in [spec/threat-model.md](spec/threat-model.md). Reproducible builds, Subresource Integrity hashes, a strict Content-Security-Policy allowlist, and a self-hosting path mean nobody, including FleetFusion, has to be trusted blindly.

Hosting is via Azure Static Web Apps; deployment is automated by [`.github/workflows/azure-static-web-apps.yml`](.github/workflows/azure-static-web-apps.yml) and requires the GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN` to be configured on the standalone public repo.

## Player overlay badges

Two ready-made badges sit in [`assets/badges/`](assets/badges/) for use in video players that display SecureFusion-anchored footage. Pick one and overlay it on the player frame, typically top-right, with a recommended overlay width of ~120 px on a 1920×1080 player (scale proportionally; the source PNGs are 1605×372 with transparent backgrounds).

<table>
  <thead>
    <tr><th>Badge</th><th>File</th><th>When to use</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><img src="assets/badges/securefusion.png" alt="SECURE FUSION" width="280" /></td>
      <td><a href="assets/badges/securefusion.png"><code>securefusion.png</code></a></td>
      <td><strong>Branded.</strong> Use when your platform is SecureFusion-compliant and you want the brand to read on the player frame. Display whenever an event has at least Tier&nbsp;1 (XRPL anchor) verified.</td>
    </tr>
    <tr>
      <td><img src="assets/badges/secured-video.png" alt="SECURED VIDEO" width="280" /></td>
      <td><a href="assets/badges/secured-video.png"><code>secured-video.png</code></a></td>
      <td><strong>Generic.</strong> Neutral wording for platforms that prefer not to display the SecureFusion name on the player. Same Tier-1 trigger.</td>
    </tr>
  </tbody>
</table>

The badges are designed to be **clickable**: wire `onClick` to open the public verifier ([securefusion.org/verify](https://securefusion.org/verify)) in a new tab so the viewer can re-check the footage against the public ledgers without trusting the host platform. Both badges follow the SecureFusion brand: navy `#0b2545`, light blue `#1ec1f2`, white interior, padlock + play-button glyphs.

## Why it exists

Video from commercial vehicles is increasingly the deciding factor in:

- Insurance claims and at-fault disputes
- DVSA Earned Recognition and other regulatory schemes
- Driver coaching decisions that affect livelihoods
- Civil and criminal proceedings involving road incidents
- Public-interest investigations after collisions and near-misses

Today the trustworthiness of that video rests entirely on the platform hosting it. There is no neutral way for an outside party to confirm a clip has not been altered. SecureFusion fixes that by moving the trust anchor from "the platform says so" to "the public blockchain confirms it."

## How it works

```
[Vehicle camera]
       │
       ▼
[Ingest gateway]  ──► SHA-256 hash, before any processing
       │
       ▼
[Canonical event manifest]  ──► bundleHash
       │
       ▼
   ┌───┴───┐
   ▼       ▼
[XRPL]   [Bitcoin via OpenTimestamps]
 ~5s         hourly batches
 instant     long-term archival
   │       │
   └───┬───┘
       ▼
[Player badge]   [Public verifier]
                 anyone can verify
                 a file in 5 seconds
```

1. **Hash on ingest.** SHA-256 over the raw bytes of every video, before any transcoding or processing happens.
2. **Build the manifest.** A structured JSON record covering the event (vehicle, time, geo, channel hashes, codec, optional notes), itself hashed to produce the *bundle hash*.
3. **Anchor on chain.** Bundle hash plus the full event record written to the **XRP Ledger** within seconds; the same hashes batched hourly into a Merkle tree and anchored to **Bitcoin** via OpenTimestamps for long-term durability.
4. **Display proof.** Compliant video players show a SecureFusion badge linking to the on-chain transaction.
5. **Verify publicly.** Anyone can drop a video file into the public verifier; the file is hashed locally in their browser, and the hash is checked against the public ledgers.

## Repository layout

```
securefusion/
├── spec/                      ← The standard itself
│   ├── SPEC.md                ← Full v1.0 specification
│   ├── memo-format.md         ← XRPL transaction memo format
│   ├── manifest-format.md     ← Canonical event manifest format
│   └── threat-model.md        ← What SecureFusion does and doesn't defend against
├── schema/                    ← Machine-readable schemas
│   ├── event-manifest.schema.json
│   └── memo-bundle.schema.json
├── examples/                  ← Worked examples for implementers
│   ├── single-channel-event.json
│   ├── four-channel-event.json
│   ├── test-vectors.json      ← Known-good bundleHashes
│   └── xrpl-transaction.json
├── reference-verifier/        ← Open-source reference verifier (Node.js)
│   ├── src/
│   ├── tests/
│   └── README.md
├── web/                       ← Public verifier SPA (Angular, browser-only)
│   ├── src/
│   ├── staticwebapp.config.json
│   └── README.md
├── samples/                   ← Sample anchor producers in five languages
│   ├── csharp/                ← .NET 8 / C#
│   ├── python/                ← Python 3.10+
│   ├── java/                  ← Java 17+
│   ├── go/                    ← Go 1.21+
│   ├── typescript/            ← Node.js 20+ / TypeScript
│   └── README.md
├── conformance/               ← Conformance test suite
│   └── README.md
├── docs/                      ← Background, FAQs, governance
│   ├── faq.md
│   ├── press-release.md
│   └── public-summary.md
├── .github/                   ← Issue templates and CI
├── README.md                  ← This file
├── CHANGELOG.md
├── GOVERNANCE.md              ← How decisions get made
├── CONTRIBUTING.md            ← How to contribute
├── SECURITY.md                ← Vulnerability reporting
├── LICENSE-SPEC               ← CC BY 4.0 (the standard)
└── LICENSE-CODE               ← Apache 2.0 (the verifier and tools)
```

## Status

SecureFusion **v1.0** is released. The specification, schemas, reference verifier, and conformance vectors are stable and intended for production use. The first commercial implementation is shipping in FleetFusion's vehicle media pipeline.

We are seeking input from:

- Telematics platforms and camera manufacturers interested in implementing the standard
- Insurers and claims handlers who want to verify SecureFusion-anchored video
- Regulators (DVSA, traffic commissioners, transport authorities) who may benefit from a vendor-neutral evidence standard
- Fleet operators with views on what evidence integrity should look like
- Independent security researchers willing to review the spec and threat model

Please [open an issue](../../issues) or read [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick links

- [Full specification (v1.0)](spec/SPEC.md)
- [Public summary](docs/public-summary.md): non-technical introduction
- [FAQ](docs/faq.md)
- [Governance](GOVERNANCE.md)
- [Public verifier SPA (browser)](web/README.md): securefusion.org/verify
- [Reference verifier (Node.js)](reference-verifier/README.md)
- [Sample implementations](samples/README.md): C#, Python, Java, Go, TypeScript
- [Conformance tests](conformance/README.md)

## Licensing

SecureFusion uses two licences:

- **The specification** (everything in `spec/`, `schema/`, `examples/`, and `docs/`) is licensed under [Creative Commons Attribution 4.0](LICENSE-SPEC). You can implement it, redistribute it, and build on it freely, including commercially.
- **The reference verifier and other code** (everything in `reference-verifier/` and `conformance/`) is licensed under [Apache 2.0](LICENSE-CODE).

This split is deliberate: the standard should be free for anyone to implement; the code is permissively licensed for production use.

## What this isn't

SecureFusion is not a product, a platform, or a blockchain. It does not collect anyone's video, run any servers, or hold anyone's data. It is a specification: a set of agreed conventions that, if followed, make video evidence verifiable by anyone.

The first commercial implementation is being built by FleetFusion. We hope it won't be the last.

## Contact

- Issues and discussion: GitHub
- Standard governance: see [GOVERNANCE.md](GOVERNANCE.md)
- Press and partnerships: info@fleetfusion.ai

---

*"The trust anchor for video evidence should not be the company that sells the platform."*
