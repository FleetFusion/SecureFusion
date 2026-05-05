import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Inject,
  InjectionToken,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import {
  getCacheMeta,
  purgeScanCache as defaultPurgeScanCache,
} from '../../core/scan-cache';
import {
  DEFAULT_SETTINGS,
  SettingsService,
  type VerifierSettings,
} from '../../core/settings';
import { TRUST_ANCHOR_LOADER } from '../../pages/verify/verify.page';

/**
 * Slide-over settings panel. Renders inside a custom modal shell so we
 * can fully control focus trap + ESC handling without depending on the
 * native `<dialog>` element (browser support for focus trapping inside
 * `<dialog>` is uneven and Angular's CDK overlay isn't pulled in by the
 * verifier SPA — we keep the dependency surface to Tailwind-only).
 *
 * Accessibility:
 * - `role="dialog"` + `aria-modal="true"` on the panel container.
 * - The first focusable control is auto-focused on open.
 * - Tab + Shift+Tab cycle within the panel (focus trap).
 * - ESC closes and the trigger button regains focus (the parent header
 *   is responsible for the latter — we just emit `(close)`).
 */
@Component({
  standalone: true,
  selector: 'app-settings-panel',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open) {
      <div
        class="fixed inset-0 z-50 flex"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings-panel"
      >
        <button
          type="button"
          class="flex-1 cursor-default bg-black/40"
          aria-label="Close settings backdrop"
          tabindex="-1"
          (click)="closePanel()"
        ></button>
        <div
          #panel
          class="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
          (keydown.escape)="closePanel()"
        >
          <header
            class="flex items-center justify-between border-b border-gray-200 px-6 py-4"
          >
            <h2 id="settings-title" class="text-lg font-semibold text-gray-900">
              Settings
            </h2>
            <button
              type="button"
              data-testid="settings-close"
              aria-label="Close settings"
              class="rounded-md border border-gray-300 bg-white p-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
              (click)="closePanel()"
            >
              <svg
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M4.3 4.3a1 1 0 0 1 1.4 0L10 8.6l4.3-4.3a1 1 0 1 1 1.4 1.4L11.4 10l4.3 4.3a1 1 0 0 1-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 1 1-1.4-1.4L8.6 10 4.3 5.7a1 1 0 0 1 0-1.4Z"
                />
              </svg>
            </button>
          </header>

          <form
            class="flex flex-col gap-4 px-6 py-4"
            (ngSubmit)="save()"
            (keydown.enter)="$event.preventDefault()"
          >
            <fieldset class="flex flex-col gap-2">
              <label for="rippled-url" class="text-sm font-medium text-gray-800"
                >rippled URL</label
              >
              <input
                #firstField
                id="rippled-url"
                name="rippledUrl"
                type="url"
                data-testid="rippled-url"
                class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ff-green focus:outline-none focus:ring-1 focus:ring-ff-green"
                [(ngModel)]="form().rippledUrl"
                (ngModelChange)="onField('rippledUrl', $event)"
              />
              <p class="text-xs text-gray-500">
                JSON-RPC endpoint. Must use https://.
              </p>
            </fieldset>

            <fieldset class="flex flex-col gap-2">
              <label for="ots-url" class="text-sm font-medium text-gray-800"
                >OpenTimestamps calendar URL</label
              >
              <input
                id="ots-url"
                name="otsCalendarUrl"
                type="url"
                data-testid="ots-url"
                class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ff-green focus:outline-none focus:ring-1 focus:ring-ff-green"
                [(ngModel)]="form().otsCalendarUrl"
                (ngModelChange)="onField('otsCalendarUrl', $event)"
              />
            </fieldset>

            <fieldset class="flex flex-col gap-2">
              <legend class="text-sm font-medium text-gray-800">
                Trust anchor source
              </legend>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="trustAnchorSource"
                  value="bundled"
                  data-testid="anchor-bundled"
                  [checked]="form().trustAnchorSource === 'bundled'"
                  (change)="onField('trustAnchorSource', 'bundled')"
                />
                <span>Bundled (recommended)</span>
              </label>
              <label class="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="trustAnchorSource"
                  value="url"
                  data-testid="anchor-url-radio"
                  [checked]="form().trustAnchorSource === 'url'"
                  (change)="onField('trustAnchorSource', 'url')"
                />
                <span>External URL</span>
              </label>
              @if (form().trustAnchorSource === 'url') {
                <input
                  name="trustAnchorUrl"
                  type="url"
                  data-testid="anchor-url-input"
                  placeholder="https://anchors.example.com/bundle.json"
                  class="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-ff-green focus:outline-none focus:ring-1 focus:ring-ff-green"
                  [(ngModel)]="form().trustAnchorUrl"
                  (ngModelChange)="onField('trustAnchorUrl', $event)"
                />
              }
            </fieldset>

            @if (errorMessage()) {
              <p
                role="alert"
                data-testid="settings-error"
                class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {{ errorMessage() }}
              </p>
            }

            @if (savedFlash()) {
              <p
                data-testid="settings-saved"
                class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              >
                Settings saved.
              </p>
            }

            <div class="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="settings-reset"
                class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
                (click)="resetDefaults()"
              >
                Reset to defaults
              </button>
              <button
                type="submit"
                data-testid="settings-save"
                class="rounded-md border border-transparent bg-ff-green px-3 py-2 text-sm font-medium text-white hover:bg-ff-green/90 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
              >
                Save
              </button>
            </div>
          </form>

          <section class="mt-2 border-t border-gray-200 px-6 py-4">
            <h3 class="text-sm font-semibold text-gray-800">Cache</h3>
            <dl class="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
              <dt>Last cursor</dt>
              <dd
                class="font-mono tabular-nums"
                data-testid="cache-cursor"
              >
                @if (cacheCursor() === null) {
                  <span class="text-gray-400">none</span>
                } @else {
                  {{ cacheCursor() }}
                }
              </dd>
              <dt>Last scan</dt>
              <dd data-testid="cache-time">
                @if (cacheTime() === null) {
                  <span class="text-gray-400">never</span>
                } @else {
                  {{ cacheTime() }}
                }
              </dd>
            </dl>

            @if (clearConfirm()) {
              <div
                class="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900"
                data-testid="cache-confirm"
              >
                <p class="font-medium">Clear scan cache?</p>
                <p class="mt-1 text-xs">
                  Next verification will rescan from the beginning. This may
                  take longer.
                </p>
                <div class="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid="cache-confirm-yes"
                    class="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
                    (click)="clearCacheConfirmed()"
                  >
                    Yes, clear cache
                  </button>
                  <button
                    type="button"
                    data-testid="cache-confirm-no"
                    class="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
                    (click)="cancelClear()"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            } @else {
              <button
                type="button"
                data-testid="cache-clear"
                class="mt-3 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
                (click)="askClear()"
              >
                Clear cache
              </button>
            }

            @if (cacheCleared()) {
              <p
                role="status"
                data-testid="cache-cleared-toast"
                class="mt-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"
              >
                Cache cleared.
              </p>
            }
          </section>
        </div>
      </div>
    }
  `,
})
export class SettingsPanelComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  private readonly settingsService = inject(SettingsService);
  private readonly trustAnchorLoader = inject(TRUST_ANCHOR_LOADER);

  /** Whether the panel is currently rendered. */
  @Input() open = false;
  @Output() readonly close = new EventEmitter<void>();

  @ViewChild('panel') panelRef?: ElementRef<HTMLElement>;
  @ViewChild('firstField') firstFieldRef?: ElementRef<HTMLInputElement>;

  /** Live edit copy of the settings; only saved on Save click. */
  readonly form = signal<VerifierSettings>({
    ...DEFAULT_SETTINGS,
    rippledFallbackUrls: [],
  });
  readonly errorMessage = signal<string>('');
  readonly savedFlash = signal<boolean>(false);

  // Cache section state.
  readonly cacheCursor = signal<number | null>(null);
  readonly cacheTime = signal<string | null>(null);
  readonly clearConfirm = signal(false);
  readonly cacheCleared = signal(false);

  private subscription?: Subscription;

  constructor(
    @Inject(PURGE_SCAN_CACHE_FN)
    private readonly purgeScanCacheFn: (
      account: string,
      rippledUrl?: string,
    ) => Promise<void>,
  ) {
    this.subscription = this.settingsService.observe().subscribe((s) => {
      this.form.set({ ...s, rippledFallbackUrls: [...s.rippledFallbackUrls] });
    });
  }

  ngAfterViewInit(): void {
    if (this.open) this.focusFirst();
  }

  ngOnChanges(): void {
    if (this.open) {
      // Reset transient feedback when re-opened.
      this.errorMessage.set('');
      this.savedFlash.set(false);
      this.cacheCleared.set(false);
      this.clearConfirm.set(false);
      void this.refreshCacheMeta();
      queueMicrotask(() => this.focusFirst());
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** ESC handler when the focus is on the panel root. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.closePanel();
  }

  /** Focus-trap: keep TAB cycling inside the panel. */
  @HostListener('document:keydown.tab', ['$event'])
  @HostListener('document:keydown.shift.tab', ['$event'])
  onTab(eventArg: Event): void {
    const event = eventArg as KeyboardEvent;
    if (!this.open || !this.panelRef) return;
    const root = this.panelRef.nativeElement;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  closePanel(): void {
    this.close.emit();
  }

  onField<K extends keyof VerifierSettings>(
    key: K,
    value: VerifierSettings[K],
  ): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    this.errorMessage.set('');
    this.savedFlash.set(false);
  }

  save(): void {
    try {
      this.settingsService.set(this.form());
      this.savedFlash.set(true);
      this.errorMessage.set('');
    } catch (err) {
      this.errorMessage.set((err as Error).message ?? String(err));
      this.savedFlash.set(false);
    }
  }

  resetDefaults(): void {
    this.settingsService.reset();
    this.errorMessage.set('');
    this.savedFlash.set(true);
  }

  askClear(): void {
    this.clearConfirm.set(true);
    this.cacheCleared.set(false);
  }

  cancelClear(): void {
    this.clearConfirm.set(false);
  }

  async clearCacheConfirmed(): Promise<void> {
    this.clearConfirm.set(false);
    try {
      const bundle = await this.trustAnchorLoader();
      await this.purgeScanCacheFn(
        bundle.xrplAccount,
        this.settingsService.get().rippledUrl,
      );
      this.cacheCleared.set(true);
      await this.refreshCacheMeta();
    } catch (err) {
      this.errorMessage.set(
        `Failed to clear cache: ${(err as Error).message ?? String(err)}`,
      );
    }
  }

  /** Re-read the cache cursor for the current account/rippled URL. */
  private async refreshCacheMeta(): Promise<void> {
    try {
      const bundle = await this.trustAnchorLoader();
      const rippledUrl = this.settingsService.get().rippledUrl;
      const meta = await getCacheMeta(bundle.xrplAccount, rippledUrl);
      this.cacheCursor.set(meta.cursor);
      this.cacheTime.set(meta.lastUpdatedIso);
    } catch {
      this.cacheCursor.set(null);
      this.cacheTime.set(null);
    }
  }

  private focusFirst(): void {
    this.firstFieldRef?.nativeElement.focus();
  }
}

/**
 * DI token so tests can fake out the IndexedDB purge without touching
 * fake-indexeddb. Production uses `purgeScanCache` from `core/scan-cache`.
 */
export const PURGE_SCAN_CACHE_FN = new InjectionToken<
  (account: string, rippledUrl?: string) => Promise<void>
>('PURGE_SCAN_CACHE_FN', {
  providedIn: 'root',
  factory: () => defaultPurgeScanCache,
});
