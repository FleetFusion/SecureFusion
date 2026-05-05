import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Landing page (/).
 *
 * SecureFusion project home — sits at the root of `securefusion.org` and
 * introduces the open standard to first-time visitors. The verifier SPA
 * itself moved to `/verify`; this page links to it via a prominent CTA.
 *
 * Visual direction: "Standards-org with Stripe restraint" — alternating
 * white + slate-50 section bands, navy hero with cyan accent, max-w-5xl
 * content rails, generous whitespace, no gradients, no animations beyond
 * `transition-colors`. The wordmark in the hero is height-constrained
 * (`h-12 sm:h-16 w-auto`) so it never overflows narrow viewports.
 *
 * Sections (top → bottom):
 *
 * 1. Hero — navy bg, wordmark logo, h1, tagline, two CTAs.
 * 2. "What it does" — three explainer cards on slate-50.
 * 3. "Why it exists" — narrative prose on white, narrower rail.
 * 4. "How it works" — pipeline narrative + ASCII diagram on slate-50.
 * 5. Footer CTA — navy strip, three links.
 *
 * No Angular Material, no extra deps; Tailwind utility classes only.
 * Heading hierarchy: one `<h1>` for the hero, `<h2>` for each section,
 * `<h3>` for cards. Interactive elements rely on the global
 * `*:focus-visible` cyan outline defined in `src/styles.css`.
 */
@Component({
  standalone: true,
  selector: 'app-landing-page',
  imports: [RouterLink],
  template: `
    <main class="bg-white text-slate-900">
      <!-- Hero -->
      <section
        class="bg-brand-navy text-white py-16 sm:py-24"
        aria-labelledby="hero-heading"
      >
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <img
            src="logo-light.png"
            alt="SecureFusion logo"
            class="h-12 sm:h-16 w-auto mb-8"
            width="688"
            height="80"
          />
          <h1
            id="hero-heading"
            class="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight"
          >
            Tamper-evident video evidence for commercial fleets
          </h1>
          <p class="mt-6 text-lg text-white/80 max-w-2xl">
            An open industry standard for tamper-evident video evidence in
            commercial fleets. Every clip is hashed on ingest, anchored on
            public blockchains, and verifiable by anyone, without trusting
            the platform that produced it.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 mt-10">
            <a
              routerLink="/verify"
              data-testid="hero-verify-cta"
              class="inline-flex items-center justify-center rounded-md bg-brand-cyan px-6 py-3 text-base font-semibold text-brand-navy hover:bg-white transition-colors"
            >
              Verify a video
            </a>
            <a
              href="https://github.com/FleetFusion/SecureFusion"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="hero-github-cta"
              class="inline-flex items-center justify-center rounded-md border border-white/30 px-6 py-3 text-base font-semibold text-white hover:bg-white/10 transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <!-- What it does — three explainer cards -->
      <section
        class="bg-slate-50 py-16 sm:py-24"
        aria-labelledby="what-it-does-heading"
      >
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2
            id="what-it-does-heading"
            class="text-3xl font-semibold text-brand-navy mb-12 text-center"
          >
            What the standard does
          </h2>
          <div class="grid sm:grid-cols-3 gap-8">
            <div
              class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"
            >
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-brand-cyan"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <h3 class="text-lg font-semibold text-brand-navy mt-4">
                Hash on ingest
              </h3>
              <p class="text-sm text-slate-600 mt-2">
                Every video is SHA-256 hashed at the ingest gateway, before
                any transcoding or processing. The hash is the fingerprint
                the rest of the pipeline depends on.
              </p>
            </div>
            <div
              class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"
            >
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-brand-cyan"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <h3 class="text-lg font-semibold text-brand-navy mt-4">
                Anchor on chain
              </h3>
              <p class="text-sm text-slate-600 mt-2">
                Hashes are written to the XRP Ledger within seconds and
                batched hourly into Bitcoin via OpenTimestamps for
                long-term durability. Both are neutral public ledgers
                with no trusted intermediary.
              </p>
            </div>
            <div
              class="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"
            >
              <svg
                viewBox="0 0 24 24"
                width="28"
                height="28"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="text-brand-cyan"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <h3 class="text-lg font-semibold text-brand-navy mt-4">
                Verify publicly
              </h3>
              <p class="text-sm text-slate-600 mt-2">
                Anyone can drop a video file into the public verifier and
                confirm, independently of the host platform, that the
                file has not been altered since ingest.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Why it exists -->
      <section
        class="bg-white py-16 sm:py-24"
        aria-labelledby="why-heading"
      >
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2
            id="why-heading"
            class="text-3xl font-semibold text-brand-navy mb-8"
          >
            Why it exists
          </h2>
          <p class="text-lg text-slate-700 leading-relaxed max-w-3xl">
            Video from commercial vehicles is increasingly the deciding
            factor in insurance claims, regulatory schemes like DVSA Earned
            Recognition, driver coaching decisions that affect livelihoods,
            civil and criminal proceedings, and public-interest
            investigations after collisions and near-misses.
          </p>
          <p class="text-lg text-slate-700 leading-relaxed mt-6 max-w-3xl">
            Today the trustworthiness of that video rests entirely on the
            platform hosting it. There is no neutral way for an outside
            party to confirm a clip has not been altered. SecureFusion
            fixes that by moving the trust anchor from "the platform
            says so" to "the public blockchain confirms it."
          </p>
          <p class="text-lg text-slate-700 leading-relaxed mt-6 max-w-3xl">
            The standard is open. Any telematics provider, camera
            manufacturer, fleet platform, or insurer can implement it.
          </p>
        </div>
      </section>

      <!-- How it works -->
      <section
        class="bg-slate-50 py-16 sm:py-24"
        aria-labelledby="how-heading"
      >
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <h2
            id="how-heading"
            class="text-3xl font-semibold text-brand-navy mb-8"
          >
            How it works
          </h2>
          <p class="text-lg text-slate-700 leading-relaxed max-w-3xl">
            The pipeline is deliberately thin. A vehicle camera produces
            bytes; the ingest gateway hashes them before any processing;
            the hash plus a structured event manifest is anchored to XRPL
            immediately and to Bitcoin (via OpenTimestamps) on the next
            hourly batch. Compliant players show a verification badge that
            links to the on-chain transaction; the public verifier lets
            anyone re-run the same checks.
          </p>
          <pre
            class="font-mono text-sm bg-brand-navy text-cyan-100 p-6 rounded-lg overflow-x-auto mt-8"
            aria-label="SecureFusion pipeline diagram"
          >{{ pipelineDiagram }}</pre>
          <ol
            class="list-decimal space-y-3 pl-5 text-base text-slate-700 mt-8 max-w-3xl"
          >
            <li>
              <strong class="text-brand-navy">Hash on ingest.</strong>
              SHA-256 over the raw bytes, before any transcoding.
            </li>
            <li>
              <strong class="text-brand-navy">Build the manifest.</strong>
              A canonical JSON record (vehicle, time, channel hashes,
              codec) hashed to produce the <em>bundle hash</em>.
            </li>
            <li>
              <strong class="text-brand-navy">Anchor on chain.</strong>
              Bundle and event written to XRPL within seconds, batched
              hourly into Bitcoin via OpenTimestamps.
            </li>
            <li>
              <strong class="text-brand-navy">Display proof.</strong>
              Compliant video players show a SecureFusion badge linking
              to the on-chain transaction.
            </li>
            <li>
              <strong class="text-brand-navy">Verify publicly.</strong>
              Anyone can drop a video file into the public verifier; the
              file is hashed locally, and the hash is checked against the
              public ledgers.
            </li>
          </ol>
        </div>
      </section>

      <!-- Footer CTA -->
      <section
        class="bg-brand-navy text-white py-16"
        aria-labelledby="cta-heading"
      >
        <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <h2
            id="cta-heading"
            class="text-3xl font-semibold"
          >
            Ready to verify?
          </h2>
          <div class="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              routerLink="/verify"
              data-testid="footer-verify-cta"
              class="inline-flex items-center justify-center rounded-md bg-ff-green px-6 py-3 text-base font-semibold text-white hover:bg-ff-green/90 transition-colors"
            >
              Verify a video
            </a>
            <a
              href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/SPEC.md"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center justify-center rounded-md text-base font-semibold text-brand-cyan hover:text-white transition-colors px-2 py-3"
            >
              Read the spec on GitHub
            </a>
            <a
              href="https://github.com/FleetFusion/SecureFusion/blob/main/docs/v2-roadmap.md"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center justify-center rounded-md text-base font-semibold text-brand-cyan hover:text-white transition-colors px-2 py-3"
            >
              Browse v2 roadmap on GitHub
            </a>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class LandingPage {
  readonly pipelineDiagram = `[Vehicle camera]
       |
       v
[Ingest gateway]  --> SHA-256 hash, before any processing
       |
       v
[Canonical event manifest]  --> bundleHash
       |
       v
   +---+---+
   v       v
[XRPL]   [Bitcoin via OpenTimestamps]
 ~5s         hourly batches
 instant     long-term archival
   |       |
   +---+---+
       v
[Player badge]   [Public verifier]
                 anyone can verify
                 a file in 5 seconds`;
}
