import { Component } from '@angular/core';

/**
 * Persistent application footer.
 *
 * Carries the SecureFusion v1 spec link and a "no-backend" reassurance
 * message — the verifier runs entirely client-side, no upload happens.
 */
@Component({
  standalone: true,
  selector: 'app-footer',
  host: { class: 'block w-full border-t border-gray-200 bg-white mt-12' },
  template: `
    <div
      class="mx-auto flex max-w-5xl flex-col items-start gap-1 px-4 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between"
    >
      <span>
        SecureFusion Verifier &middot; Runs entirely in your browser &mdash; no upload, no backend.
      </span>
      <a
        href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/securefusion-v1.md"
        target="_blank"
        rel="noopener noreferrer"
        class="text-ff-green hover:underline"
      >
        SecureFusion v1 spec
      </a>
    </div>
  `,
})
export class FooterComponent {}
