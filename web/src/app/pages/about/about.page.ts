import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * About page (/about).
 *
 * Static content: a one-paragraph summary of the verifier's role,
 * pointers to the SecureFusion §4 architecture, and the GitHub repo.
 * No interaction beyond the links.
 */
@Component({
  standalone: true,
  selector: 'app-about-page',
  imports: [RouterLink],
  template: `
    <article class="space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold text-gray-900">About this verifier</h1>
        <p class="text-sm text-gray-600">
          A no-backend tool that proves a SecureFusion-anchored video is
          authentic by reading XRPL and Bitcoin directly.
        </p>
      </header>

      <section class="prose prose-sm max-w-none text-gray-700">
        <h2 class="text-lg font-semibold text-gray-900">Three-tier verification</h2>
        <p>
          Every SecureFusion video is anchored on the XRP Ledger as a
          three-memo Payment, signed by the issuing platform's public
          key, and (optionally) attested in Bitcoin via OpenTimestamps.
          This SPA verifies all three independently:
        </p>
        <ol class="list-decimal space-y-1 pl-5">
          <li>
            <strong>Hash on XRPL</strong> — the file's SHA-256 must
            appear inside an SF1.bundle Memo on the platform's XRPL
            account.
          </li>
          <li>
            <strong>Signed by platform key</strong> — the SF1.sig Memo
            verifies under the platform's published Ed25519 public key
            (bundled as a trust anchor).
          </li>
          <li>
            <strong>Bitcoin-attested</strong> — the SF1.ots upgrade tx
            (a 4-memo follow-up) carries an OpenTimestamps proof that
            anchors the bundle into a Bitcoin block.
          </li>
        </ol>

        <h2 class="text-lg font-semibold text-gray-900">No upload, no backend</h2>
        <p>
          The video file never leaves your browser. Hashing, scanning,
          and signature verification all happen client-side. The only
          network requests are read-only XRPL JSON-RPC calls to the
          public rippled endpoint of your choice.
        </p>

        <h2 class="text-lg font-semibold text-gray-900">Open source</h2>
        <p>
          The verifier source, conformance vectors, and trust-anchor
          bundle are public:
        </p>
        <ul class="list-disc space-y-1 pl-5">
          <li>
            <a
              href="https://github.com/FleetFusion/SecureFusion"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ff-green hover:underline"
              >github.com/FleetFusion/SecureFusion</a
            >
            — Repository, issues, and pull requests.
          </li>
          <li>
            <a
              href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/securefusion-v1.md"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ff-green hover:underline"
              >SecureFusion v1 spec</a
            >
            — Memo layout, canonicalisation rules, registry shape.
          </li>
          <li>
            <a
              href="https://github.com/FleetFusion/SecureFusion/blob/main/spec/securefusion-v1.md#4-architecture"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ff-green hover:underline"
              >§4 Architecture</a
            >
            — Anchor/upgrade tx flows.
          </li>
        </ul>
      </section>

      <p>
        <a routerLink="/verify" class="text-ff-green hover:underline">&larr; Back to verifier</a>
      </p>
    </article>
  `,
})
export class AboutPage {}
