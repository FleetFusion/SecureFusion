import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Landing page (/).
 *
 * SecureFusion project home — sits at the root of `securefusion.org` and
 * introduces the open standard to first-time visitors. The verifier SPA
 * itself moved to `/verify`; this page links to it via a prominent CTA.
 *
 * Sections (top → bottom):
 *
 * 1. Hero with the SecureFusion wordmark/logo, tagline, and two CTAs
 *    ("Verify a video" → `/verify`, "View on GitHub" → external repo).
 * 2. Three explainer cards: hash on ingest, anchor on chain, verify
 *    publicly.
 * 3. "Why it exists" — short narrative pulled from the README.
 * 4. "How it works" — pipeline narrative with an inline ASCII diagram
 *    rendered as a `<pre>` block (matches the README diagram).
 * 5. Footer CTA row: verifier + spec + roadmap links.
 *
 * No Angular Material, no extra deps; Tailwind utility classes only.
 * Heading hierarchy: one `<h1>` for the hero, `<h2>` for each section,
 * `<h3>` for cards. Interactive elements carry visible focus rings via
 * `focus:ring-*` so keyboard-only users see where they are.
 */
@Component({
  standalone: true,
  selector: 'app-landing-page',
  imports: [RouterLink],
  template: `
    <article class="space-y-16">
      <!-- Hero -->
      <section
        class="flex flex-col items-center gap-6 pt-4 text-center"
        aria-labelledby="hero-heading"
      >
        <img
          src="logo.png"
          alt="SecureFusion logo"
          class="h-auto w-full max-w-md"
          width="420"
          height="120"
        />
        <h1
          id="hero-heading"
          class="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
        >
          Tamper-evident video evidence for commercial fleets
        </h1>
        <p class="max-w-2xl text-base text-gray-600 sm:text-lg">
          An open industry standard for tamper-evident video evidence in
          commercial fleets. Every clip is hashed on ingest, anchored on
          public blockchains, and verifiable by anyone — without trusting
          the platform that produced it.
        </p>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a
            routerLink="/verify"
            data-testid="hero-verify-cta"
            class="inline-flex items-center justify-center rounded-md bg-ff-green px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-ff-green/90 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          >
            Verify a video
          </a>
          <a
            href="https://github.com/FleetFusion/SecureFusion"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="hero-github-cta"
            class="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          >
            View on GitHub
          </a>
        </div>
      </section>

      <!-- Three explainer cards -->
      <section aria-labelledby="what-it-does-heading" class="space-y-6">
        <h2
          id="what-it-does-heading"
          class="text-center text-2xl font-bold text-gray-900"
        >
          What the standard does
        </h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-base font-semibold text-gray-900">Hash on ingest</h3>
            <p class="mt-2 text-sm text-gray-600">
              Every video is SHA-256 hashed at the ingest gateway, before
              any transcoding or processing. The hash is the fingerprint
              the rest of the pipeline depends on.
            </p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-base font-semibold text-gray-900">Anchor on chain</h3>
            <p class="mt-2 text-sm text-gray-600">
              Hashes are written to the XRP Ledger within seconds and
              batched hourly into Bitcoin via OpenTimestamps for
              long-term durability — neutral public ledgers, no trusted
              intermediary.
            </p>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 class="text-base font-semibold text-gray-900">Verify publicly</h3>
            <p class="mt-2 text-sm text-gray-600">
              Anyone can drop a video file into the public verifier and
              confirm — independently of the host platform — that the
              file has not been altered since ingest.
            </p>
          </div>
        </div>
      </section>

      <!-- Why it exists -->
      <section aria-labelledby="why-heading" class="space-y-4">
        <h2 id="why-heading" class="text-2xl font-bold text-gray-900">
          Why it exists
        </h2>
        <p class="text-base text-gray-700">
          Video from commercial vehicles is increasingly the deciding
          factor in insurance claims, regulatory schemes like DVSA Earned
          Recognition, driver coaching decisions that affect livelihoods,
          civil and criminal proceedings, and public-interest
          investigations after collisions and near-misses.
        </p>
        <p class="text-base text-gray-700">
          Today the trustworthiness of that video rests entirely on the
          platform hosting it. There is no neutral way for an outside
          party to confirm a clip has not been altered. SecureFusion
          fixes that — by moving the trust anchor from "the platform
          says so" to "the public blockchain confirms it."
        </p>
        <p class="text-base text-gray-700">
          The standard is open. Any telematics provider, camera
          manufacturer, fleet platform, or insurer can implement it.
        </p>
      </section>

      <!-- How it works -->
      <section aria-labelledby="how-heading" class="space-y-4">
        <h2 id="how-heading" class="text-2xl font-bold text-gray-900">
          How it works
        </h2>
        <p class="text-base text-gray-700">
          The pipeline is deliberately thin. A vehicle camera produces
          bytes; the ingest gateway hashes them before any processing;
          the hash plus a structured event manifest is anchored to XRPL
          immediately and to Bitcoin (via OpenTimestamps) on the next
          hourly batch. Compliant players show a verification badge that
          links to the on-chain transaction; the public verifier lets
          anyone re-run the same checks.
        </p>
        <pre
          class="overflow-x-auto rounded-md bg-gray-900 p-4 text-xs leading-relaxed text-gray-100"
          aria-label="SecureFusion pipeline diagram"
        >{{ pipelineDiagram }}</pre>
        <ol class="list-decimal space-y-2 pl-5 text-base text-gray-700">
          <li>
            <strong>Hash on ingest</strong> — SHA-256 over the raw bytes,
            before any transcoding.
          </li>
          <li>
            <strong>Build the manifest</strong> — a canonical JSON record
            (vehicle, time, channel hashes, codec) hashed to produce the
            <em>bundle hash</em>.
          </li>
          <li>
            <strong>Anchor on chain</strong> — bundle + event written to
            XRPL within seconds; batched hourly into Bitcoin via
            OpenTimestamps.
          </li>
          <li>
            <strong>Display proof</strong> — compliant video players show
            a SecureFusion badge linking to the on-chain transaction.
          </li>
          <li>
            <strong>Verify publicly</strong> — anyone can drop a video
            file into the public verifier; the file is hashed locally,
            and the hash is checked against the public ledgers.
          </li>
        </ol>
      </section>

      <!-- Footer CTA -->
      <section
        aria-labelledby="cta-heading"
        class="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm"
      >
        <h2 id="cta-heading" class="text-xl font-semibold text-gray-900">
          Ready to verify?
        </h2>
        <div class="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            routerLink="/verify"
            data-testid="footer-verify-cta"
            class="inline-flex items-center justify-center rounded-md bg-ff-green px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-ff-green/90 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          >
            Verify a video
          </a>
          <a
            href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/SPEC.md"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          >
            Read the spec on GitHub
          </a>
          <a
            href="https://github.com/FleetFusion/SecureFusion/blob/main/docs/v2-roadmap.md"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          >
            Browse v2 roadmap on GitHub
          </a>
        </div>
      </section>
    </article>
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
