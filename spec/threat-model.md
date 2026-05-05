# SecureFusion Threat Model

**Version:** SF1
**Status:** v1.0

This document describes what SecureFusion defends against, what it does not defend against, and the assumptions under which its guarantees hold. It is written for security reviewers, implementers, and parties relying on SecureFusion as evidence.

---

## 1. Properties claimed

A SecureFusion-anchored video provides the following cryptographic properties:

1. **Integrity since ingest.** The video file as currently held is byte-identical to the file that was hashed at the moment of ingest into the SecureFusion-compliant platform.
2. **Time anchoring.** The event was anchored to the XRP Ledger no later than the close time of the containing ledger, and to Bitcoin no later than the timestamp of the containing block (via OpenTimestamps).
3. **Origin attestation.** The anchor was produced by an entity holding both the SecureFusion XRPL account key *and* the SecureFusion application Ed25519 key — both held by the operating compliant platform.
4. **Verifiability without platform cooperation.** Any third party can verify properties 1–3 by retrieving the public anchor transactions and a candidate video file, without contacting the originating platform.

## 2. Properties NOT claimed

SecureFusion does not, in v1, provide the following:

1. **Authenticity of capture.** SecureFusion does not prove that the video reflects what was actually in front of the camera at the time of recording. A camera could be deceived (held up to a screen, obscured, etc.) or video could be substituted before reaching the ingest gateway. Solving this requires hardware-signed capture inside the camera itself — a target for a future spec version.
2. **Truthfulness of metadata.** Vehicle ID, ingest source, and other metadata are asserted by the implementing platform, not cryptographically attested by an independent source. A platform could lie about which vehicle produced a given video. This is partially mitigated by per-vehicle pseudonymous identifiers and chain-of-custody auditing, but not eliminated.
3. **Completeness.** SecureFusion does not prove that *all* video from a vehicle is present — only that the video that exists in the SecureFusion ledger has not been modified. Selective deletion of incriminating footage before ingest is undetectable.
4. **Real-time integrity in transit.** The hashing happens at the ingest gateway. Any modification between the camera and the gateway is undetected. This is a property of the network path, not the standard.
5. **Signed registry fetch / transparency log.** v1 ships the registry inside source. There is no Sigstore / Rekor-style attestation. v2 will introduce signed registry per a separate spec; see §3.7 and SPEC §9.

## 3. Threat actors

The standard defends against several distinct adversary classes.

### 3.1 The implementing platform itself

**Capability:** can read and modify any data inside the platform after ingest.

**Defended:** yes, after ingest. Once a hash is anchored on a public chain, the platform cannot modify the file without detection — a verifier comparing the file's hash to the anchor will see the mismatch.

**Not defended:** before ingest. The platform fully controls what gets hashed. An adversarial platform could hash a falsified file and anchor that. Defence: use of multiple platforms, third-party witnessing, or hardware-signed capture. SecureFusion's mitigation is making the public anchor visible — patterns of suspicious behaviour can be detected over time.

### 3.2 Insider with platform access

**Capability:** an employee, contractor, or compromised account with read/write access to the platform's data plane.

**Defended:** yes, post-ingest. The original file is stored in immutable Blob Storage with WORM policies; the hash is anchored on a public chain. An insider cannot alter the file or the anchor without producing a detectable mismatch.

**Not defended:** an insider with access at the moment of first hash could substitute the video before ingestion.

### 3.3 External attacker with infrastructure compromise

**Capability:** has compromised the platform's cloud infrastructure (e.g. Azure subscription).

**Defended:** the attacker cannot retroactively modify anchored files because the public chain anchors are outside the attacker's control. They can disable future anchoring, but past anchors stand.

**Not defended:** an attacker who compromises the SecureFusion XRPL account key or application Ed25519 key can produce new fraudulent anchors. Mitigation: keys held in HSMs, rotation procedures, the public registry of the account address, and the **revocation rule** (§3.7) — any tx confirmed *after* the registry entry's `revokedAt` is rejected.

### 3.4 Adversarial party in litigation or claim

**Capability:** seeks to discredit SecureFusion-anchored evidence to escape liability.

**Defended:** the verification path is fully public and cryptographic. An opposing party can verify a video themselves; they cannot credibly claim it has been altered without producing a counterfactual file with the same hash (a SHA-256 collision, which is not currently feasible).

**Defence in depth:** the dual XRPL + Bitcoin anchor means an adversary would need to dispute both chains' integrity simultaneously.

### 3.5 Adversarial party with the file but not the platform

**Capability:** has a candidate video file (e.g. provided by the fleet) and wants to verify it.

**Defended trivially.** This is the verifier's role and the standard's primary user-facing property. The verifier hashes the file, looks up the hash on chain, retrieves the anchor and signatures, and produces a yes/no answer with full provenance.

### 3.6 Replay / re-anchor adversary

**Capability:** discovers a valid SecureFusion anchor on chain and tries to reuse it (replay) or anchors the same `eventIdGuid` twice (re-anchor) to manufacture confusion in the ledger.

**Defended (replay across accounts):** the registry pins each compliant `appPublicKey` to a specific XRPL account. A replay under a different account fails at signature verification because the Ed25519 public key is per-account.

**Defended (re-anchor under same account):** v1 verifier behaviour:

- The verifier is given a single tx hash and asked to verify it. The verify path itself does NOT scan the ledger.
- After the primary verify succeeds, the verifier MAY perform a best-effort `account_tx` lookup on the rippled host to find other validated txs from the same registry account whose `SF1.bundle.eventIdGuid` is identical.
- If another tx is found, the verifier surfaces a `duplicate-anchor-suspected` warning in the result's `warnings: []` array. **This is a warning, not a failure.** The supplied tx still verifies; the warning lets the consumer decide whether to investigate.
- The lookup is rate-limit-aware and never blocks the primary verify path. If the rippled call fails, the warning is omitted and a separate diagnostic warning is emitted.

This stance is locked at SPEC §8.

### 3.7 Misinformation actor publishing fabricated "verified" video

**Capability:** wants to make an unverified or modified video appear SecureFusion-verified.

**Defended:** the public registry of compliant XRPL anchor accounts is the trust anchor. A claim of SecureFusion verification that does not point to an anchor on a registered account fails. A claim that points to a real anchor but with a different file fails on hash mismatch.

**Mitigations and known limits (v1):**

- The registry is shipped inside the source repository. Trust depends on the repo's commit-signing and code-review controls. **There is no signed-registry fetch and no transparency log in v1** — this is a known limitation, documented prominently in SPEC §9 and in `SECURITY.md`.
- Each registry entry MUST carry `network: "mainnet" | "testnet"` (SPEC §9). The verifier rejects any tx whose ledger family does not match the entry's network with reason code `network-mismatch`.
- Each registry entry MUST carry `revokedAt: <iso8601 | null>` (SPEC §9). Pre-revocation txs remain valid forever (long-term verification, §3.10); post-revocation txs MUST be rejected with reason code `revoked-key`.

### 3.8 Long-term archival adversary

**Capability:** wants to repudiate an anchor years after it was created.

**Defended:** Bitcoin (via OpenTimestamps) provides the strongest long-term archival anchor available. Bitcoin's block history cannot be revised without an attack of unprecedented economic cost. XRPL provides additional confirmation.

**Caveat:** if both XRPL and Bitcoin become unavailable or untrusted in the long term, SecureFusion anchors become unverifiable. This is a risk shared with any cryptographic evidence scheme. The standard's versioning allows future migration to additional anchor chains.

### 3.9 Hash-agility / quantum adversary

**Capability:** breaks SHA-256 (collision search) or Ed25519 (key recovery) at some point in the future.

**Defended (today):** SHA-256 and Ed25519 are widely used standards with no practical attacks known.

**Hash-agility commitment:** v2 of the standard will introduce hash-agility — the on-chain memo set will declare the hash and signature suite, and the verifier will pick the implementation by name. Until then, any v1 anchor implicitly commits to SHA-256 + Ed25519. The Bitcoin anchor in particular continues to provide block-level chain-integrity even if Ed25519 is later weakened — the chain itself is hash-based.

### 3.10 Long-term verification commitment

A v1 verifier MUST keep working against the v1 frozen golden corpus forever. The CI in this repository runs the conformance vectors on every release to enforce this. v2+ verifiers MUST accept v1 manifests indefinitely (SPEC §1.5).

## 4. Trust assumptions

The standard's guarantees hold under the following assumptions. Where any of these is violated, the corresponding guarantee weakens.

### 4.1 Cryptographic assumptions

- SHA-256 remains pre-image and collision resistant.
- Ed25519 signatures are unforgeable without the private key.
- These are standard assumptions; if either fails, most of modern cryptography fails with them. The standard's versioning allows future migration to new primitives.

### 4.2 Operational assumptions

- The implementing platform follows the standard correctly: hashes raw bytes on ingest, before processing.
- Private keys (XRPL account, application Ed25519) are held securely (HSM-backed).
- The published registry of compliant accounts is correct and current.

### 4.3 Chain assumptions

- The XRP Ledger and Bitcoin networks remain operational and accessible.
- The OpenTimestamps service or equivalent calendar service remains available, OR direct Bitcoin anchoring is used.
- Bitcoin's proof-of-work and XRPL's federated consensus are not catastrophically broken.

### 4.4 Verifier assumptions

- The verifier obtains the file independently of the implementing platform (otherwise the platform could substitute the file at the same time it produced the hash).
- The verifier consults the registry to confirm anchor account legitimacy AND to read `network` + `revokedAt`.
- The verifier trusts the rippled URL it queries. v1 has no multi-node cross-check by default; the verifier exposes an option to require N-of-M agreement across multiple rippled URLs.

## 5. Known weaknesses and open questions

### 5.1 Pre-ingest tampering

Until hardware-signed cameras are standard, the gap between camera sensor and ingest gateway is unprotected. Mitigations being explored:

- Per-camera signing keys stored in device secure elements.
- Time-of-capture attestation through GPS-anchored timestamps.
- Multi-channel correlation (footage from multiple angles must be self-consistent).

### 5.2 Selective non-anchoring

A platform could choose not to anchor inconvenient events, leaving them unverifiable. Mitigation: continuous anchoring policies, public commitment to anchoring all events of certain classes, third-party audit of ingestion logs.

### 5.3 Metadata fabrication

Vehicle ID and ingest source are asserted by the producer, not cryptographically tied to ground truth. An adversarial platform could anchor real video with fabricated metadata. Mitigations:

- Per-vehicle pseudonymous identifiers established at vehicle commissioning, with the binding cryptographically attested.
- Cross-correlation with independent telematics signals (CAN bus, GPS).
- These are out of scope for SF1.

### 5.4 Long-term key compromise

If the application Ed25519 key is compromised many years after an anchor, an adversary could produce signatures that *appear* to be SecureFusion-attested. Mitigation: the XRPL transaction itself is timestamped and immutable, and the registry's `revokedAt` field bounds the validity window. A verifier confronted with a signature dated *after* the registry's `revokedAt` rejects with reason code `revoked-key`.

### 5.4.1 Optional Bitcoin proof mode (round-4 D12)

A provider's registry entry declares `bitcoinProofMode` (SPEC §7.2.1, §9). The trust posture varies by mode:

- **`xrpl-sf1ots`** — Tier-3 is verifiable from public chains alone. No FleetFusion (or other issuer) cooperation is required. This is the strongest posture and matches the v1.0 default.
- **`https`** — Tier-3 reduces from "no FleetFusion needed" to **"trust the issuer's HTTPS endpoint"**. The cryptographic verification (OTS + Merkle branch) still runs **locally** on the verifier, so the issuer cannot forge a Bitcoin attestation; but the issuer can refuse to serve, serve stale data, or cause the proof to be unreachable. Tiers 1 + 2 are unchanged.
- **`none`** — Tier-3 is explicitly absent. The verifier MUST surface a clear "Bitcoin attestation not provided by this issuer" message rather than silently passing or omitting the result. Tiers 1 + 2 still hold; the long-term archival guarantee (§3.8) is correspondingly weakened to whatever XRPL alone provides.

The mode is per-issuer, not per-event. An adversary cannot downgrade a single event's mode to escape the Bitcoin tier — the registry entry is shipped with the verifier and changes only via a signed-PR registry update.

### 5.5 Quantum cryptanalysis

Future quantum computers may break Ed25519. Mitigations:

- Bitcoin and XRPL transaction history remains intact under quantum attack on signature schemes (the chain integrity is hash-based).
- A future SF2 will move to post-quantum signature schemes.
- Existing anchors retain integrity for the period before such a break is feasible.

## 6. Reporting issues

Threat model gaps, attack ideas, and counterexamples are welcomed. Please file an issue or, for sensitive disclosures, contact the maintainers privately (see [SECURITY.md](../SECURITY.md)).

The maintainers do not consider any threat too small to discuss. A standard is only as strong as the adversaries it has been honestly tested against.
