import { TestBed } from '@angular/core/testing';

import { ScanProgressComponent } from './scan-progress.component';

function makeFixture(opts: {
  ledgersWalked: number;
  txsDecoded: number;
  cursor: number;
  currentLedger?: number | null;
  cachedFromLedger?: number | null;
}) {
  TestBed.configureTestingModule({ imports: [ScanProgressComponent] });
  const fixture = TestBed.createComponent(ScanProgressComponent);
  fixture.componentRef.setInput('progress', {
    ledgersWalked: opts.ledgersWalked,
    txsDecoded: opts.txsDecoded,
    cursor: opts.cursor,
  });
  if (opts.currentLedger !== undefined) {
    fixture.componentRef.setInput('currentLedger', opts.currentLedger);
  }
  if (opts.cachedFromLedger !== undefined) {
    fixture.componentRef.setInput('cachedFromLedger', opts.cachedFromLedger);
  }
  fixture.detectChanges();
  return fixture;
}

describe('ScanProgressComponent', () => {
  it('renders the "Scanning XRPL..." headline + ledger counters', () => {
    const fixture = makeFixture({
      ledgersWalked: 1234,
      txsDecoded: 5,
      cursor: 1234,
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Scanning XRPL...');
    expect(
      fixture.nativeElement.querySelector('[data-testid="scan-ledgers"]')
        .textContent,
    ).toContain('1,234');
    expect(
      fixture.nativeElement.querySelector('[data-testid="scan-txs"]')
        .textContent,
    ).toContain('5');
  });

  it('shows the spinner (no progress bar) when currentLedger is null', () => {
    const fixture = makeFixture({
      ledgersWalked: 100,
      txsDecoded: 0,
      cursor: 100,
      currentLedger: null,
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="scan-spinner"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[role="progressbar"]'),
    ).toBeFalsy();
  });

  it('shows a percent bar when currentLedger is known', () => {
    const fixture = makeFixture({
      ledgersWalked: 50,
      txsDecoded: 0,
      cursor: 50,
      currentLedger: 100,
    });
    const bar = fixture.nativeElement.querySelector('[role="progressbar"]');
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
  });

  it('renders the cold-cache hint by default', () => {
    const fixture = makeFixture({
      ledgersWalked: 0,
      txsDecoded: 0,
      cursor: 0,
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="scan-cache-state"]')
        .textContent,
    ).toContain('First scan');
  });

  it('renders the warm-cache hint when cachedFromLedger is provided', () => {
    const fixture = makeFixture({
      ledgersWalked: 100,
      txsDecoded: 0,
      cursor: 12450,
      cachedFromLedger: 12345,
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="scan-cache-state"]')
        .textContent,
    ).toContain('Incremental scan from cached ledger 12,345');
  });

  it('emits (cancel) when the cancel button is clicked', () => {
    const fixture = makeFixture({
      ledgersWalked: 0,
      txsDecoded: 0,
      cursor: 0,
    });
    const spy = jasmine.createSpy('cancel');
    fixture.componentInstance.cancel.subscribe(spy);
    (
      fixture.nativeElement.querySelector(
        '[data-testid="scan-cancel"]',
      ) as HTMLButtonElement
    ).click();
    expect(spy).toHaveBeenCalled();
  });
});
