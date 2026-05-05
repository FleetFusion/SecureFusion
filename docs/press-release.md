# FOR IMMEDIATE RELEASE

## FleetFusion launches SecureFusion: an open industry standard for tamper-evident video evidence in commercial fleets

**Public blockchain anchoring brings independent, vendor-neutral verification to dashcam footage, protecting fleets, drivers, insurers, and the public.**

**LONDON, UK, [DATE]:** FleetFusion today announced the launch of **SecureFusion**, an open industry standard that allows video evidence captured by commercial vehicle cameras to be cryptographically verified as unmodified by anyone, at any time, without trusting the platform that produced it.

SecureFusion addresses a long-standing weakness in fleet video evidence: today, the trustworthiness of any dashcam clip rests entirely on the platform that hosts it. There is no standard, vendor-neutral way for an insurer, regulator, court, or member of the public to confirm that a video has not been altered. SecureFusion solves this by anchoring a cryptographic fingerprint of every video to public blockchains the moment it is ingested, making tampering detectable by any independent party, anywhere in the world.

"Fleet video is increasingly the deciding factor in insurance claims, regulatory cases, and court proceedings," said **Matt [Surname], Founder of FleetFusion**. "Yet there has been no neutral way for anyone outside the platform to confirm a clip hasn't been touched. SecureFusion changes that. It moves the trust anchor from 'the vendor says so' to 'the public blockchain confirms it', and we're releasing it as an open standard precisely because evidence integrity should never be the property of a single company."

### How SecureFusion works

When a vehicle camera delivers a video to a SecureFusion-compliant platform, the file is hashed using SHA-256 before any processing. A canonical event record (capturing the vehicle, time, location, channel hashes, and other metadata) is then anchored to two public blockchains:

- **The XRP Ledger** provides instant, low-cost confirmation within seconds of capture, with the full event record written directly into the transaction itself.
- **Bitcoin**, via the OpenTimestamps protocol, provides a long-term, court-defensible archival anchor with the deepest legal precedent of any public chain.

Compliant video players display a SecureFusion badge, allowing operators to see at a glance that a clip is verified. A free public verification site lets anyone (insurer, lawyer, journalist, family member) drop a video file into their browser and confirm independently whether it is genuine. The file never leaves their machine; only its hash is checked against the public ledger.

### Why an open standard

SecureFusion is being released openly so that any telematics provider, camera manufacturer, fleet platform, or insurer can implement it. The specification, schema, transaction format, and reference verifier are published for public scrutiny.

"This only works if it's open," said Matt. "A blockchain feature owned by one vendor is a marketing claim. A standard the whole industry implements, that anyone can verify without permission, is something a court can rely on. We'd rather have ten platforms implementing SecureFusion than one platform owning it."

The standard is governed through a neutral, community-led process drawing on input from fleet operators, insurers, telematics vendors, and regulators. Versioning ensures that as the standard evolves to incorporate hardware-signed capture, qualified timestamps, or post-quantum signatures, historical anchors remain verifiable indefinitely.

### Who benefits

- **Fleet operators** gain video evidence that carries weight in disputes regardless of which platform produced it, eliminating vendor lock-in around evidential value.
- **Insurers** can verify clips themselves, reducing fraud, accelerating claims, and lowering investigation costs.
- **Drivers** gain the right to prove that exonerating footage is genuine, addressing a long-standing imbalance in incident disputes.
- **Regulators** including DVSA and traffic commissioners gain a vendor-neutral evidence standard suitable for compliance schemes such as Earned Recognition.
- **The public** (vulnerable road users, journalists, families seeking answers) gain a way to verify fleet video without depending on the cooperation of any private company.

### What SecureFusion does not claim

The standard is deliberate about its scope. SecureFusion proves that a video file has not been modified since ingest into a compliant platform. It does not, in v1, prove authenticity of the original capture itself; that requires hardware-level signing inside the camera, a feature targeted for a future version of the standard. SecureFusion also does not expose driver or vehicle private data; only cryptographic hashes and pseudonymous identifiers are written to public chains.

### Reference implementation and availability

FleetFusion is delivering the first reference implementation of SecureFusion through its FleetLive and FTCloud vehicle media pipelines, with public anchors expected to begin in [QUARTER YEAR]. The specification, conformance tests, and open-source reference verifier will be published alongside.

Other telematics platforms, camera manufacturers, insurers, fleet operators, and regulators interested in participating in the development of the standard are invited to make contact.

---

### About FleetFusion

FleetFusion is a UK-based fleet telematics and safety platform serving commercial vehicle operators across the United Kingdom. Built on modern cloud infrastructure and integrated with leading telematics ecosystems including Geotab, FleetFusion provides fleet activity monitoring, driver safety analytics, video telematics, and a growing portfolio of safety and compliance tools. The company is headquartered in [LOCATION].

For more information, visit [WEBSITE].

### Media contact

[NAME]
[ROLE]
[EMAIL]
[PHONE]

---

*Note to editors: A technical specification of the SecureFusion standard, including the canonical event manifest schema, XRP Ledger transaction format, and reference verifier, is available on request. Demonstrations of independent verification can be arranged.*

###
