import { Component, computed, input, signal } from '@angular/core';

import type { Network, VerificationResult } from '../../core/verifier-types';

/**
 * Verify-Independently tab.
 *
 * A static, parameterised "how to reproduce this verification with
 * `curl`, `openssl`, and `ots verify`" walkthrough. The component does
 * NOT execute anything — it renders documentation that the user can
 * copy and paste into an air-gapped terminal. Real values from the
 * scan result (anchor tx hash, bundle hash, signer key id, network)
 * are substituted into each `<pre>` block so the commands work
 * verbatim.
 *
 * Collapsed by default; clicking the header expands the four
 * `<pre>`-wrapped command blocks. Each block has its own "Copy" button
 * driven by `navigator.clipboard.writeText`.
 */
@Component({
  standalone: true,
  selector: 'app-verify-independently',
  template: `
    <section
      class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        <span class="font-semibold text-gray-900">Verify independently</span>
        <span class="text-sm text-gray-500"
          >Reproduce this proof on your own machine</span
        >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="text-gray-400"
          [class.rotate-180]="open()"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
        </svg>
      </button>
      @if (open()) {
        <div class="space-y-4 border-t border-gray-100 px-4 py-4">
          <p class="text-sm text-gray-600">
            These commands reproduce the same three-tier verification you
            just saw, on any machine with <code>curl</code>,
            <code>openssl</code>, and (for Tier 3) the
            <a
              href="https://github.com/opentimestamps/opentimestamps-client"
              target="_blank"
              rel="noopener noreferrer"
              class="text-ff-green hover:underline"
              >OpenTimestamps client</a
            >
            installed. No data is uploaded; everything runs locally.
          </p>

          <article>
            <h3 class="mb-2 text-sm font-semibold text-gray-700">
              1. Hash your video file (Tier 1)
            </h3>
            <p class="mb-2 text-sm text-gray-600">
              Compute the SHA-256 of the file you just verified. It must
              match the channel hash recorded in the SF1 anchor tx.
            </p>
            <div class="relative">
              <pre
                data-testid="block-hash"
                class="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100"
              >{{ hashBlock() }}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-ff-green"
                aria-label="Copy hash command"
                (click)="copy(hashBlock(), 'hash')"
              >
                {{ copied() === 'hash' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </article>

          <article>
            <h3 class="mb-2 text-sm font-semibold text-gray-700">
              2. Fetch the XRPL anchor tx (Tier 1)
            </h3>
            <p class="mb-2 text-sm text-gray-600">
              Pull the original 3-memo Payment from the XRPL JSON-RPC.
              The response contains SF1.bundle, SF1.event, and SF1.sig.
            </p>
            <div class="relative">
              <pre
                data-testid="block-curl"
                class="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100"
              >{{ curlBlock() }}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-ff-green"
                aria-label="Copy curl command"
                (click)="copy(curlBlock(), 'curl')"
              >
                {{ copied() === 'curl' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </article>

          <article>
            <h3 class="mb-2 text-sm font-semibold text-gray-700">
              3. Verify the platform signature (Tier 2)
            </h3>
            <p class="mb-2 text-sm text-gray-600">
              Verify the Ed25519 signature over (bundle &Vert; event)
              using the signer's public key.
              <code>{{ signerKeyPemFile() }}</code> is a one-time
              download from the
              <a
                href="https://github.com/FleetFusion/SecureFusion/tree/main/trust-anchors"
                target="_blank"
                rel="noopener noreferrer"
                class="text-ff-green hover:underline"
                >trust-anchors directory</a
              >.
            </p>
            <div class="relative">
              <pre
                data-testid="block-openssl"
                class="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100"
              >{{ opensslBlock() }}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-ff-green"
                aria-label="Copy openssl command"
                (click)="copy(opensslBlock(), 'openssl')"
              >
                {{ copied() === 'openssl' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </article>

          <article>
            <h3 class="mb-2 text-sm font-semibold text-gray-700">
              4. Verify the Bitcoin attestation (Tier 3)
            </h3>
            <p class="mb-2 text-sm text-gray-600">
              The SF1.ots upgrade tx contains an OpenTimestamps proof.
              <code>ots verify</code> walks the proof to a Bitcoin
              block and confirms the timestamp.
            </p>
            <div class="relative">
              <pre
                data-testid="block-ots"
                class="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs text-gray-100"
              >{{ otsBlock() }}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 rounded-md bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-ff-green"
                aria-label="Copy ots command"
                (click)="copy(otsBlock(), 'ots')"
              >
                {{ copied() === 'ots' ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </article>
        </div>
      }
    </section>
  `,
})
export class VerifyIndependentlyComponent {
  readonly result = input.required<VerificationResult>();
  /** XRPL JSON-RPC URL the SPA used; defaults to xrplcluster.com. */
  readonly rippledUrl = input<string>('https://xrplcluster.com');

  readonly open = signal(false);
  readonly copied = signal<string | null>(null);

  readonly anchorTxHash = computed(
    () => this.result().tier1.anchor?.txHash ?? '<anchor-tx-hash>',
  );
  readonly network = computed<Network>(
    () => this.result().tier1.anchor?.network ?? 'mainnet',
  );
  readonly signerKeyId = computed(
    () => this.result().tier2.signerKeyId ?? '<signer-key-id>',
  );
  readonly fileSha = computed(() => this.result().fileSha256);
  readonly fileName = computed(() => this.result().fileName);
  readonly upgradeTxHash = computed(
    () => this.result().tier3.upgrade?.txHash ?? '<ots-upgrade-tx-hash>',
  );

  readonly signerKeyPemFile = computed(() => `${this.signerKeyId()}.pem`);

  readonly hashBlock = computed(
    () => `# Compute SHA-256 of your local file
sha256sum "${this.fileName()}"

# Expected:
# ${this.fileSha()}  ${this.fileName()}`,
  );

  readonly curlBlock = computed(
    () => `# Fetch the SF1 anchor tx from XRPL
curl -sS -X POST "${this.rippledUrl()}" \\
  -H 'content-type: application/json' \\
  -d '{
    "method": "tx",
    "params": [{ "transaction": "${this.anchorTxHash()}", "binary": false }]
  }' | jq .

# Network: ${this.network()}
# Explorer: ${this.explorerUrl()}`,
  );

  readonly opensslBlock = computed(
    () => `# Decode the SF1 memos to bundle.bin / event.json / sig.bin (jq + xxd):
#   .result.Memos[].Memo.MemoData (hex) → binary

# Concatenate (bundle || event) and verify with openssl:
cat bundle.bin event.json > signed.bin
openssl pkeyutl -verify -pubin \\
  -inkey ${this.signerKeyPemFile()} \\
  -rawin -in signed.bin \\
  -sigfile sig.bin
# Expected: "Signature Verified Successfully"
# Signer: ${this.signerKeyId()}`,
  );

  readonly otsBlock = computed(
    () => `# Pull the SF1.ots upgrade tx and extract the proof bytes:
curl -sS -X POST "${this.rippledUrl()}" \\
  -H 'content-type: application/json' \\
  -d '{
    "method": "tx",
    "params": [{ "transaction": "${this.upgradeTxHash()}", "binary": false }]
  }' | jq -r '.result.Memos[3].Memo.MemoData' | xxd -r -p > event-${this.eventIdShort()}.ots

# Verify with the OpenTimestamps client:
ots verify event-${this.eventIdShort()}.ots
# Expected: "Success! Bitcoin block <height> attests existence as of <date>"`,
  );

  copy(text: string, key: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text).then(() => {
        this.copied.set(key);
        setTimeout(() => this.copied.set(null), 1500);
      });
    } else {
      this.copied.set(key);
    }
  }

  explorerUrl(): string {
    const base =
      this.network() === 'testnet'
        ? 'https://testnet.xrpl.org/transactions'
        : 'https://livenet.xrpl.org/transactions';
    return `${base}/${this.anchorTxHash()}`;
  }

  /**
   * Used as the local filename suffix in the OTS block. We use the
   * vehicleEventId from the manifest if present, falling back to a
   * truncation of the file SHA otherwise.
   */
  eventIdShort(): string {
    const m = this.result().manifest as
      | { vehicleEventId?: unknown; eventId?: unknown }
      | undefined;
    if (m && typeof m['vehicleEventId'] === 'string') return m['vehicleEventId'];
    if (m && typeof m['eventId'] === 'string') return m['eventId'];
    return this.fileSha().slice(0, 16);
  }
}
