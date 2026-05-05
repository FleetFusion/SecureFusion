# Devil's Advocate — Risk Register

Adversarial review of the CSP fix + landing-page polish. Inspected: `staticwebapp.config.json`, `angular.json`, `tailwind.config.js`, `src/index.html`, `src/app/pages/landing/landing.page.ts`, `src/app/components/header/header.component.ts`, `public/logo.png` (1729x204 PNG, RGBA).

## 1. CSP fix collateral

The current header is `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ...`. The diagnosis "style-src blocks the link" is **wrong**: `style-src 'unsafe-inline'` is already present. The real blocker is the inline event handler `onload="this.media='all'"`, which is governed by **`script-src`** (CSP3 inline-event-handler rule). So:

- Disabling `inlineCritical` in angular.json removes the async pattern but Angular's optimiser also emits a `<style>` block for critical CSS — that's already permitted by `style-src 'unsafe-inline'`. Fine.
- **Do not** add `'unsafe-inline'` to `script-src` as a "quick fix" — that re-opens XSS surface and undoes the only meaningful script policy you have.
- `connect-src 'self' https://*.xrpl.org https://*.ripple.com https://xrplcluster.com https://*.calendar.opentimestamps.org` — XRPL websocket (`wss://`) is **not** covered by `https://*.xrpl.org`. If WS is used, add `wss://*.xrpl.org`. Verify the actual transport in `core/`.
- `img-src 'self' data:` — fine for the wordmark, but blocks any future blob-thumbnail (`blob:`) the verifier may render. Watch for this when adding video preview frames.
- `font-src 'self'` — **hard block** on Google Fonts. See §4.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` — duplicated; harmless but noisy.
- `form-action 'none'` — there are no `<form>` elements today, but if the design dev adds a newsletter or contact form, submission silently fails.
- `base-uri 'self'` — fine. `<base href="/" />` in index.html is same-origin.
- Service workers / web workers: none registered today, but if added, `worker-src` defaults to `script-src` — would inherit `'self'` correctly, no inline workers though.
- Future Angular optimisations to watch: **font inlining** (`@angular/build` will emit `<style>@font-face{src:url(data:...)}</style>` — covered). **SRI hashes** on script tags — fine. **Speculation rules** (`<script type="speculationrules">`) — would be blocked by `script-src 'self'`; needs `'inline-speculation-rules'` if used.

## 2. Build vs runtime divergence

184 unit tests + 6 e2e green while prod is broken-by-stylesheet is a category failure. Karma uses the dev build (no optimisation, sync `<link>`); Playwright's `playwright.config.ts` likely points at `ng serve` or an unoptimised build. **Neither exercises the production bundle behind the production CSP.**

Required gates:
- E2E target must be `ng build --configuration production` served by a static file server that **also injects `staticwebapp.config.json` headers** (use `swa start ./dist/web --swa-config-location .`). This is the only configuration that catches CSP violations.
- Lighthouse CI (`lighthouserc.json` exists — verify it asserts `"unused-css-rules"` and `"render-blocking-resources"`). Add a Playwright assertion: `expect(page.evaluateHandle(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')` — i.e. confirm CSS actually applied.
- Add a single CSP-smoke test: navigate to `/`, listen for `securitypolicyviolation` events, assert zero. This is the ONE test that would have caught it.

## 3. Logo + image hazards

`public/logo.png` is 1729x204 RGBA (8.5:1). Currently rendered at `max-w-md` (~448 CSS px) — that's a 3.86x downscale on 1x screens, ~1.93x on 2x. Browsers handle 2x downscale well; 1x downscale of a thin wordmark is where you see fringe artefacts on diagonal strokes.

**Decision: insist on SVG.** A wordmark is text + simple shapes — SVG will be 2-5 KB, infinitely scalable, theme-able via `currentColor`, no `srcset` ceremony. The only reason to keep PNG is if the wordmark contains a raster gradient or photographic element (it doesn't, per the SecureFusion brand). Acceptable fallback: PNG @ 2x intrinsic (840x100, ~12 KB) with `width="420" height="100"` — but SVG is strictly better.

Badge PNGs (1605x372, 450 KB each) — keep them out of the SPA bundle. They live in player-overlay docs and should stay there. If the design dev embeds them as social-card hero, they will eat the 1 MB initial budget in `angular.json`.

## 4. Typography

Position: **system font stack, no web font.** Reasoning:
- `font-src 'self'` means Google Fonts requires a CSP edit (allowlist `fonts.gstatic.com`) AND `style-src` would need `https://fonts.googleapis.com` (currently only `'self' 'unsafe-inline'`). Two CSP relaxations for aesthetic gain.
- Self-hosted Inter adds 80-120 KB woff2 (multiple weights) + FOUT/FOIT handling + `font-display: swap` discipline. For a 5-section landing page, this is overkill.
- system-ui is "brittle" only if you mistake its job. The SecureFusion brand is **the wordmark logo**, not the body font. Body type is functional. `font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` (Tailwind's default `font-sans`) is already in use implicitly and looks correct on every target OS.
- If the design dev pushes back: defer Inter to a v2 polish pass with a measured Lighthouse comparison. Do not let "feels more polished" override "ships smaller and passes CSP unchanged".

## 5. Responsive breakpoints — failure modes

The landing page was scaffolded without a responsive pass. Test at:
- **320x568** (iPhone SE 1st gen, smallest realistic target): h1 "Tamper-evident video evidence for commercial fleets" — 7 words at `text-3xl` (30 px). At 320 px wide with `px-4` padding (288 px content), this **will** wrap to 4 lines and may overflow if `tracking-tight` pushes a long word past container. Failure: horizontal scrollbar.
- **375x667** (iPhone SE 2/3): hero CTAs `flex-col sm:flex-row` — `sm` is 640 px, so they stack here. Should be fine.
- **414x896** (iPhone XR/11): same as 375.
- **640x...** (Tailwind `sm` breakpoint exact): CTA row flips to horizontal — verify the two buttons fit. They will, just.
- **768x1024** (iPad): three-card grid is `sm:grid-cols-3`, so cards go to 3-col at 640. At 768 with `max-w-5xl` (none on the article — actually no max-w on the article element, **bug**), cards stretch full width. Add `max-w-5xl mx-auto` to the `<article>` or expect ridiculous line lengths on 1440+.
- **1280** and **1920**: prose paragraphs have no `max-w-prose`. "Why it exists" text will run 100+ characters per line on 1920. Readability failure.

Header at 320: "SecureFusion" + "Verify" + "About" + cog + Octocat = 5 elements with `gap-4`. **Will overflow.** Either hide nav links behind a hamburger below `sm`, or reduce header to wordmark + cog at `<sm`.

## 6. The polished trap — hard limits

**Banned without explicit sign-off:**
- No CSS animations beyond `transition-colors` on hover/focus. No `@keyframes`. No scroll-triggered reveals (IntersectionObserver + transforms is the tell of AI-generic).
- No gradients on backgrounds or text. `bg-gradient-to-*` is forbidden. SecureFusion is a standards body; gradients read as SaaS marketing.
- No drop shadows beyond `shadow-sm` (already used). No `shadow-2xl`, no coloured shadows.
- No hero illustrations, no abstract SVG mesh, no "blockchain visualisation" graphics. The pipeline ASCII diagram in `<pre>` is the visual; keep it.
- No custom fonts (see §4).
- No dark mode in this pass — adds variant testing surface for zero user-visible value pre-launch.
- No emoji icons. Use the existing inline SVGs (cog, Octocat) pattern.
- No "as seen in" logo strip, no testimonials, no metrics counters. Nothing exists to count yet.

The Stripe/Cloudflare/Linear comparison is misleading: those sites earn polish through **restraint and typography**, not effects. Match the restraint, skip the effects.

## 7. Verifier UX integrity — bound the scope

**Hard scope: landing page (`/`), header, footer only.** Exclusions:
- `/verify` — 184 tests pass; touching it risks regressions in drop-zone, hashing-progress, manifest-detail, result-tiers, scan-progress, verify-independently. Each component has spec coverage tied to current markup classes.
- `/about` — out of scope unless landing-page changes propagate naturally (e.g. shared header).
- `settings` slide-over — DO NOT touch.

If the design dev wants `/verify` polish, that's a separate PR after the landing-page PR merges and the test suite re-greens against the new CSP-fixed prod build. Sequencing matters: prove the build pipeline is sound before changing more surface.

## 8. Custom domain timing

`securefusion.org` and `verify.fleetfusion.ai` are both in flight. Risks at cutover:
- **Mixed content**: any hardcoded `http://` in source would break under HTTPS at the custom domain. The `lemon-mud-...` URL is already HTTPS, so this should already manifest — but verify there are no env-conditional `http://` paths (XRPL test endpoints sometimes default to HTTP).
- **Origin-bound storage**: localStorage / IndexedDB are origin-scoped. Users who used the test URL keep zero state at the new domain — fine, but flag if any "preferred verifier" persistence exists.
- **CSP `connect-src`**: all current entries are third-party. No `'self'` API calls cross-origin issue. Good.
- **HSTS preload**: the header sets `max-age=63072000; includeSubDomains; preload` — once `securefusion.org` is hit by a browser, **all subdomains are HTTPS-locked for 2 years**. If anyone planned an HTTP-only subdomain (staging, internal), it's now broken. Confirm intent before first prod hit.
- **CAA records** at the registrar: must permit Azure's CA (DigiCert) or the SWA-managed cert provisioning fails silently.
- **`form-action 'none'`** + future OAuth/login on a custom domain: blocks any redirect-based auth flow. Not relevant today; flag for v2.
- **Cookies**: none set today. Stays clean.

Cutover order: deploy CSS fix to existing test URL → verify → propagate DNS → re-verify on new domain → only then announce. Do not flip DNS and CSS in the same window.

## DA checks I will run on the implementers' diff

1. Run `Grep` for `http://` under `web/src/` excluding test fixtures — must return **zero** non-localhost hits.
2. Build prod (`ng build`) and serve with `swa start dist/web --swa-config-location .`. Open Chrome DevTools → Console; refresh `/` and `/verify`. **Zero CSP violations.**
3. In the same prod build, confirm the `<link rel="stylesheet">` in `dist/web/index.html` does **not** carry `media="print" onload="..."`. Either no `media` attribute, or a separate `<noscript>` fallback.
4. Resize Chrome to **320x568**, navigate to `/` — no horizontal scrollbar; hero CTAs stack; header does not overflow.
5. Resize to **1920x1080**, navigate to `/` — paragraph line length under ~75 characters (visual check + `max-w-prose` or equivalent in the diff).
6. Run `npx playwright test` against the prod build — all 6 e2e green; if any test was modified, justify in commit message.
7. Run `npm run test -- --watch=false` — all 184 unit tests green; component snapshot/class assertions still pass after Tailwind class edits.
8. Inspect `dist/web/` size — total `*.css` under 25 KB gzipped; total initial JS under the existing 1 MB warning budget in `angular.json`.
9. Lighthouse run on prod build: Performance ≥ 95, Accessibility ≥ 95, Best Practices ≥ 95. Specifically check **render-blocking-resources** is empty and **unused-css-rules** is under 5 KB.
10. Diff `staticwebapp.config.json` — if CSP changed, every directive change is justified in the PR body. Reject any addition of `'unsafe-inline'` to `script-src` or wildcard hosts.
11. Inspect `public/` — if `logo.png` was replaced by `logo.svg`, confirm the SVG references no external resources (no `<image href="http...">`) and `<img src="logo.svg">` everywhere it was previously `logo.png`.
12. Confirm `/verify` page DOM is byte-identical to pre-PR (excluding header/footer) — `git diff src/app/pages/verify/` should be empty or whitespace-only.
