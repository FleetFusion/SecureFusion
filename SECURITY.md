# Security Policy

## Reporting a vulnerability

The SecureFusion standard, the reference verifier, and the surrounding tooling all benefit from independent security review. If you find a vulnerability or weakness:

- **For non-sensitive issues** (specification ambiguities, edge cases, threat model gaps that do not enable an active attack), open a regular GitHub issue.
- **For sensitive issues** (active vulnerabilities in the reference verifier, key management weaknesses in compliant implementations, attacks that could be used to forge or invalidate anchors), please contact the maintainers privately before public disclosure.

Private contact channel: see contact details in [README.md](README.md). A dedicated security mailbox will be added once the steering body forms.

We aim to acknowledge sensitive reports within 5 working days and respond with an initial assessment within 15 working days.

## Disclosure

Once a vulnerability has been confirmed and a fix is in place, we will:

1. Publish a security advisory describing the issue.
2. Credit the reporter (unless they prefer otherwise).
3. Update affected versions.
4. Where appropriate, contact known compliant implementers directly.

## Scope

In scope:

- The published specification, schema, and memo formats
- The reference verifier code and dependencies
- The conformance test suite
- The published registry mechanism

Out of scope (these are the responsibility of compliant implementers):

- Vulnerabilities in any specific commercial implementation of SecureFusion
- Operational security of any implementer's key management
- Cloud infrastructure security of any implementer

If you find an issue with a specific commercial implementation, please contact that vendor's security team. We will assist in coordinating between vendors and reporters where useful.

## Threat model

See [spec/threat-model.md](spec/threat-model.md) for the standard's full threat model and known limitations. New attack categories or refinements to the model are particularly welcomed.

## Public verifier (verify.fleetfusion.app)

The public verifier SPA is part of this repository (`web/`) and is therefore in scope for this policy. A few implementation details that are useful to know when reviewing or reporting:

- **Open source.** The full source is at `web/` in this repository (canonical mirror: github.com/FleetFusion/SecureFusion). What runs at verify.fleetfusion.app is built from this code — see [`web/README.md`](web/README.md) for the reproducible build procedure.
- **Network allowlist via CSP.** The browser is only allowed to connect to a fixed set of hosts (XRPL public clusters and OpenTimestamps calendars), enforced by the `connect-src` directive in [`web/staticwebapp.config.json`](web/staticwebapp.config.json). Extending this allowlist requires a pull request and is reviewable in `git log`. The verifier cannot exfiltrate anything to a third party, even if the JavaScript were compromised.
- **Trust anchors are git-tracked.** The list of public keys whose signatures the verifier accepts lives at `web/src/assets/trust-anchors/registry.json`. If you suspect tampering, run `git log web/src/assets/trust-anchors/` to see every change. Adding a trust anchor requires PR review and a maintainer countersign.
- **No telemetry, no ads, no third-party JavaScript.** The verifier ships zero analytics, zero advertising, and zero scripts loaded from third-party origins. The bundle is built from the dependencies declared in `web/package.json`, all hosted from the same origin.
- **Frame protection.** `X-Frame-Options: DENY` and `frame-ancestors 'none'` block the verifier from being embedded in a hostile iframe — a partial mitigation against trust-confusion attacks where another site might try to surface a fake verification result.
