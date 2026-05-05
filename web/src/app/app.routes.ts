import type { Routes } from '@angular/router';

/**
 * Top-level SPA routes. The site is served at `securefusion.org`:
 *
 * - `/` is the project landing page (hero + explainer + CTAs).
 * - `/verify` is the drag-drop verifier flow (was previously `/`).
 * - `/about` is a small static page describing the verifier's role.
 * - Anything else falls through to the 404 page.
 *
 * All four are lazy-loaded so the initial bundle only carries the
 * landing page; the verifier's wasm + verification deps load on
 * navigation to `/verify`.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/landing/landing.page').then((m) => m.LandingPage),
    title: 'SecureFusion · Open standard for tamper-evident video evidence',
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('./pages/verify/verify.page').then((m) => m.VerifyPage),
    title: 'Verify a video · SecureFusion',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.page').then((m) => m.AboutPage),
    title: 'About · SecureFusion',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
    title: 'Not found · SecureFusion',
  },
];
