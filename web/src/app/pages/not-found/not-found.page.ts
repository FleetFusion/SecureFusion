import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Wildcard 404 page. Plain link back to `/`.
 */
@Component({
  standalone: true,
  selector: 'app-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="space-y-4 py-12 text-center">
      <p class="text-sm font-semibold text-ff-green">404</p>
      <h1 class="text-2xl font-bold text-gray-900">Page not found</h1>
      <p class="text-sm text-gray-600">
        That URL doesn't exist on this verifier.
      </p>
      <p>
        <a
          routerLink="/"
          class="inline-flex items-center rounded-md bg-ff-green px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >Back to verifier</a
        >
      </p>
    </section>
  `,
})
export class NotFoundPage {}
