import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  computed,
  input,
} from '@angular/core';

import type { ScanProgress } from '../../core/verifier-types';

/**
 * Cancellable progress indicator for the XRPL scanning phase.
 *
 * Driven by a single `ScanProgress` input. The parent (verify page) is
 * responsible for translating `kind: 'scanning'` frames from the
 * orchestrator into snapshots; this component just renders.
 *
 * `currentLedger` is the rippled node's `ledger.current_ledger` (or the
 * tip the orchestrator most recently learned about). When supplied, we
 * can show a percent bar; otherwise we fall back to a spinner-only view
 * because the total work is unknown.
 *
 * `cacheState` is one of:
 *   - 'cold'         → first scan; UI shows the "may take a minute" hint
 *   - 'warm:<n>'     → resuming from cached cursor `n`
 *
 * Emits `(cancel)` when the user clicks the cancel button.
 */
@Component({
  standalone: true,
  selector: 'app-scan-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      aria-busy="true"
      role="status"
      data-testid="scan-progress"
    >
      <div class="mb-2 flex items-baseline justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Scanning XRPL...</h2>
        @if (percent() !== null) {
          <span class="text-sm tabular-nums text-gray-600"
            >{{ percent() }} %</span
          >
        } @else {
          <svg
            class="h-5 w-5 animate-spin text-ff-green"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            data-testid="scan-spinner"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
            />
          </svg>
        }
      </div>

      @if (percent() !== null) {
        <div
          role="progressbar"
          [attr.aria-valuenow]="percent()"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label="Scan progress"
          class="h-3 w-full overflow-hidden rounded-full bg-gray-200"
        >
          <div
            class="h-full rounded-full bg-ff-green transition-all duration-200"
            [style.width.%]="percent()"
          ></div>
        </div>
      }

      <dl class="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-700">
        <dt>Ledgers walked</dt>
        <dd class="font-mono tabular-nums" data-testid="scan-ledgers">
          {{ formatNumber(progress().ledgersWalked) }}@if (
            currentLedger() !== null
          ) {<span class="text-gray-400">
              / {{ formatNumber(currentLedger()!) }}</span
            >}
        </dd>
        <dt>Transactions inspected</dt>
        <dd class="font-mono tabular-nums" data-testid="scan-txs">
          {{ formatNumber(progress().txsDecoded) }}
        </dd>
        <dt>Cache</dt>
        <dd data-testid="scan-cache-state">
          @if (cacheLabel() === 'cold') {
            <span class="text-gray-600"
              >First scan, this may take a minute.</span
            >
          } @else {
            <span class="text-gray-600"
              >Incremental scan from cached ledger
              {{ formatNumber(cachedFromLedger()!) }}.</span
            >
          }
        </dd>
      </dl>

      <div class="mt-3 flex justify-end">
        <button
          type="button"
          data-testid="scan-cancel"
          aria-label="Cancel scan"
          class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          (click)="cancel.emit()"
        >
          Cancel scan
        </button>
      </div>
    </section>
  `,
})
export class ScanProgressComponent {
  /** Latest progress snapshot from the orchestrator. */
  readonly progress = input.required<ScanProgress>();
  /** Best-effort tip ledger; null when the rippled node is silent. */
  readonly currentLedger = input<number | null>(null);
  /**
   * `null` (still booting) or a number = cached cursor we're resuming
   * from. Undefined → cold scan.
   */
  readonly cachedFromLedger = input<number | null>(null);

  @Output() readonly cancel = new EventEmitter<void>();

  readonly cacheLabel = computed<'cold' | 'warm'>(() =>
    this.cachedFromLedger() === null ? 'cold' : 'warm',
  );

  readonly percent = computed<number | null>(() => {
    const tip = this.currentLedger();
    if (tip === null || tip <= 0) return null;
    const walked = this.progress().ledgersWalked;
    const pct = Math.round((walked / tip) * 100);
    return Math.max(0, Math.min(100, pct));
  });

  formatNumber(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }
}
