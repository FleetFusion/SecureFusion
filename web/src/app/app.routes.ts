import type { Routes } from '@angular/router';

/**
 * Top-level SPA routes. Verify is the root page; About is a small
 * static page; everything else falls through to a 404. All three are
 * lazy-loaded so the initial bundle only carries the verify page.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/verify/verify.page').then((m) => m.VerifyPage),
    title: 'SecureFusion Verifier',
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./pages/about/about.page').then((m) => m.AboutPage),
    title: 'About · SecureFusion Verifier',
  },
  {
    path: '**',
    loadComponent: () =>
      import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
    title: 'Not found · SecureFusion Verifier',
  },
];
