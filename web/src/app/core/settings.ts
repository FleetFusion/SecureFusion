/**
 * Verifier settings service.
 *
 * Persists user-tunable knobs (rippled URL, OTS calendar URL, trust
 * anchor source) in `localStorage` under a single schema-versioned key.
 * Per-origin scoping is automatic; settings stay between visits but
 * never leave the browser.
 *
 * The service exposes a synchronous `get()`/`set()` API plus an
 * `observe()` Observable for components that want to react to changes.
 * Storage is a single JSON blob; partial updates merge into the
 * existing record. Schema migrations should bump `STORAGE_KEY`'s
 * trailing version (e.g. `-v2`) and add a migration branch in `read()`.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface VerifierSettings {
  /** rippled JSON-RPC URL. https-only. */
  rippledUrl: string;
  /** Optional N-of-M fallback nodes. Empty = single-node mode. */
  rippledFallbackUrls: string[];
  /** OpenTimestamps calendar URL used for upgrades. https-only. */
  otsCalendarUrl: string;
  /** Where to load the trust anchor bundle from. */
  trustAnchorSource: 'bundled' | 'url';
  /** External URL when `trustAnchorSource === 'url'`. https-only. */
  trustAnchorUrl: string;
}

export const SETTINGS_STORAGE_KEY = 'securefusion-verifier-settings-v1';

export const DEFAULT_SETTINGS: Readonly<VerifierSettings> = Object.freeze({
  rippledUrl: 'https://xrplcluster.com',
  rippledFallbackUrls: [] as string[],
  otsCalendarUrl: 'https://btc.calendar.opentimestamps.org',
  trustAnchorSource: 'bundled' as const,
  trustAnchorUrl: '',
});

interface PersistedV1 extends VerifierSettings {
  /** Schema version stamp inside the blob — guards against silent corruption. */
  _v: 1;
}

/**
 * Validate that a URL string is well-formed and uses https://.
 * Throws a descriptive Error on failure.
 */
export function assertHttpsUrl(value: string, fieldLabel: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${fieldLabel} is required.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldLabel} is not a valid URL.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${fieldLabel} must use https:// (got ${url.protocol}).`);
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly subject: BehaviorSubject<VerifierSettings>;

  constructor() {
    this.subject = new BehaviorSubject<VerifierSettings>(this.read());
  }

  /** Snapshot the current settings (always defined). */
  get(): VerifierSettings {
    return { ...this.subject.value };
  }

  /**
   * Apply a partial update. Validates URL fields with `https://`-only
   * rules; throws synchronously on invalid input so the UI can render
   * an inline error.
   */
  set(partial: Partial<VerifierSettings>): void {
    const next: VerifierSettings = { ...this.subject.value, ...partial };

    // Validate the merged result so callers can update one field at a
    // time but partial updates can never produce an invalid blob.
    assertHttpsUrl(next.rippledUrl, 'rippledUrl');
    assertHttpsUrl(next.otsCalendarUrl, 'otsCalendarUrl');
    if (next.trustAnchorSource === 'url') {
      assertHttpsUrl(next.trustAnchorUrl, 'trustAnchorUrl');
    }
    for (const fallback of next.rippledFallbackUrls) {
      assertHttpsUrl(fallback, 'rippledFallbackUrls[]');
    }

    this.write(next);
    this.subject.next(next);
  }

  /** Restore defaults and broadcast. */
  reset(): void {
    const defaults: VerifierSettings = {
      ...DEFAULT_SETTINGS,
      rippledFallbackUrls: [],
    };
    this.write(defaults);
    this.subject.next(defaults);
  }

  /** Observable feed; emits the current value immediately on subscribe. */
  observe(): Observable<VerifierSettings> {
    return this.subject.asObservable();
  }

  // --- internals ---------------------------------------------------

  private read(): VerifierSettings {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_SETTINGS, rippledFallbackUrls: [] };
    }
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS, rippledFallbackUrls: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Malformed JSON — fall back to defaults rather than crash.
      return { ...DEFAULT_SETTINGS, rippledFallbackUrls: [] };
    }

    if (!isPersistedV1(parsed)) {
      // Future schema migrations branch here. v1 is the only known
      // schema today, so anything else falls back to defaults.
      return { ...DEFAULT_SETTINGS, rippledFallbackUrls: [] };
    }

    return {
      rippledUrl: parsed.rippledUrl,
      rippledFallbackUrls: [...parsed.rippledFallbackUrls],
      otsCalendarUrl: parsed.otsCalendarUrl,
      trustAnchorSource: parsed.trustAnchorSource,
      trustAnchorUrl: parsed.trustAnchorUrl,
    };
  }

  private write(value: VerifierSettings): void {
    if (typeof localStorage === 'undefined') return;
    const blob: PersistedV1 = { _v: 1, ...value };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(blob));
  }
}

function isPersistedV1(value: unknown): value is PersistedV1 {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v['_v'] !== 1) return false;
  if (typeof v['rippledUrl'] !== 'string') return false;
  if (typeof v['otsCalendarUrl'] !== 'string') return false;
  if (v['trustAnchorSource'] !== 'bundled' && v['trustAnchorSource'] !== 'url')
    return false;
  if (typeof v['trustAnchorUrl'] !== 'string') return false;
  if (!Array.isArray(v['rippledFallbackUrls'])) return false;
  if (!v['rippledFallbackUrls'].every((s) => typeof s === 'string')) return false;
  return true;
}
