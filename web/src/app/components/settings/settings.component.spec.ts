import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';

import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsService,
} from '../../core/settings';
import { TRUST_ANCHOR_LOADER } from '../../pages/verify/verify.page';
import {
  PURGE_SCAN_CACHE_FN,
  SettingsPanelComponent,
} from './settings.component';

const dummyBundle = {
  xrplAccount: 'rTestAccount',
  network: 'mainnet' as const,
  specVersion: 'sf1' as const,
  bitcoinProofMode: 'xrpl-sf1ots' as const,
  registry: [],
};

function makeFixture(opts?: { purgeSpy?: jasmine.Spy }) {
  const purge = opts?.purgeSpy ?? jasmine.createSpy('purge').and.resolveTo(undefined);
  TestBed.configureTestingModule({
    imports: [SettingsPanelComponent],
    providers: [
      {
        provide: TRUST_ANCHOR_LOADER,
        useValue: () => Promise.resolve(dummyBundle),
      },
      {
        provide: PURGE_SCAN_CACHE_FN,
        useValue: purge,
      },
    ],
  });
  const fixture = TestBed.createComponent(SettingsPanelComponent);
  fixture.componentInstance.open = true;
  fixture.componentInstance.ngOnChanges();
  fixture.detectChanges();
  return { fixture, purge };
}

describe('SettingsPanelComponent', () => {
  beforeEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('renders the dialog with role + aria-modal', () => {
    const { fixture } = makeFixture();
    const dialog = fixture.nativeElement.querySelector(
      '[data-testid="settings-panel"]',
    ) as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('emits close when the X button is clicked', () => {
    const { fixture } = makeFixture();
    const closeSpy = jasmine.createSpy('close');
    fixture.componentInstance.close.subscribe(closeSpy);
    const x = fixture.nativeElement.querySelector(
      '[data-testid="settings-close"]',
    ) as HTMLButtonElement;
    x.click();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('saves rippledUrl change to SettingsService', () => {
    const { fixture } = makeFixture();
    fixture.componentInstance.onField('rippledUrl', 'https://node-a.example.com');
    fixture.detectChanges();

    const save = fixture.nativeElement.querySelector(
      '[data-testid="settings-save"]',
    ) as HTMLButtonElement;
    save.click();
    fixture.detectChanges();

    expect(TestBed.inject(SettingsService).get().rippledUrl).toBe(
      'https://node-a.example.com',
    );
    expect(
      fixture.nativeElement.querySelector('[data-testid="settings-saved"]'),
    ).toBeTruthy();
  });

  it('rejects http:// URLs with an inline error and does NOT persist', () => {
    const { fixture } = makeFixture();
    fixture.componentInstance.onField('rippledUrl', 'http://insecure.example.com');
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        '[data-testid="settings-save"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    const errorEl = fixture.nativeElement.querySelector(
      '[data-testid="settings-error"]',
    );
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toMatch(/https/i);
    // Service is unchanged.
    expect(TestBed.inject(SettingsService).get().rippledUrl).toBe(
      DEFAULT_SETTINGS.rippledUrl,
    );
  });

  it('reset button reverts UI + service to defaults', () => {
    const { fixture } = makeFixture();
    const svc = TestBed.inject(SettingsService);
    svc.set({ rippledUrl: 'https://kept.example.com' });
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        '[data-testid="settings-reset"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(svc.get().rippledUrl).toBe(DEFAULT_SETTINGS.rippledUrl);
  });

  it('shows the trust-anchor URL input only when source = url', () => {
    const { fixture } = makeFixture();
    expect(
      fixture.nativeElement.querySelector('[data-testid="anchor-url-input"]'),
    ).toBeFalsy();

    (
      fixture.nativeElement.querySelector(
        '[data-testid="anchor-url-radio"]',
      ) as HTMLInputElement
    ).click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="anchor-url-input"]'),
    ).toBeTruthy();
  });

  it('emits close on document ESC keydown', () => {
    const { fixture } = makeFixture();
    const closeSpy = jasmine.createSpy('close');
    fixture.componentInstance.close.subscribe(closeSpy);
    fixture.componentInstance.onEscape();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('cycles focus on shift+tab from the first focusable element', () => {
    const { fixture } = makeFixture();
    const inputs = (
      fixture.nativeElement as HTMLElement
    ).querySelectorAll<HTMLElement>(
      '[data-testid="settings-panel"] input, [data-testid="settings-panel"] button',
    );
    expect(inputs.length).toBeGreaterThan(1);
    inputs[0].focus();
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    fixture.componentInstance.onTab(event);
    expect(event.defaultPrevented).toBeTrue();
  });

  it('Cache section: clear button shows confirm, then yes calls purgeScanCache', fakeAsync(() => {
    const purge = jasmine
      .createSpy('purge')
      .and.callFake(() => Promise.resolve());
    const { fixture } = makeFixture({ purgeSpy: purge });
    flushMicrotasks();
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector(
        '[data-testid="cache-clear"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="cache-confirm"]'),
    ).toBeTruthy();

    (
      fixture.nativeElement.querySelector(
        '[data-testid="cache-confirm-yes"]',
      ) as HTMLButtonElement
    ).click();
    flushMicrotasks();
    tick();
    fixture.detectChanges();
    expect(purge).toHaveBeenCalledWith('rTestAccount', jasmine.any(String));
    expect(
      fixture.nativeElement.querySelector('[data-testid="cache-cleared-toast"]'),
    ).toBeTruthy();
  }));

  it('Cache section: confirm "no" cancels and does NOT call purgeScanCache', () => {
    const purge = jasmine.createSpy('purge').and.resolveTo(undefined);
    const { fixture } = makeFixture({ purgeSpy: purge });

    (
      fixture.nativeElement.querySelector(
        '[data-testid="cache-clear"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="cache-confirm-no"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(purge).not.toHaveBeenCalled();
    expect(
      fixture.nativeElement.querySelector('[data-testid="cache-confirm"]'),
    ).toBeFalsy();
  });
});
