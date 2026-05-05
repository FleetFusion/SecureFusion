import { TestBed } from '@angular/core/testing';
import { firstValueFrom, take, toArray } from 'rxjs';

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsService,
  type VerifierSettings,
} from './settings';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
  });

  afterEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('returns defaults when localStorage is empty', () => {
    const got = service.get();
    expect(got.rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
    expect(got.otsCalendarUrl).toBe(DEFAULT_SETTINGS.otsCalendarUrl);
    expect(got.trustAnchorSource).toBe('bundled');
    expect(got.trustAnchorUrl).toBe('');
    expect(got.rippledFallbackUrls).toEqual([]);
  });

  it('round-trips via set/get and persists to localStorage', () => {
    service.set({ rippledUrl: 'https://xrpl.example.com' });
    expect(service.get().rippledUrl).toBe('https://xrpl.example.com');

    // New instance reads the persisted blob:
    const fresh = new SettingsService();
    expect(fresh.get().rippledUrl).toBe('https://xrpl.example.com');
  });

  it('merges partial updates, leaving other fields intact', () => {
    service.set({ rippledUrl: 'https://node-a.example.com' });
    service.set({ otsCalendarUrl: 'https://ots.example.com' });
    const got = service.get();
    expect(got.rippledUrl).toBe('https://node-a.example.com');
    expect(got.otsCalendarUrl).toBe('https://ots.example.com');
  });

  it('reset() restores defaults and persists them', () => {
    service.set({ rippledUrl: 'https://node-a.example.com' });
    service.reset();
    expect(service.get().rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
    const fresh = new SettingsService();
    expect(fresh.get().rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
  });

  it('observe() emits the current value immediately', async () => {
    const first = await firstValueFrom(service.observe());
    expect(first.rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
  });

  it('observe() emits on every set()', async () => {
    const promise = firstValueFrom(service.observe().pipe(take(3), toArray()));
    service.set({ rippledUrl: 'https://a.example.com' });
    service.set({ rippledUrl: 'https://b.example.com' });
    const seen = await promise;
    const urls = seen.map((s: VerifierSettings) => s.rippledUrl);
    expect(urls).toEqual([
      DEFAULT_SETTINGS.rippledUrl,
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('rejects http:// rippledUrl', () => {
    expect(() =>
      service.set({ rippledUrl: 'http://insecure.example.com' }),
    ).toThrowError(/must use https/i);
  });

  it('rejects http:// otsCalendarUrl', () => {
    expect(() =>
      service.set({ otsCalendarUrl: 'http://insecure.example.com' }),
    ).toThrowError(/must use https/i);
  });

  it('requires trustAnchorUrl when trustAnchorSource = "url"', () => {
    expect(() =>
      service.set({ trustAnchorSource: 'url', trustAnchorUrl: '' }),
    ).toThrowError(/required|trustAnchorUrl/i);
  });

  it('rejects http:// trustAnchorUrl when source = url', () => {
    expect(() =>
      service.set({
        trustAnchorSource: 'url',
        trustAnchorUrl: 'http://anchors.example.com/a.json',
      }),
    ).toThrowError(/must use https/i);
  });

  it('rejects malformed URL strings', () => {
    expect(() => service.set({ rippledUrl: 'not-a-url' })).toThrowError(
      /valid URL/i,
    );
  });

  it('falls back to defaults when stored JSON is malformed', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not valid json');
    const fresh = new SettingsService();
    expect(fresh.get().rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
  });

  it('falls back to defaults for an unknown schema version', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ _v: 99, rippledUrl: 'https://x.example.com' }),
    );
    const fresh = new SettingsService();
    expect(fresh.get().rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
  });

  it('treats v1 blob round-trip as a no-op migration', () => {
    const v1 = {
      _v: 1,
      rippledUrl: 'https://kept.example.com',
      rippledFallbackUrls: ['https://b.example.com'],
      otsCalendarUrl: 'https://kept-ots.example.com',
      trustAnchorSource: 'bundled',
      trustAnchorUrl: '',
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(v1));
    const fresh = new SettingsService();
    expect(fresh.get().rippledUrl).toBe('https://kept.example.com');
    expect(fresh.get().rippledFallbackUrls).toEqual(['https://b.example.com']);
  });
});
