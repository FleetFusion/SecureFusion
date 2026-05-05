import { Component, EventEmitter, Output, computed, input } from '@angular/core';

/**
 * Cancellable progress indicator for the hashing phase.
 *
 * Driven by signal inputs from the parent (the verify page subscribes to
 * the orchestrator's `Observable<VerificationEvent>` and pushes the
 * latest `kind: 'hashing'` frame's bytes-processed snapshot into here).
 * That keeps this component dumb / pure: zero RxJS, zero side effects.
 *
 * Emits `(cancel)` when the user clicks the cancel button. The parent
 * is responsible for actually aborting the AbortController.
 *
 * Accessibility:
 * - The progress bar has `role="progressbar"` with `aria-valuenow`,
 *   `aria-valuemin=0`, `aria-valuemax=100`.
 * - Cancel button has an explicit `aria-label`.
 */
@Component({
  standalone: true,
  selector: 'app-hashing-progress',
  template: `
    <section
      class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      aria-busy="true"
    >
      <div class="mb-2 flex items-baseline justify-between">
        <h2 class="text-lg font-semibold text-gray-900">{{ label() }}</h2>
        <span class="text-sm tabular-nums text-gray-600"
          >{{ percent() }} %</span
        >
      </div>

      <div
        role="progressbar"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Hashing progress"
        class="h-3 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div
          class="h-full rounded-full bg-ff-green transition-all duration-200"
          [style.width.%]="percent()"
        ></div>
      </div>

      <div
        class="mt-3 flex flex-col items-start gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between"
      >
        <span class="tabular-nums">
          {{ formatBytes(bytesProcessed()) }} / {{ formatBytes(totalBytes()) }}
          @if (etaSeconds() !== null) {
            <span class="ml-2 text-gray-500"
              >&middot; ETA {{ formatEta(etaSeconds()!) }}</span
            >
          }
        </span>
        <button
          type="button"
          data-testid="cancel-btn"
          aria-label="Cancel hashing"
          class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          (click)="cancel.emit()"
        >
          Cancel
        </button>
      </div>
    </section>
  `,
})
export class HashingProgressComponent {
  readonly bytesProcessed = input.required<number>();
  readonly totalBytes = input.required<number>();
  readonly label = input<string>('Hashing video');
  /** Optional ETA in seconds; when null the ETA chip is hidden. */
  readonly etaSeconds = input<number | null>(null);

  @Output() readonly cancel = new EventEmitter<void>();

  readonly percent = computed(() => {
    const total = this.totalBytes();
    if (total <= 0) return 0;
    const fraction = this.bytesProcessed() / total;
    return Math.max(0, Math.min(100, Math.round(fraction * 100)));
  });

  /** Pretty-print byte counts as KB / MB / GB. */
  formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /** Format ETA seconds as `1m 23s` or `45s`. */
  formatEta(seconds: number): string {
    if (seconds < 1) return '<1s';
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  }
}
