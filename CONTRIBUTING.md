# Contributing to SecureFusion

Thank you for your interest in SecureFusion. The standard improves through review, criticism, and implementation experience, and all contributions are welcome.

## Ways to contribute

There are several ways to help, depending on your background:

**If you are a security researcher or cryptographer:**
Review the [threat model](spec/threat-model.md) and [specification](spec/SPEC.md). File issues for any attack we have not considered, any guarantee we are over-claiming, or any cryptographic choice you would make differently.

**If you are an implementer (telematics platform, camera vendor, fleet platform):**
Try implementing the standard. Tell us what is unclear, ambiguous, or impractical. Implementation experience is the most valuable input we can receive.

**If you are an insurer, regulator, or fleet operator:**
Tell us what evidence integrity needs to look like in practice for the standard to be usable in your work. Specific case examples are particularly valuable.

**If you are a lawyer:**
Review the spec for evidential weight. Where does it fall short of what a court would want? What additional protections would meaningfully improve admissibility?

**If you are a developer:**
The reference verifier ([reference-verifier/](reference-verifier/)) is open for code contributions, additional language ports, and conformance test additions.

## How to contribute

### Filing issues

Open an issue for:

- Specification ambiguities or errors
- Threat model gaps
- Implementation concerns
- Schema or example improvements
- Reference verifier bugs
- Suggested standard extensions

For issues touching the specification, please reference the relevant section number.

### Pull requests

For changes to:

- **The specification.** Please file an issue first to discuss before submitting a PR. Specification changes affect every implementer and need broader review.
- **Schemas, examples, and documentation.** Direct PRs are welcome.
- **The reference verifier.** Direct PRs welcome. Please add tests and ensure existing tests pass.

All contributions to the specification will be made available under [CC BY 4.0](LICENSE-SPEC). All code contributions will be made available under [Apache 2.0](LICENSE-CODE). By submitting a contribution, you confirm that you have the right to make this contribution under these terms.

### Commit messages

Use clear, descriptive commit messages. For specification changes, prefix with `spec:`. For verifier changes, prefix with `verifier:`. For schema changes, prefix with `schema:`. Examples:

```
spec: clarify hash-before-processing requirement in §5.2
verifier: handle zero-byte channel files
schema: add optional driverId pseudonym field
docs: fix typo in FAQ
```

## Code of conduct

We expect contributors to behave professionally. Disagreement is welcome; personal attacks are not. Critique the work, not the person.

The maintainers reserve the right to remove comments, close issues, and ban contributors who consistently violate this principle.

## Specification change process

Material changes to the specification go through the following stages:

1. **Issue.** The proposed change is discussed in a GitHub issue. Anyone can open one.
2. **Draft PR.** Once direction is agreed, a draft PR is opened. Specification version is bumped (e.g. `v1.0` → `v1.1-draft`).
3. **Review period.** Minimum two weeks for community review.
4. **Adoption.** If no blocking objections from maintainers, the change is merged and the version is finalised.
5. **Backwards compatibility.** Every accepted change is reviewed for impact on existing anchors. Breaking changes require a major version bump (e.g. `SF1` → `SF2` memo prefix).

The full process is documented in [GOVERNANCE.md](GOVERNANCE.md).

## Reference verifier

The reference verifier is the canonical implementation against which all other implementations should be checked. Changes to the verifier follow standard open-source review:

- File an issue or open a PR.
- Add tests covering the change.
- Ensure CI passes (`npm test` from `reference-verifier/`).
- A maintainer will review.

## Discussion

For broader discussion that doesn't fit an issue or PR, use [GitHub Discussions](../../discussions). Topics such as long-term roadmap, governance evolution, and standard adoption belong there.

## Recognition

Contributors are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md) (created on first acceptance). Acknowledgement is automatic for any merged contribution; opt out by mentioning so in your PR.

## Questions

If anything in this guide is unclear, file an issue. The maintainers will respond and improve the guide based on your question.
