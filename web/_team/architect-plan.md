# SecureFusion SPA Recovery — Architect Plan

**Branch / repo:** standalone `D:/Projects/SecureFusion/web/`, pushes to `https://github.com/FleetFusion/SecureFusion`
**Live (broken):** `https://lemon-mud-0597a2003.7.azurestaticapps.net/`

---

## 1. Pipeline fix decision — confirm Option 1

**Decision:** disable critical-CSS inlining in `angular.json` prod config. Add `"optimization": { "styles": { "inlineCritical": false }, "fonts": true, "scripts": true }` under `configurations.production`. CSP stays exactly as it is (`script-src 'self'`, no `'unsafe-hashes'`, no per-build hash drift).

**Rationale:** the bundle is ~17 KB compressed CSS for a verifier landing site — there is no LCP race worth defending. Option 2 (`'unsafe-hashes'` + SHA-256) breaks every time Angular's optimizer reformats the onload handler and weakens CSP for one perf microoptimisation. Option 3 has the same runtime effect as Option 1 but goes through a less-documented config path. Option 1 is the boring, audit-friendly choice insurers and lawyers expect on a verification-of-record site.

**Trade-off:** ~30–80 ms later first paint on cold cache. Documented in the risk register; acceptable.

## 2. Visual design direction — Standards-org with Stripe restraint

**Pick:** white/light-grey background, navy `#0b2545` header bar that paints first (also serves as a CSP-failure canary — if the navy header is missing, styles didn't load). Generous whitespace and Inter for body, JetBrains Mono for hash strings/transaction IDs and the existing pipeline `<pre>` block. Cyan `#1ec1f2` reserved for accent (links on dark, key icons, focus rings on cyan-bg areas). `ff-green` stays for the "Verify a video" CTA and verifier-success badges only — never decorative.

**Why:** the audience (insurance adjusters, road-safety lawyers, journalists, fleet IT) needs to read this site as a technical specification body — IETF/W3C/OpenTimestamps, not a SaaS landing page. The Stripe restraint (typographic hierarchy, no illustrations, no gradient hero blob) keeps it credible while staying warm enough that a fleet manager doesn't bounce.

## 3. Task split

### Frontend / Build dev — owns CSP, build pipeline, smoke

| File | Change | Acceptance |
|---|---|---|
| `angular.json` | Add `optimization.styles.inlineCritical: false` to `configurations.production`. Keep `outputHashing: "all"` and existing budgets. | `npm run build` succeeds; built `index.html` contains a normal `<link rel="stylesheet" href="styles-XXX.css">` with no `media="print"` and no `onload=` attribute. |
| `web/staticwebapp.config.json` | No change for the bug fix itself. If design dev requests Google Fonts, extend `font-src 'self' https://fonts.gstatic.com` and `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`. Otherwise leave untouched. | Diff against current line 16 shows either zero changes or only the two scoped additions above; nothing else weakened. |
| `package.json` (scripts) | Add `serve:prod` script: `npm run build && npx serve -s -l 4321 dist/web/browser`. | `npm run serve:prod` paints the styled landing page locally with no console errors. |
| Smoke test | After build, run `npm run serve:prod`, open Chrome devtools Network + Console. | `styles-*.css` returns 200 `text/css`; zero `Refused to execute inline event handler` CSP violations; zero `Refused to load font` violations. |
| `e2e/landing.spec.ts` (new or extend existing) | Add a Playwright assertion: `expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')` — proves Tailwind classes resolved. | `npx playwright test` passes including the new check. |

### Design dev — owns visuals

| File | Change | Acceptance |
|---|---|---|
| `tailwind.config.js` | Extend theme: `colors.brand = { navy: '#0b2545', cyan: '#1ec1f2', cyanInk: '#0a8fb8' }`. Add `fontFamily.sans: ['Inter', 'system-ui', ...]` and `fontFamily.mono: ['JetBrains Mono', 'ui-monospace', ...]`. Add `maxWidth.prose-lg` if needed. Do not remove `ff.green/amber/red/grey`. | Existing `ff-green` references still resolve; new `bg-brand-navy` etc. compile. |
| `src/index.html` | Body class becomes `bg-white text-slate-900 antialiased font-sans`. If using Google Fonts, add `<link rel="preconnect">` + stylesheet — and flag to frontend dev for CSP. | Lighthouse a11y ≥ 0.95; Lighthouse perf no regression > 5 points. |
| `src/app/components/header/header.component.ts` | Replace host class with `block w-full bg-brand-navy text-white`. Use a small inline SVG mark + wordmark text instead of the wordmark PNG. Nav links: white/80 with cyan hover/active. Cog and GitHub icons recoloured to white. Active route: cyan underline, not bold green. | Header paints navy on first frame; meets 4.5:1 contrast (white on `#0b2545` = 13.6:1, passes). |
| `src/app/pages/landing/landing.page.ts` | Hero: replace full-width PNG with `<img src="logo.png" srcset="logo.png 1729w" class="h-16 w-auto sm:h-20 max-w-full" width="688" height="80" alt="SecureFusion">` — height-constrained, never full-width. Wrap article in `<div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">`. Hero h1: `text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-brand-navy`. Sub: `text-lg text-slate-600 max-w-2xl`. Three cards: keep grid, swap to `border-slate-200 bg-white p-6` with a small cyan icon strip on top. Pipeline `<pre>`: `bg-brand-navy text-cyan-100 font-mono`. Footer CTA section: navy bg, white text, cyan accents. | At 320/768/1280 px, no horizontal scroll; logo never wider than 320 px on mobile, 480 px on desktop; h1 visible above fold at 1280×800. |
| `src/app/components/footer/footer.component.ts` | Light grey footer with mono SecureFusion / version / SPDX line, links to spec/GitHub/roadmap. | Renders below all pages; passes a11y. |
| `src/styles.css` | After `@tailwind utilities`, add a `:focus-visible` ring rule using `theme(colors.brand.cyan)` and a `prefers-color-scheme: dark` block that inverts only the body bg/text — keep the navy header navy in both. | Dark-mode browser test: text readable, no white-on-white, navy header unchanged. |

## 4. Cross-cutting items (design ↔ frontend)

1. **Google Fonts:** if Inter/JetBrains Mono come from `fonts.googleapis.com`, design dev tells frontend dev *before* committing. Frontend dev extends `font-src` and `style-src` in `staticwebapp.config.json` in the same PR. Otherwise self-host via `@fontsource/inter` + `@fontsource/jetbrains-mono` (preferred — zero CSP impact, zero external request).
2. **Logo asset:** if design dev replaces `logo.png` with an SVG, frontend dev confirms the SWA `mimeTypes` map serves `.svg` correctly and `img-src 'self' data:` still covers it (it does).
3. **`anyComponentStyle` budget (4 KB warn / 8 KB error):** design dev keeps inline component styles small; if the landing page tips over, frontend dev raises the budget rather than designer fragmenting files.
4. **`outputHashing: "all"`:** design dev must not hard-code any `styles-*.css` filename in tests; use computed-style assertions only.
5. **`inlineCritical: false`:** design dev must not reintroduce a "flash of unstyled content" hack on top — the synchronous `<link>` is the design contract.

## 5. Test matrix (gate before push)

- `npm run build` — clean, zero warnings beyond expected budget warnings.
- `npm test -- --watch=false` — 184/184 unit pass.
- `npx playwright test` — 6/6 e2e pass, including new Tailwind-applied assertion.
- `npm run serve:prod` then Chrome devtools: zero CSP console errors; `styles-*.css` 200 `text/css`; navy header on first paint.
- Manual viewports: 320, 768, 1280, 1920 — no horizontal scroll, logo never overflows, h1 wraps cleanly.
- `prefers-color-scheme: dark` toggle — readable, no contrast regression.
- Lighthouse (mobile + desktop): a11y ≥ 0.95, perf ≥ 0.85, best-practices ≥ 0.95, no console errors.
- Keyboard-only walk: tab from top, every interactive element has a visible cyan focus ring; settings cog opens panel; Esc closes; focus returns to cog.

## 6. Sequence and synchronisation

1. **Frontend dev ships first.** Lands `inlineCritical: false` + `serve:prod` script + smoke test. Pushes to a `fix/csp-styles` branch and confirms styles paint in the deployed preview. **This BLOCKS the design dev's "verify polished in browser" step** — design dev cannot judge visuals against a build that doesn't load styles.
2. **Design dev rebases on `fix/csp-styles`** (or merges it in) and lands the visual rewrite as `feat/landing-polish`.
3. Architect (me) reviews each PR independently against the checks below.
4. Both PRs merge into `main`; SWA preview deploy verified before pushing to `securefusion.org`.

## 7. Risk register

1. **`inlineCritical: false` adds 30–80 ms LCP.** Acceptable; document in PR description; revisit only if Lighthouse perf < 0.85.
2. **Google Fonts external request.** Self-host via `@fontsource/*` instead — no CSP change, no third-party DNS, no GDPR question from the legal audience.
3. **Logo at full natural size = pixelation risk on retina.** Use SVG if available; otherwise constrain by `h-16` not `w-`, keep `width`/`height` HTML attrs to prevent CLS, and ship a 2× PNG via `srcset`.
4. **Heading hierarchy / a11y regression during visual rewrite.** Single `<h1>` per page, `<h2>` for sections, `<h3>` for cards — exactly as the current `landing.page.ts` already does. Design dev must preserve.
5. **CSP `style-src 'unsafe-inline'`.** Already present (line 16 of `staticwebapp.config.json`) because Angular component styles inline a `<style>` block. Keep it; do not let a future "tighten CSP" PR remove it without first migrating to `styleUrls`.

## What I'll verify when each dev hands me a diff

1. Run `npm run build` against the diff; confirm built `dist/web/browser/index.html` contains a plain `<link rel="stylesheet">` for the styles bundle and zero `onload=` attributes anywhere in the file.
2. `npx serve -s -l 4321 dist/web/browser`, open in Chrome incognito, devtools Network tab: confirm `styles-*.css` returns 200 with `Content-Type: text/css` and the page paints with the navy header on first paint.
3. Devtools Console: confirm zero entries matching `Refused to execute inline event handler` or `Refused to apply style` or `Refused to load the font`.
4. `curl -I https://<preview-url>/` and grep the `Content-Security-Policy` header: confirm `script-src 'self'` (no `'unsafe-hashes'`, no `'unsafe-inline'`); `font-src` either `'self'` only, or `'self' https://fonts.gstatic.com` if and only if the design PR uses Google Fonts.
5. Resize browser to 320 px width — confirm logo height ≤ 64 px, no horizontal scroll, h1 wraps without overflow.
6. Tab through the page from URL bar — confirm every link/button shows a visible cyan focus ring; tab order matches visual order.
7. `npm test -- --watch=false` — 184/184 pass; if the design dev added DOM-class assertions, they don't pin to hashed filenames.
8. `npx playwright test` — 6/6 pass; verify the new "Tailwind applied" assertion is actually exercising computed style, not just element presence.
9. Lighthouse mobile run on the preview URL — a11y ≥ 0.95, no new "buttons without accessible name" or "contrast" findings.
10. Diff `staticwebapp.config.json` line-by-line against `main`: confirm the only changes (if any) are the scoped `font-src`/`style-src` additions agreed in cross-cutting item 1; nothing else weakened, nothing else moved.
