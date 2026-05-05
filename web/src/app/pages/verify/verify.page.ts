import {
  Component,
  InjectionToken,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Subscription, type Observable } from 'rxjs';

import { DropZoneComponent } from '../../components/drop-zone/drop-zone.component';
import { HashingProgressComponent } from '../../components/hashing-progress/hashing-progress.component';
import { ManifestDetailComponent } from '../../components/manifest-detail/manifest-detail.component';
import { ResultTiersComponent } from '../../components/result-tiers/result-tiers.component';
import { ScanProgressComponent } from '../../components/scan-progress/scan-progress.component';
import { VerifyIndependentlyComponent } from '../../components/verify-independently/verify-independently.component';
import { SettingsService } from '../../core/settings';
import { loadTrustAnchors, type TrustAnchorBundle } from '../../core/trust-anchors';
import type {
  ScanProgress,
  VerificationEvent,
  VerificationResult,
  VerifyOptions,
} from '../../core/verifier-types';
import { verifyVideo as defaultVerifyVideo } from '../../core/verify';

/** State machine state for the verify page. */
type VerifyState = 'idle' | 'hashing' | 'scanning' | 'verified' | 'failed';

/**
 * DI token for the orchestrator function. Tests bind a fake; production
 * uses the real `verifyVideo` from `core/verify.ts`.
 */
export const VERIFY_VIDEO_FN = new InjectionToken<
  (opts: VerifyOptions) => Observable<VerificationEvent>
>('VERIFY_VIDEO_FN', {
  providedIn: 'root',
  factory: () => defaultVerifyVideo,
});

/**
 * DI token for the trust-anchor loader. Tests inject a fake; production
 * fetches from `assets/trust-anchors/platform-account.json`.
 */
export const TRUST_ANCHOR_LOADER = new InjectionToken<
  () => Promise<TrustAnchorBundle>
>('TRUST_ANCHOR_LOADER', {
  providedIn: 'root',
  factory: () => loadTrustAnchors,
});

/**
 * Verify page (route '/').
 *
 * State flow:
 *   idle → drop file → hashing → scanning → verified | failed
 *
 * The page subscribes to `verifyVideo()`'s observable and routes each
 * frame:
 *   - kind=hashing  → bytes-processed snapshot for HashingProgress
 *   - kind=cache-hit → jump to verified prep
 *   - kind=scanning → ledger counters
 *   - kind=tier1/tier2/tier3 → progressive result reveal (final
 *                              terminal frame supersedes these)
 *   - type=result   → final VerificationResult
 *
 * Cancellation is handled at three levels:
 *   1. The user can click "Cancel" in HashingProgress, which calls
 *      `cancel()` and unsubscribes.
 *   2. Picking a different file mid-flow auto-cancels the prior run.
 *   3. The component teardown unsubscribes (handled by Angular).
 */
@Component({
  standalone: true,
  selector: 'app-verify-page',
  imports: [
    DropZoneComponent,
    HashingProgressComponent,
    ScanProgressComponent,
    ResultTiersComponent,
    ManifestDetailComponent,
    VerifyIndependentlyComponent,
  ],
  template: `
    <div class="space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-bold text-gray-900">SecureFusion Verifier</h1>
        <p class="text-sm text-gray-600">
          Drop a SecureFusion-signed video to verify it against XRPL and
          Bitcoin. The file never leaves your browser.
        </p>
      </header>

      @if (state() === 'idle') {
        <app-drop-zone (fileSelected)="onFile($event)" />
      } @else if (state() === 'hashing') {
        <app-hashing-progress
          [bytesProcessed]="bytesProcessed()"
          [totalBytes]="totalBytes()"
          label="Hashing video"
          (cancel)="cancel()"
        />
      } @else if (state() === 'scanning') {
        <app-scan-progress
          [progress]="scan()"
          [currentLedger]="currentLedger()"
          [cachedFromLedger]="cachedFromLedger()"
          (cancel)="cancel()"
        />
      } @else if (state() === 'verified' && finalResult()) {
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm text-gray-600">
              File:
              <span class="font-mono">{{ finalResult()!.fileName }}</span> ·
              SHA-256
              <span class="font-mono text-xs">{{
                finalResult()!.fileSha256.slice(0, 16)
              }}…</span>
            </p>
            <button
              type="button"
              data-testid="verify-another"
              class="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
              (click)="reset()"
            >
              Verify another
            </button>
          </div>
          <app-result-tiers
            [result]="finalResult()!"
            [organisation]="organisation()"
          />
          <app-manifest-detail [result]="finalResult()!" />
          <app-verify-independently
            [result]="finalResult()!"
            [rippledUrl]="rippledUrl()"
          />
        </div>
      } @else if (state() === 'failed') {
        <section
          role="alert"
          class="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900"
        >
          <h2 class="text-lg font-semibold">Verification failed</h2>
          <p class="mt-1 text-sm">{{ errorMessage() }}</p>
          <button
            type="button"
            data-testid="retry"
            class="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-100"
            (click)="reset()"
          >
            Try another file
          </button>
        </section>
      }
    </div>
  `,
})
export class VerifyPage {
  /** Allow tests to swap the orchestrator. */
  private readonly verifyVideoFn = inject(VERIFY_VIDEO_FN);
  private readonly trustAnchorLoader = inject(TRUST_ANCHOR_LOADER);
  private readonly settingsService = inject(SettingsService);

  readonly state = signal<VerifyState>('idle');
  readonly bytesProcessed = signal(0);
  readonly totalBytes = signal(0);
  readonly scan = signal<ScanProgress>({
    ledgersWalked: 0,
    txsDecoded: 0,
    cursor: 0,
  });
  readonly finalResult = signal<VerificationResult | null>(null);
  readonly errorMessage = signal<string>('');
  /**
   * Read-only mirror of the user's chosen rippled URL. Updates whenever
   * the SettingsService emits. Used by the "Verify independently" panel
   * to show the rippled URL in the curl examples.
   */
  readonly rippledUrl = signal<string>(
    this.settingsService.get().rippledUrl,
  );
  /** Best-effort tip ledger for the scan-progress percent bar. */
  readonly currentLedger = signal<number | null>(null);
  /** Cached cursor we resumed from (null = cold scan). */
  readonly cachedFromLedger = signal<number | null>(null);

  /** Trust-anchor bundle, lazily loaded on first verify. */
  private cachedBundle: TrustAnchorBundle | null = null;
  /** Active subscription so we can unsubscribe / cancel. */
  private currentSub: Subscription | null = null;

  readonly organisation = computed(() => {
    const bundle = this.cachedBundle;
    if (!bundle) return null;
    const result = this.finalResult();
    if (!result?.tier1.anchor) return null;
    const entry = bundle.registry.find(
      (e) => e.xrplAccount === result.tier1.anchor!.account,
    );
    return entry?.organisation ?? null;
  });

  /** Drop-zone handler. Cancels any in-flight verification first. */
  async onFile(file: File): Promise<void> {
    this.cancel();
    this.bytesProcessed.set(0);
    this.totalBytes.set(file.size);
    this.scan.set({ ledgersWalked: 0, txsDecoded: 0, cursor: 0 });
    this.finalResult.set(null);
    this.errorMessage.set('');
    this.state.set('hashing');

    let bundle: TrustAnchorBundle;
    try {
      bundle = this.cachedBundle ?? (await this.trustAnchorLoader());
      this.cachedBundle = bundle;
    } catch (err) {
      this.errorMessage.set(
        `Failed to load trust anchors: ${(err as Error).message ?? String(err)}`,
      );
      this.state.set('failed');
      return;
    }

    // Snapshot settings at the start of the run; mid-flight changes
    // shouldn't perturb the in-flight verification.
    const settings = this.settingsService.get();
    this.rippledUrl.set(settings.rippledUrl);

    const obs = this.verifyVideoFn({
      file,
      fileName: file.name,
      trustAnchorBundle: {
        xrplAccount: bundle.xrplAccount,
        registry: bundle.registry,
      },
      rippledUrl: settings.rippledUrl,
      otsCalendarUrl: settings.otsCalendarUrl,
    });

    this.currentSub = obs.subscribe({
      next: (event) => this.handleEvent(event),
      error: (err) => {
        const msg = (err as Error)?.message ?? String(err);
        if (msg === 'aborted' || (err as DOMException)?.name === 'AbortError') {
          // User cancelled — return to idle silently.
          this.state.set('idle');
          return;
        }
        this.errorMessage.set(msg);
        this.state.set('failed');
      },
    });
  }

  /** Cancel the in-flight verification (if any). */
  cancel(): void {
    if (this.currentSub) {
      this.currentSub.unsubscribe();
      this.currentSub = null;
    }
    if (this.state() !== 'verified' && this.state() !== 'failed') {
      this.state.set('idle');
    }
  }

  /** Reset to idle so the user can verify another file. */
  reset(): void {
    this.cancel();
    this.finalResult.set(null);
    this.errorMessage.set('');
    this.state.set('idle');
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('en-US').format(n);
  }

  private handleEvent(event: VerificationEvent): void {
    if (event.type === 'progress') {
      switch (event.kind) {
        case 'hashing': {
          this.totalBytes.set(event.fileSize);
          this.bytesProcessed.set(Math.round(event.fileSize * event.fraction));
          if (this.state() !== 'hashing') this.state.set('hashing');
          break;
        }
        case 'cache-hit': {
          // Cache hit short-circuits the scan — move straight to scanning
          // state for a moment so the UI doesn't jitter back to idle.
          this.state.set('scanning');
          break;
        }
        case 'scanning': {
          this.scan.set({
            ledgersWalked: event.ledgersWalked,
            txsDecoded: event.txsDecoded,
            cursor: event.cursor,
          });
          if (this.state() !== 'scanning') this.state.set('scanning');
          break;
        }
        case 'tier1':
        case 'tier2':
        case 'tier3':
          // Progressive frames — the terminal `result` event carries the
          // merged view; we don't need to mutate UI here.
          break;
      }
      return;
    }

    if (event.type === 'result') {
      const { type: _type, ...rest } = event;
      this.finalResult.set(rest);
      this.state.set('verified');
    }
  }
}
