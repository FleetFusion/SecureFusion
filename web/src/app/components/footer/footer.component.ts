import { Component } from '@angular/core';

/**
 * Persistent application footer.
 *
 * Light-grey strip below the page content with:
 * - Mono SemVer + SPDX line on the left.
 * - "No upload" reassurance + spec / GitHub links on the right.
 *
 * The "no upload" copy stays — it's the trust message the verifier hangs
 * on, and the spec asserts on it. Visual styling per the polish pass:
 * `bg-slate-100`, slate-600 text, mono font for the version line.
 */
@Component({
  standalone: true,
  selector: 'app-footer',
  host: {
    class:
      'block w-full bg-slate-100 text-slate-600 text-sm border-t border-slate-200',
  },
  template: `
    <div
      class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-2"
    >
      <span class="font-mono text-xs sm:text-sm">
        SecureFusion v1.0.0 · Apache-2.0 / CC BY 4.0 — runs in your browser, no upload
      </span>
      <div class="flex items-center gap-4">
        <a
          href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/securefusion-v1.md"
          target="_blank"
          rel="noopener noreferrer"
          class="text-slate-600 hover:text-brand-navy transition-colors"
        >
          Spec
        </a>
        <a
          href="https://github.com/FleetFusion/SecureFusion"
          target="_blank"
          rel="noopener noreferrer"
          class="text-slate-600 hover:text-brand-navy transition-colors"
        >
          GitHub
        </a>
      </div>
    </div>
  `,
})
export class FooterComponent {}
