# SecureFusion Governance

This document describes how decisions about the SecureFusion standard are made, who makes them, and how the structure is intended to evolve.

## Principles

1. **The standard belongs to the industry, not to any one company.** No single vendor — including FleetFusion, the originating implementer — should be able to dictate the standard's direction against the broader interest of implementers and users.
2. **Decisions are made transparently and in public.** All standard-affecting discussion happens in GitHub issues, pull requests, and discussions. Private decisions are not binding on the standard.
3. **Implementation experience outweighs theoretical preference.** A vendor who has shipped a working implementation has more weight in resolving an ambiguity than one who has not.
4. **Backwards compatibility is preserved by default.** Existing on-chain anchors must remain verifiable indefinitely. Breaking changes require a major version increment.
5. **The standard is documented for outsiders.** A new participant should be able to read the spec, understand the threat model, and form their own view without needing private context.

## Current stage: bootstrapping (2026)

SecureFusion is in its bootstrapping phase. During this period:

- The originating maintainer (FleetFusion, currently represented by Matt) holds editorial control over the specification.
- All changes are nonetheless made openly via the public repository.
- Other contributors are actively recruited from across the industry.
- The intent is to graduate to the steering body model below as soon as a viable group exists.

## Target structure: steering body

Once SecureFusion has at least three independent implementations and active interest from non-vendor stakeholders, governance moves to a multi-party steering body with the following composition:

- **Implementer seats** (telematics platforms, camera vendors, fleet platforms) — at least three, no more than 50% of total seats.
- **User seats** (fleet operators, large user representatives) — at least two.
- **Independent seats** (insurers, regulators, security researchers, road safety bodies) — at least two.
- **Maintainer seat** — the active editor of the reference specification, ex officio.

Seats are held by named individuals, not by their employers. If an individual changes employer, they retain their seat unless this creates an undue concentration (e.g. two seats moving to the same company).

The body meets at least quarterly, in public, with minutes published to the repository.

## Decision making

### Day-to-day decisions

Editorial improvements, schema clarifications, example additions, and documentation changes are merged by maintainers based on standard pull request review. No formal vote is required.

### Material specification changes

A change is "material" if it:

- Changes the on-chain memo format
- Changes the manifest schema in a non-backwards-compatible way
- Adds, removes, or modifies a required field
- Changes the hashing algorithm
- Changes the supported anchor chains
- Affects the conformance criteria

Material changes require:

1. Public discussion via GitHub issue.
2. Draft pull request with the proposed change.
3. Minimum two-week review period (longer for larger changes).
4. Resolution: during bootstrapping, by the maintainer; after steering body formation, by simple majority of the body.
5. No outstanding blocking objection from a maintainer or steering body member.

### Major version increments

A new major version (e.g. `SF1` → `SF2`) is required for any change that:

- Breaks existing on-chain anchor compatibility
- Changes the cryptographic primitive set in a non-additive way
- Materially changes the trust model

Major version increments require steering body supermajority (≥ 2/3) once that body exists.

### Disputes

If a dispute cannot be resolved through normal discussion:

- During bootstrapping: the maintainer makes a final call, with reasoning published in the repository.
- After steering body formation: the body votes; tied votes default to no change.

## Conformance

A claim of "SecureFusion compliance" requires passing the published conformance suite (see [conformance/](conformance/)). The maintainers / steering body do not gatekeep implementation. Any vendor whose implementation passes the conformance tests is entitled to describe their product as SecureFusion-compliant.

A public registry of self-certified implementers will be maintained, listing:

- The implementing organisation
- Their published XRPL anchor account address
- The version of the standard they implement
- The date of self-certification
- Optional: third-party audit details

The registry is informational. Inclusion is a courtesy and may be revoked if an implementer is found to be misrepresenting compliance.

## Trade marks

The "SecureFusion" name and any associated logos are not part of the open specification. Their use is governed separately:

- Use to describe a compliant implementation: encouraged, no permission required.
- Use to describe a non-compliant or partially-compliant implementation as "SecureFusion": not permitted.
- Use as a product or company name by another party: requires consultation with the trade mark holder.

The trade mark holder during the bootstrapping phase is FleetFusion. Transfer of the trade mark to a neutral steering body or non-profit entity is anticipated once that body exists and is appropriate to hold it.

## Funding

SecureFusion development is currently unfunded community work, with implementation and reference verifier development sponsored by FleetFusion as part of its product investment.

If the standard reaches a scale where independent funding is appropriate (e.g. for paid maintainer time, conformance test infrastructure, or independent audits), funding decisions will be made transparently by the steering body. No funding source will be permitted to direct the technical content of the standard.

## Amendment

This governance document may be amended through the same process as the specification — open discussion, pull request, review period, and steering body decision. Amendment proposals affecting decision-making power require a longer (four-week) review period.

## Final note

This is a young standard. The governance framework is intentionally lightweight and explicitly anticipates evolution. If a structure described here turns out to be poorly chosen, fixing it openly is preferred to working around it privately.
