import { test, expect } from '@playwright/test';

/**
 * CSS pipeline integrity gate.
 *
 * The production build is shipped behind a strict CSP
 * (`script-src 'self'` with no `'unsafe-inline'` and no `'unsafe-hashes'`).
 * Angular's default `optimization.styles.inlineCritical: true` injects an
 * async-CSS pattern using an inline `onload` event handler on the
 * `<link>` tag — that handler is governed by `script-src` (CSP3
 * inline-event-handler rule), gets blocked, and the stylesheet stays at
 * `media="print"` forever, so 17KB of compiled Tailwind never paints.
 *
 * The fix lives in `angular.json` (`optimization.styles.inlineCritical:
 * false`). This test catches the class of regression that re-introduces
 * the issue — anything in the prod bundle that fires a CSP violation, or
 * any failure that leaves Tailwind classes unresolved on `<body>`.
 *
 * Runs against the production build via `playwright.config.ts`'s
 * `webServer` block (`npx serve -s -l 4321 dist/web/browser`).
 *
 * NOTE: the production CSP header lives in `staticwebapp.config.json` and
 * is applied by Azure Static Web Apps at the edge. `npx serve` does NOT
 * inject those headers, so this gate primarily exercises the BUILD-TIME
 * shape of the bundle (no inline event handlers, computed styles
 * resolved). The CSP violation listener is still useful as a belt-and-
 * braces check for any inline-script/style pattern the optimiser might
 * reintroduce in future Angular versions.
 */
test.describe('CSS pipeline integrity', () => {
  test('production build paints with Tailwind styles applied + zero CSP violations', async ({ page }) => {
    const violations: string[] = [];
    await page.exposeFunction('__cspViolation', (msg: string) => {
      violations.push(msg);
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        // @ts-expect-error injected
        window.__cspViolation(`${e.violatedDirective}: ${e.blockedURI}`);
      });
    });
    await page.goto('/');

    // Tailwind class resolution check — `<body>` has tailwind classes that
    // resolve to a non-default background. If the stylesheet never loaded,
    // browsers report `rgba(0, 0, 0, 0)` (transparent) for the default
    // body bg.
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('rgb(0, 0, 0)');

    // Zero CSP violations during initial paint.
    expect(violations).toEqual([]);
  });
});
