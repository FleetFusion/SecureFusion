import { Component, computed, input, signal } from '@angular/core';

import type { Network, VerificationResult } from '../../core/verifier-types';

/**
 * Three-tier result tile group.
 *
 * Renders three independent expandable tiles, one per tier:
 *   1. "Hash on XRPL"       — Tier 1
 *   2. "Signed by platform key" — Tier 2
 *   3. "Bitcoin-attested"   — Tier 3
 *
 * Each tile is collapsed by default; clicking the header expands it to
 * show the per-tier evidence (anchor tx + ledger info, signer key id,
 * Bitcoin block height, etc).
 *
 * Colour map (canonical, see plan §L11):
 *   verified           → green
 *   attested-on-chain  → amber (Tier-3 only — partial green tile)
 *   invalid            → red
 *   not-found, not-provided, not-applicable, pending → grey
 */
@Component({
  standalone: true,
  selector: 'app-result-tiers',
  template: `
    <div class="space-y-3">
      <!-- Tier 1 -->
      <article
        data-testid="tier-1"
        [attr.data-status]="result().tier1.status"
        class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green"
          [attr.aria-expanded]="open1()"
          (click)="open1.set(!open1())"
        >
          <span class="flex items-center gap-3">
            <span
              data-testid="tier1-dot"
              [class]="dotClass(tier1Color())"
              class="inline-block h-3 w-3 rounded-full"
              [attr.aria-label]="'Tier 1 status: ' + result().tier1.status"
            ></span>
            <span class="font-semibold text-gray-900">Hash on XRPL</span>
            <span class="text-sm text-gray-500">{{ tier1Label() }}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-gray-400"
            [class.rotate-180]="open1()"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>
        @if (open1()) {
          <div class="border-t border-gray-100 px-4 py-3 text-sm text-gray-700">
            @if (result().tier1.anchor; as anchor) {
              <dl class="grid grid-cols-1 gap-2 sm:grid-cols-[max-content_1fr]">
                <dt class="font-medium text-gray-500">Ledger index</dt>
                <dd class="tabular-nums">{{ anchor.ledgerIndex }}</dd>
                <dt class="font-medium text-gray-500">Ledger close time</dt>
                <dd>{{ anchor.ledgerCloseTimeUtc ?? '—' }}</dd>
                <dt class="font-medium text-gray-500">Tx hash</dt>
                <dd class="break-all">
                  <a
                    [href]="explorerTxUrl(anchor.txHash, anchor.network)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono text-ff-green hover:underline"
                    >{{ anchor.txHash }}</a
                  >
                </dd>
                <dt class="font-medium text-gray-500">Account</dt>
                <dd class="break-all font-mono">{{ anchor.account }}</dd>
              </dl>
            } @else {
              <p class="text-gray-600">{{ tier1ReasonText() }}</p>
            }
          </div>
        }
      </article>

      <!-- Tier 2 -->
      <article
        data-testid="tier-2"
        [attr.data-status]="result().tier2.status"
        class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green"
          [attr.aria-expanded]="open2()"
          (click)="open2.set(!open2())"
        >
          <span class="flex items-center gap-3">
            <span
              data-testid="tier2-dot"
              [class]="dotClass(tier2Color())"
              class="inline-block h-3 w-3 rounded-full"
              [attr.aria-label]="'Tier 2 status: ' + result().tier2.status"
            ></span>
            <span class="font-semibold text-gray-900">Signed by platform key</span>
            <span class="text-sm text-gray-500">{{ tier2Label() }}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-gray-400"
            [class.rotate-180]="open2()"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>
        @if (open2()) {
          <div class="border-t border-gray-100 px-4 py-3 text-sm text-gray-700">
            @if (result().tier2.signerKeyId) {
              <dl class="grid grid-cols-1 gap-2 sm:grid-cols-[max-content_1fr]">
                <dt class="font-medium text-gray-500">Signer key id</dt>
                <dd class="break-all font-mono">{{ result().tier2.signerKeyId }}</dd>
                @if (result().tier2.publicKey) {
                  <dt class="font-medium text-gray-500">Public key</dt>
                  <dd class="break-all font-mono text-xs">
                    {{ result().tier2.publicKey }}
                  </dd>
                }
                @if (organisation()) {
                  <dt class="font-medium text-gray-500">Organisation</dt>
                  <dd>{{ organisation() }}</dd>
                }
              </dl>
            } @else {
              <p class="text-gray-600">{{ tier2ReasonText() }}</p>
            }
          </div>
        }
      </article>

      <!-- Tier 3 -->
      <article
        data-testid="tier-3"
        [attr.data-status]="result().tier3.status"
        class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
      >
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green"
          [attr.aria-expanded]="open3()"
          (click)="open3.set(!open3())"
        >
          <span class="flex items-center gap-3">
            <span
              data-testid="tier3-dot"
              [class]="dotClass(tier3Color())"
              class="inline-block h-3 w-3 rounded-full"
              [attr.aria-label]="'Tier 3 status: ' + result().tier3.status"
            ></span>
            <span class="font-semibold text-gray-900">Bitcoin-attested</span>
            <span class="text-sm text-gray-500">{{ tier3Label() }}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-gray-400"
            [class.rotate-180]="open3()"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>
        @if (open3()) {
          <div class="border-t border-gray-100 px-4 py-3 text-sm text-gray-700">
            @if (result().tier3.bitcoin; as bitcoin) {
              <dl class="grid grid-cols-1 gap-2 sm:grid-cols-[max-content_1fr]">
                <dt class="font-medium text-gray-500">Block height</dt>
                <dd class="tabular-nums">{{ bitcoin.blockHeight }}</dd>
                <dt class="font-medium text-gray-500">Block time</dt>
                <dd>{{ bitcoin.blockTimeUtc ?? '—' }}</dd>
              </dl>
            }
            @if (result().tier3.upgrade; as upgrade) {
              <dl
                class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[max-content_1fr]"
              >
                <dt class="font-medium text-gray-500">OTS upgrade tx</dt>
                <dd class="break-all">
                  <a
                    [href]="
                      explorerTxUrl(
                        upgrade.txHash,
                        result().tier1.anchor?.network ?? 'mainnet'
                      )
                    "
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono text-ff-green hover:underline"
                    >{{ upgrade.txHash }}</a
                  >
                </dd>
                <dt class="font-medium text-gray-500">OTS upgrade ledger</dt>
                <dd class="tabular-nums">{{ upgrade.ledgerIndex }}</dd>
              </dl>
            }
            <p class="mt-2 text-gray-600">{{ tier3ReasonText() }}</p>
          </div>
        }
      </article>
    </div>
  `,
})
export class ResultTiersComponent {
  readonly result = input.required<VerificationResult>();
  /**
   * Optional human-readable organisation label, derived from the trust
   * anchor bundle by the parent. Shown in Tier-2's expanded panel.
   */
  readonly organisation = input<string | null>(null);

  readonly open1 = signal(false);
  readonly open2 = signal(false);
  readonly open3 = signal(false);

  readonly tier1Color = computed<TierColor>(() => {
    const s = this.result().tier1.status;
    if (s === 'verified') return 'green';
    if (s === 'invalid') return 'red';
    return 'grey';
  });

  readonly tier2Color = computed<TierColor>(() => {
    const s = this.result().tier2.status;
    if (s === 'verified') return 'green';
    if (s === 'invalid') return 'red';
    return 'grey';
  });

  readonly tier3Color = computed<TierColor>(() => {
    const s = this.result().tier3.status;
    if (s === 'verified') return 'green';
    if (s === 'attested-on-chain') return 'amber';
    if (s === 'invalid') return 'red';
    return 'grey';
  });

  readonly tier1Label = computed(() => labelForTier1(this.result().tier1.status));
  readonly tier2Label = computed(() => labelForTier2(this.result().tier2.status));
  readonly tier3Label = computed(() => labelForTier3(this.result().tier3.status));

  readonly tier1ReasonText = computed(
    () => this.result().tier1.reason ?? 'No anchor found yet.',
  );
  readonly tier2ReasonText = computed(
    () => this.result().tier2.reason ?? 'No platform-key signature found.',
  );
  readonly tier3ReasonText = computed(() => {
    const t3 = this.result().tier3;
    if (t3.reason) return t3.reason;
    if (t3.status === 'not-provided')
      return 'This issuer does not provide a Bitcoin attestation.';
    if (t3.status === 'attested-on-chain')
      return 'OTS upgrade exists on XRPL; full Bitcoin proof verification is deferred.';
    if (t3.status === 'not-found') return 'No SF1.ots upgrade tx found yet.';
    return '';
  });

  /**
   * Map a tier colour to its background utility class. Plain strings
   * (not Tailwind dynamic class composition) so PurgeCSS keeps them.
   */
  dotClass(color: TierColor): string {
    switch (color) {
      case 'green':
        return 'bg-ff-green';
      case 'amber':
        return 'bg-ff-amber';
      case 'red':
        return 'bg-ff-red';
      default:
        return 'bg-ff-grey';
    }
  }

  /** XRPL explorer URL for the network bundled in the anchor. */
  explorerTxUrl(txHash: string, network: Network): string {
    const base =
      network === 'testnet'
        ? 'https://testnet.xrpl.org/transactions'
        : 'https://livenet.xrpl.org/transactions';
    return `${base}/${txHash}`;
  }
}

type TierColor = 'green' | 'amber' | 'red' | 'grey';

function labelForTier1(status: string): string {
  switch (status) {
    case 'verified':
      return 'Anchor matched';
    case 'not-found':
      return 'No anchor found';
    case 'invalid':
      return 'Anchor mismatch';
    case 'pending':
      return 'Scanning…';
    default:
      return status;
  }
}

function labelForTier2(status: string): string {
  switch (status) {
    case 'verified':
      return 'Signature valid';
    case 'not-found':
      return 'No signature';
    case 'invalid':
      return 'Signature invalid';
    case 'not-applicable':
      return 'Skipped (Tier 1 failed)';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}

function labelForTier3(status: string): string {
  switch (status) {
    case 'verified':
      return 'Confirmed in Bitcoin block';
    case 'attested-on-chain':
      return 'Attested on XRPL (Bitcoin proof deferred)';
    case 'verified-via-https':
      return 'Verified via HTTPS proof';
    case 'not-provided':
      return 'Not provided by issuer';
    case 'not-found':
      return 'No upgrade tx found';
    case 'not-applicable':
      return 'Skipped (earlier tier failed)';
    case 'invalid':
      return 'Proof invalid';
    case 'pending':
      return 'Pending';
    default:
      return status;
  }
}
