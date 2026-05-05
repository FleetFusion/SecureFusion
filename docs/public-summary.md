# SecureFusion

**An open industry standard for tamper-evident video telematics evidence.**

---

## What SecureFusion is

SecureFusion is an open standard for proving that a video captured by a vehicle camera — dashcam, in-cab camera, or MDVR channel — has not been modified between the moment it was ingested and the moment it is shown to an insurer, regulator, court, or member of the public.

It does this by hashing every video as it enters a fleet platform, anchoring those hashes to public blockchains, and exposing a free public verification flow that anyone can use to confirm a file is genuine — without trusting the platform that produced it.

The standard is open. Any telematics provider, camera manufacturer, fleet platform, or insurer can implement it. The point is to give the industry a shared, neutral way to answer one question: *is this video what it claims to be?*

## Why it exists

Video evidence from commercial fleets is increasingly central to:

- Insurance claims and "at-fault" disputes
- Regulatory schemes such as DVSA Earned Recognition
- Coaching and training programmes that affect driver livelihoods
- Civil and criminal proceedings involving road incidents
- Public-interest investigations (cyclist incidents, near-misses, hit-and-run)

Today, the trustworthiness of that video rests entirely on the fleet platform that hosts it. There is no standard, vendor-neutral way to prove a clip is unmodified. An opposing party in a dispute can credibly argue the platform — or someone with access to it — could have altered the file. Courts, insurers, and the public have no independent way to check.

SecureFusion fixes that. It moves the trust anchor from "the platform says so" to "the public blockchain confirms it" — verifiable by anyone, forever, without needing access to the platform.

## How it works

1. **Hash on ingest.** Every video file received from a vehicle camera is hashed (SHA-256) before any processing, transcoding, or modification. Multi-channel events are hashed per channel.
2. **Build a canonical record.** A structured event manifest is produced — vehicle ID, capture time, geo-location, channel hashes, codec details, optional operator notes — and the whole record is itself hashed (the *bundle hash*).
3. **Anchor to public chains.**
   - The bundle hash and full event record are written to the **XRP Ledger** within seconds, using the transaction memo fields. The XRPL anchor gives instant, near-free proof of integrity.
   - Hashes are also batched hourly into a Merkle tree and anchored to **Bitcoin** via OpenTimestamps, providing the long-term, court-defensible trust anchor.
4. **Display the proof.** Compliant video players show a SecureFusion badge with one click access to the on-chain transaction. Operators, drivers, and reviewers can see the evidence is genuine without leaving the platform.
5. **Verify publicly.** Anyone — insurer, lawyer, journalist, court clerk — can drag a video file into the SecureFusion public verification site, hash it locally in their browser, and get an independent answer: this file is in the ledger, anchored on these dates, captured by this fleet. No account required, no platform login, no trust in the originating vendor.

## What makes it a standard, not a feature

For SecureFusion to mean something the same way "SSL" or "PDF/A" or "ISO 9001" mean something, the standard defines:

- **A canonical event manifest schema.** Anyone implementing SecureFusion produces records in the same shape, so any verifier can read any vendor's anchors.
- **A fixed memo format on the XRP Ledger.** Three memos per anchor (`SF1.bundle`, `SF1.event`, `SF1.sig`) with versioned, documented byte layouts. A verifier doesn't need vendor cooperation to read what's on chain.
- **A defined hashing protocol.** SHA-256, byte-stable JSON serialisation, hash-before-processing rule. Identical inputs produce identical hashes regardless of who did the work.
- **A public registry of compliant accounts.** Each implementing vendor publishes their XRPL account address. Verifiers can confirm an anchor came from a real, accountable participant — not an impostor claiming to be SecureFusion.
- **A reference verifier.** Open-source code that anyone can run locally to verify a SecureFusion-anchored video without trusting any vendor's API.
- **A versioning scheme.** `SF1`, `SF2`, etc. — when the standard evolves (per-frame hashing, hardware-signed capture, qualified timestamps), older anchors remain verifiable forever.

## Who it's for

- **Fleet operators** who want their video evidence to carry weight in insurance and legal disputes without depending on their telematics vendor's reputation.
- **Insurers** who want to reduce fraud and accept video evidence faster, because they can verify it themselves.
- **Regulators** (DVSA, traffic commissioners, transport authorities) who need an evidence standard they can rely on across vendors.
- **Camera and telematics vendors** who want their platforms' video output to be portable, trustworthy, and acceptable as evidence regardless of which fleet operator runs them.
- **Drivers** who deserve the right to prove their own footage is genuine — including footage that exonerates them.
- **The public** — vulnerable road users, journalists, families seeking answers — who need a way to verify video that doesn't require trusting a private company.

## Why a public blockchain

Anchoring to a public chain is the only way to make tamper-evidence independent of the vendor. A private ledger run by a fleet platform proves nothing — the platform could rewrite it. A trusted third-party timestamping service is better, but still requires trusting that third party. A public blockchain anchor can be verified by anyone, in any country, decades from now, without anyone's permission or cooperation.

XRP Ledger and Bitcoin are chosen specifically. XRPL provides fast, cheap, predictable confirmation with rich on-chain memo capacity — the operational layer. Bitcoin provides the deepest archival guarantees and the strongest legal precedent — the durable layer. Together they give SecureFusion both immediacy and longevity.

The standard is not blockchain-prescriptive in the long run. As legal frameworks evolve — eIDAS qualified timestamps, hardware-signed capture, post-quantum signatures — the SecureFusion versioning scheme allows new anchor types to be added without invalidating prior anchors.

## What it deliberately doesn't do

- **It doesn't prove the video is true.** A camera can record a misleading scene; SecureFusion only proves the file hasn't been changed since ingest. Authenticity of the *capture* requires hardware signing — a future SecureFusion v2 concern.
- **It doesn't expose private data.** Tenant and driver details stay off chain by default; only hashes and pseudonymous identifiers are public. Fleet operators control what, if anything, is publicly visible per event class.
- **It doesn't lock anyone in.** The standard is open, the verification tools are open source, and the on-chain records are readable without any vendor's cooperation. A fleet operator can switch platforms without losing the evidential weight of their historical video.

## Governance

SecureFusion is intended as an open, community-governed standard. The reference specification, schema, and verifier are published openly. Vendor implementations self-certify against published conformance tests. A neutral steering body — drawn from fleet operators, insurers, telematics vendors, and regulators — oversees versioning and compliance.

The goal is not to favour any single platform. The goal is to give the industry an evidence layer that everyone can trust, no one controls, and no one can compromise.

## Status

SecureFusion v1 is being defined and prototyped through FleetFusion's vehicle media pipeline (FleetLive and FTCloud integrations) in 2026. The reference implementation, conformance tests, and open verifier are planned for public release alongside the first production anchors.

Other telematics platforms, camera vendors, insurers, and regulators are invited to participate in the standard's development.
