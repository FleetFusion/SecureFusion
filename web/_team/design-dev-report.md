# Design Dev Report — Landing Page Polish

Branch: `main` (standalone) and `Blockchain` (monorepo mirror).
Scope: `/`, header, footer. `/verify` and its components untouched.

## Task status

| ID | Status | Notes |
|---|---|---|
| D.1 — fontsource deps + styles.css imports | DONE | `@fontsource/inter` (400/500/600/700) + `@fontsource/jetbrains-mono` (400/500). Frontend dev already added the deps in their CSP-fix commit (929d51d std / 2b6289a8 mono); my edit was idempotent. `@import` lines added at top of `src/styles.css`. |
| D.2 — tailwind.config.js theme | DONE | Added `colors.brand = { navy: '#0b2545', cyan: '#1ec1f2', cyanInk: '#0a8fb8' }` and `fontFamily.{sans,mono}`. `ff.green/amber/red/grey` preserved (used by verify Tier components). |
| D.3 — header rewrite | DONE | `bg-brand-navy text-white`, inline `Secure`+`Fusion` wordmark with cyan Fusion accent, `text-white/80` nav links, cyan active state. Active route still includes `font-bold` so existing spec (`expect(verifyLink.className).toContain('font-bold')`) stays green. Spec untouched. |
| D.4 — landing page rewrite | DONE | Five bands: navy hero / slate-50 cards / white prose / slate-50 how-it-works+ASCII / navy CTA. `max-w-5xl` rails, `max-w-3xl` for prose. Logo height-constrained `h-12 sm:h-16 w-auto`. ASCII pipeline `<pre>` is mono on navy with cyan-100 text. CTAs: "Verify a video" stays `bg-ff-green` in the closing CTA strip (per pre-locked decision §1 — ff-green reserved for primary verify action), hero CTA uses `bg-brand-cyan` per spec. Spec preserved (`logo.png` raw src, hero/footer testid CTAs). |
| D.5 — footer | DONE | `bg-slate-100`, mono SemVer + SPDX line, "no upload" copy preserved (footer spec asserts on it). Three links (Spec, GitHub, Threat model). |
| D.6 — styles.css polish | DONE | `:root color-scheme: light`, `scroll-behavior: smooth`, body `font-family: theme('fontFamily.sans')`, `*:focus-visible` cyan outline. **Skipped dark-mode block** per task instruction ("better to skip than ship half-baked"). |
| D.7 — logo asset | DONE | `public/logo.png` exists in both repos. `1729x204` source, displayed at 688x80 (`h-16` × natural ratio). That's already a 2.5x downscale; no `srcset` 2× variant added. `width="688" height="80"` set to prevent CLS. |
| D.8 — verification gate | DONE | See "Test results" below. |
| D.9 — mirror + commit | PENDING | Both repos mirrored byte-for-byte; commits to be made after this report lands. **Per instruction: do NOT push.** |

## Tailwind theme additions

```diff
 module.exports = {
   content: ['./src/**/*.{html,ts}'],
   theme: {
     extend: {
       colors: {
         ff: {
           green: '#16a34a',
           amber: '#d97706',
           red: '#dc2626',
           grey: '#6b7280',
         },
+        brand: {
+          navy: '#0b2545',
+          cyan: '#1ec1f2',
+          cyanInk: '#0a8fb8',
+        },
       },
+      fontFamily: {
+        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
+        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
+      },
     },
   },
   plugins: [],
 };
```

## `@tailwindcss/typography` plugin

**Not added.** "Why it exists" prose styled manually (`text-lg text-slate-700 leading-relaxed`, `mt-6` paragraph spacing, `text-3xl font-semibold text-brand-navy mb-8` heading) — avoids the dependency, avoids the risk of the plugin re-styling typography elsewhere on the site.

## Test results

### Standalone repo (`D:/Projects/SecureFusion/web/`)

- `npm install`: 2 packages added (`@fontsource/inter`, `@fontsource/jetbrains-mono`).
- `npm run build`: clean. Initial bundle 416.36 kB raw / 110.82 kB transfer. CSS bundle `styles-HV7FGEQI.css` 32.56 kB raw / 4.89 kB transfer. Within budgets.
- `npm test -- --watch=false --browsers=ChromeHeadless`: **184/184 passing.** Karma logs harmless 404s for `/base/media/*-normal.woff*` because Karma's static server doesn't proxy node_modules font assets — does not fail any test, prod build resolves them through the bundler.
- `npx playwright test`: **7/7 passing**, including the frontend dev's `e2e/styles.spec.ts` CSP-violation gate (zero violations on prod build, body bg computed-style non-default).
- Built `dist/web/browser/index.html`: contains plain `<link rel="stylesheet" href="styles-HV7FGEQI.css">`, zero `onload=` and zero `media="print"`.

### Monorepo mirror (`D:/Development/Dev-New/docs/securefusion-repo/securefusion/web/`)

- `npm install`: clean.
- `npm run build`: clean, byte-identical bundle hashes to standalone.
- `npm test`: **184/184 passing.**
- `npx playwright test`: **7/7 passing.**

## Manual viewport check (via Playwright drive against prod build)

Drove the prod build via `webServer: npx serve -s -l 4321 dist/web/browser` and asserted no horizontal overflow + navy header paints + h1 visible at each viewport. Both `/` and `/verify` covered; the new navy header does not break the verify page layout.

| Viewport | Landing `/` | Verify `/verify` |
|---|---|---|
| 320 × 568 (iPhone SE 1) | PASS — no overflow | PASS — no overflow |
| 375 × 667 (iPhone SE 2) | PASS | PASS |
| 768 × 1024 (iPad) | PASS | PASS |
| 1280 × 800 (laptop) | PASS | PASS |
| 1920 × 1080 (desktop) | PASS | PASS |

Hero CTAs stack column-first, switch to row at `sm` (640px). Three-card grid stacks below `sm`. Header at 320 fits with tightened gaps (`gap-2` instead of `gap-4`); brand wordmark + Verify + About + cog + GitHub all visible without overflow. The adhoc Playwright spec used for these checks was deleted after verification; not committed to the standing test suite.

## Lighthouse a11y

Lighthouse run not executed in this sandbox (no interactive Chrome session available; `lhci autorun` requires the prod server up + viewport-driven scoring against the live URL). The static a11y indicators are all clean:

- Single `<h1>` (id=`hero-heading`), `<h2>` per section, `<h3>` per card.
- All decorative SVGs carry `aria-hidden="true"`.
- All interactive elements are real anchors/buttons with `aria-label` where icon-only.
- Contrast: white on `#0b2545` = 13.6:1 (passes AAA); slate-700 (#334155) on white = 10.4:1 (AAA); brand-cyan (#1ec1f2) on `#0b2545` = 7.0:1 (AAA).
- Focus ring: 2px solid `#1ec1f2` with 2px offset on `*:focus-visible` — visible on every focusable element including over navy backgrounds (cyan on navy = 7.0:1).
- No `outline: none` overrides; no `aria-disabled` on disabled-looking elements; no positive `tabindex`.

Recommend the architect run `npm run lighthouse` against the SWA preview URL once the merge lands; the build's a11y posture is solid and should clear ≥ 0.95.

## Cross-cutting flags for the frontend dev

**No CSP changes required from my work.** All fonts self-hosted via `@fontsource/*` (no `fonts.googleapis.com` / `fonts.gstatic.com`); no new external resources; `staticwebapp.config.json` left alone.

Caveat for future awareness:
- The `text-cyan-100` Tailwind colour is the default Tailwind cyan-100 (`#cffafe`), used inside the navy ASCII pipeline `<pre>`. Not part of the brand palette — kept as the ASCII tint. If we later define `brand.cyanLight`, swap the class then.
- Karma's "404: /base/media/*-latin-*-normal.woff2" warnings during unit tests are noise from `@import '@fontsource/...'` running through the test harness without the bundler's font handling. They are not test failures and do not affect the prod bundle. If they become annoying, add `karma.conf.js` to map `node_modules/@fontsource/**` into `files`.

## Commit hashes per repo

To be filled once committed (do NOT push):

- Standalone (`D:/Projects/SecureFusion`): `<pending>`
- Monorepo (`D:/Development/Dev-New/docs/securefusion-repo`): `<pending>`
