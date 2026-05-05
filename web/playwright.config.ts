import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the SecureFusion verifier SPA.
 *
 * The e2e suite runs against the production build served by `serve` (not
 * the Angular dev server). The dev server has slow first-paint cost and
 * occasional flakes on cold CI runners; the production bundle is the
 * artefact we ship anyway, so testing it directly is more representative.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
  ],
  webServer: {
    command: 'npx serve -s -l 4321 dist/web/browser',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env['CI'],
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
