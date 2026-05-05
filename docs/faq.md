# SecureFusion: Frequently Asked Questions

## General

### What is SecureFusion?

An open standard that lets anyone verify a video captured by a vehicle camera has not been modified since it was first ingested into a fleet platform. The verification works without needing access to the platform that produced the video.

### Who is it for?

Insurance companies, regulators, fleet operators, drivers, lawyers, journalists: anyone who has reason to look at fleet video and wants to confirm it is genuine. It is also for telematics platforms and camera vendors who want their video evidence to carry weight in disputes regardless of which fleet operator runs them.

### Is this a product?

No. SecureFusion is a specification: a set of conventions that, if followed by a fleet platform, make their video evidence verifiable. The reference verifier and conformance tools are open source. The first commercial implementation is being built into FleetFusion's vehicle media pipeline.

### Why "open"?

Evidence integrity should not be the property of a single company. A blockchain feature owned by one vendor is a marketing claim. A standard that any vendor can implement, and that anyone can verify without permission, is something a court can rely on.

## Technical

### What's anchored on chain?

A SHA-256 hash of the original video file (per channel), plus a structured record of the event (vehicle, time, location, channel hashes). The hash is what gives tamper-evidence; the event record provides context. Drivers and tenants are referenced pseudonymously, so no personal data goes on chain.

### Why two blockchains?

XRP Ledger gives instant confirmation (3–5 seconds) and rich on-chain memo capacity, used as the operational layer. Bitcoin via OpenTimestamps gives the strongest long-term archival anchor and the most established legal precedent. Together they provide both immediacy and durability.

### Why not just timestamp it?

A trusted-third-party timestamp service requires trusting that third party. A public blockchain anchor can be verified by anyone, in any country, decades from now, without anyone's cooperation. That property is what makes the evidence robust against an adversarial party in litigation.

### What if the camera is lying?

SecureFusion v1 proves the file has not been changed since ingest into the platform. It does not prove the camera was capturing reality at the time. Hardware-signed cameras (where the camera itself signs each video at the sensor) close this gap; that is the goal of a future SecureFusion v2.

### What hashing algorithm?

SHA-256, applied to the raw bytes of the video file before any processing or transcoding. Per channel for multi-channel events, plus an overall `bundleHash` over the canonical event manifest.

### How much does it cost to run?

At a fleet of 10,000 vehicles producing 200,000 events per day, on-chain anchor costs are around £70 per month. At smaller scales, pence per month. The Bitcoin tier is free via OpenTimestamps. Cost is not a barrier to adoption.

### What if XRPL or Bitcoin disappears?

The standard supports versioning so future SecureFusion versions can move to additional or different chains. Existing anchors retain whatever integrity their original chain provided. Bitcoin in particular has the strongest long-term archival outlook of any digital signature system currently available.

## Verification

### How does someone verify a video?

They drag the video file into the public verification site. The file is hashed locally in their browser (it never leaves their machine). The hash is checked against the public ledger. If it matches, they see the on-chain anchor details: when, by which platform, with what event metadata.

### Do I need a SecureFusion account to verify?

No. Verification is free, public, and requires no account or permission. That is the point.

### Can I verify offline?

Yes, given a copy of the relevant XRPL transaction and Bitcoin block headers. The reference verifier can be run against a local archive node. Most users will use the public hosted verifier, but the option to verify entirely without trusting any service is a deliberate property of the standard.

### What if a file fails verification?

Three possibilities, in order of likelihood:
1. The file has been modified since ingest (compression, re-encoding, trimming).
2. The file was never ingested through a SecureFusion-compliant platform.
3. There is a bug in the verifier or implementation. File an issue.

A failed verification is not by itself proof of fraud; it is proof that the file is no longer the file that was anchored.

## Privacy

### Does my fleet's data go on a public blockchain?

Only cryptographic hashes and pseudonymous identifiers. No video content, no driver names, no full addresses, no personal data. Tenant IDs on chain are opaque strings; mapping those to human-readable names is done off chain through controlled APIs.

### Can a competitor see my anchor pattern?

They can see that a particular SecureFusion XRPL account anchored a certain number of events at certain times. They cannot see what was in those events, who drove the vehicle, or what location was captured. If even the anchor count is sensitive, the standard's batching mode (Merkle aggregation) can hide individual event volumes.

### What about GDPR?

Personal data does not go on chain. Driver IDs, tenant IDs, and vehicle IDs on chain are pseudonymous identifiers, meaningless without the off-chain mapping table held by the implementing platform under normal data protection controls. A subject access request is fulfilled by the platform; the on-chain anchor is unaffected. Right-to-erasure applies to the off-chain personal data; the cryptographic hash on chain is not personal data.

## Adoption

### My telematics platform doesn't support SecureFusion. What can I do?

Ask them to. The specification is open and the reference verifier is open source. Implementation is straightforward; most of the work is in the ingest pipeline, not in cryptography.

### I'm a camera manufacturer. How do I integrate?

The most direct path is to expose a hash of each captured file (or, better, a per-segment hash) at the point of writing to storage, ideally signed by a per-device key. A SecureFusion-compliant platform consuming your camera's output can then anchor that hash directly. Hardware-signed capture is a future SecureFusion v2 target, and we welcome conversations.

### I'm an insurer. How do I rely on SecureFusion-anchored video?

Run the reference verifier against the file before accepting it as evidence. The verifier's output gives you the chain of trust: which platform anchored it, when, and against what cryptographic commitments. For high-stakes claims, you may want to commission an independent audit of the implementing platform's ingest controls.

### I'm a regulator. How does this fit with frameworks like DVSA Earned Recognition?

SecureFusion is a vendor-neutral evidence standard. It can sit underneath any compliance scheme that relies on dashcam or in-cab video. Adoption requires no change to the regulatory framework itself, only confidence that video tendered as evidence is genuine. We are happy to engage on conformance and assurance questions.

## Governance and contribution

### Who runs the standard?

During the bootstrapping phase, FleetFusion (as the originating implementer) acts as editorial maintainer. The intent is to graduate to a multi-party steering body, drawn from implementers, users, and independent stakeholders, once the standard has multiple implementations. See [GOVERNANCE.md](../GOVERNANCE.md).

### How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md). Implementation experience, security review, schema critique, and additional language ports of the verifier are all welcomed.

### How do I report a security issue?

For non-sensitive issues, open a GitHub issue. For issues that should not be public until fixed, contact the maintainers privately; see [SECURITY.md](../SECURITY.md) (forthcoming).

### Can I use the SecureFusion name?

Yes, to describe a compliant implementation of the standard. No, to describe non-compliant software. See the trade marks section in [GOVERNANCE.md](../GOVERNANCE.md).
