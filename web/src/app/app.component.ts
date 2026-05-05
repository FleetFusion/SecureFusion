import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { FooterComponent } from './components/footer/footer.component';
import { HeaderComponent } from './components/header/header.component';

/**
 * Layout shell for the SecureFusion verifier SPA.
 *
 * The header + footer render on every route; only the `<router-outlet>`
 * region swaps when the URL changes. Tailwind handles all styling — no
 * component CSS files are loaded for the shell.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <div class="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <app-header />
      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <router-outlet />
      </main>
      <app-footer />
    </div>
  `,
})
export class AppComponent {
  readonly title = 'SecureFusion Verifier';
}
