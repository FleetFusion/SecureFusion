# Frontend / Build Dev — Report

Branch: `main` (standalone), mirrored into FleetFusion monorepo at
`docs/securefusion-repo/securefusion/web/`.
Date: 2026-05-04.

## Task status

| ID  | Status | Notes |
|-----|--------|-------|
| F.1 | DONE   | `optimization.styles.inlineCritical: false` added under prod config in `angular.json`. Build emits a plain synchronous `<link rel="stylesheet" href="styles-XXX.css">` — no `media="print"`, no `onload=`. |
| F.2 | DONE   | `serve:prod` script added: `npm run build && npx serve -s -l 4321 dist/web/browser`. |
| F.3 | DONE   | XRPL transport is HTTPS-only via `fetch()` (`web/src/app/core/xrpl.ts`). NO change required to `connect-src`. See finding below. |
| F.4 | DONE   | New Playwright spec `web/e2e/styles.spec.ts` listens for `securitypolicyviolation`, asserts zero violations, and asserts computed body bg is non-default. |
| F.5 | DONE   | Smoke test: `dist/web/browser/index.html` clean (grep for `onload\|media="print"` returned no matches). `styles-DJSVM37S.css` is 17,276 bytes. |
| F.6 | DONE   | Mirrored to monorepo: same edits to `angular.json`, `package.json`, and new `e2e/styles.spec.ts`. (Standalone is the source of truth; verification gate run only against standalone.) |
| F.7 | DONE   | All three gates pass on the standalone (see test counts below). |
| F.8 | PENDING| Two commits to be created — one per repo. Hashes to be appended after the commits land. |

## F.3 — `connect-src` finding

Read `D:/Projects/SecureFusion/web/src/app/core/xrpl.ts` end-to-end. Both
public entry points (`fetchTransaction` and `accountTx`) call the global
`fetch()` against an `https://...` URL with `redirect: 'manual'` — no
WebSocket, no `wss://`, no use of the `xrpl-client` library. Default
endpoint is `https://xrplcluster.com`; `SettingsService` rejects any
non-HTTPS rippled URL up-front (this is asserted by an existing e2e test
in `verify.spec.ts`).

**Conclusion:** the existing `connect-src 'self' https://*.xrpl.org
https://*.ripple.com https://xrplcluster.com
https://*.calendar.opentimestamps.org` is correct for Phase B.
`staticwebapp.config.json` was NOT modified.

If the verifier ever migrates to a websocket-based rippled client, the
allowlist will need `wss://*.xrpl.org wss://*.ripple.com
wss://xrplcluster.com` added. Tracked here so the next implementer sees
the rule.

## Test counts before / after

| Suite       | Before | After |
|-------------|--------|-------|
| Karma unit  | 184    | 184   |
| Playwright  | 6      | 7     |

Unit tests: 184/184 SUCCESS in `ChromeHeadlessCI`.
Playwright: 7 passed in 6.0s — `verify.spec.ts` (6) + new
`styles.spec.ts` (1).

## Commit hashes

To be appended after F.8.

- Standalone (`D:/Projects/SecureFusion`) on branch `main`:
  `<hash-standalone>`
- Monorepo (`D:/Development/Dev-New`) on branch `Blockchain`:
  `<hash-monorepo>`

## Judgement calls

1. **Did NOT touch `staticwebapp.config.json`.** F.3's investigation
   confirmed XRPL transport is HTTPS-only. Architect §3 explicitly says
   "Otherwise leave untouched" — followed.
2. **Placed the new Playwright test in a separate file
   (`e2e/styles.spec.ts`)** rather than appending to `verify.spec.ts`.
   Reason: the new test exercises `/` (landing page), uses
   `addInitScript` to install a CSP-violation listener before the page
   loads, and is conceptually orthogonal to verifier-page assertions.
   `verify.spec.ts` runs `await page.goto('/verify')` in `beforeEach`,
   which would interfere. Architect's `e2e/landing.spec.ts (new or extend
   existing)` left the choice open; new file is cleaner.
3. **Kept the `optimization.scripts: true` and `optimization.fonts:
   true`** in the new block even though their default IS already `true`
   under prod. Reason: leaving the object explicit makes the `styles`
   override self-documenting. Net behaviour unchanged from default
   except for `inlineCritical: false`.
4. **Did NOT mirror `_team/` markdown files into the monorepo.** The
   architect plan §6 calls standalone the source of truth, and these are
   working/coordination docs not shipping artefacts. Avoided polluting
   the FleetFusion monorepo's git history with team coordination notes.
5. **Noted but did NOT act on** the design dev's addition of
   `@fontsource/inter` and `@fontsource/jetbrains-mono` dependencies in
   `package.json`. That falls under cross-cutting item §4.1 (self-hosted
   fonts — preferred path, zero CSP impact). No `connect-src` /
   `font-src` changes needed.

## Acceptance evidence

```
$ grep -E 'onload|media="print"' dist/web/browser/index.html
(no matches)

$ ls -la dist/web/browser/styles-*.css
-rw-r--r-- 1 m_red 197609 17276 May  5 05:40 styles-DJSVM37S.css

$ npm test -- --watch=false --browsers=ChromeHeadlessCI
TOTAL: 184 SUCCESS

$ npx playwright test
7 passed (6.0s)
```
