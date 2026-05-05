import { TestBed } from '@angular/core/testing';

import type { VerificationResult } from '../../core/verifier-types';
import { VerifyIndependentlyComponent } from './verify-independently.component';

const result: VerificationResult = {
  fileName: 'evidence.mp4',
  fileSizeBytes: 2048,
  fileSha256: 'a'.repeat(64),
  tier1: {
    status: 'verified',
    anchor: {
      txHash: 'A'.repeat(64),
      ledgerIndex: 1,
      ledgerCloseTimeUtc: '2026-05-04T00:00:00Z',
      account: 'rExample',
      network: 'mainnet',
    },
  },
  tier2: { status: 'verified', signerKeyId: 'platform-2026-04' },
  tier3: {
    status: 'verified',
    upgrade: { txHash: 'C'.repeat(64), ledgerIndex: 2 },
  },
  manifest: {
    vehicleEventId: '00000000-0000-0000-0000-000000000000',
  },
  elapsedMs: 1,
};

describe('VerifyIndependentlyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifyIndependentlyComponent],
    }).compileComponents();
  });

  it('is collapsed by default and expands on header click', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=block-curl]'),
    ).toBeFalsy();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=block-curl]'),
    ).toBeTruthy();
  });

  it('substitutes the anchor tx hash, signer key id, event id, and rippled URL into the blocks', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    fixture.componentRef.setInput('result', result);
    fixture.componentRef.setInput('rippledUrl', 'https://xrplcluster.com');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('A'.repeat(64));
    expect(text).toContain('platform-2026-04');
    expect(text).toContain('platform-2026-04.pem');
    expect(text).toContain('event-00000000-0000-0000-0000-000000000000.ots');
    expect(text).toContain('https://xrplcluster.com');
  });

  it('substitutes the OTS upgrade tx hash into the ots block', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const otsBlock = fixture.nativeElement.querySelector(
      '[data-testid=block-ots]',
    ) as HTMLElement;
    expect(otsBlock).toBeTruthy();
    expect(otsBlock.textContent).toContain('C'.repeat(64));
    expect(otsBlock.textContent).toContain('ots verify');
  });

  it('uses the testnet explorer when the anchor network is testnet', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    const testnet: VerificationResult = {
      ...result,
      tier1: {
        ...result.tier1,
        anchor: { ...result.tier1.anchor!, network: 'testnet' },
      },
    };
    fixture.componentRef.setInput('result', testnet);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('testnet.xrpl.org');
  });

  it('renders four code blocks (hash / curl / openssl / ots) with copy buttons', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelectorAll('pre').length,
    ).toBe(4);
    expect(
      fixture.nativeElement.querySelector('[data-testid=block-hash]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid=block-openssl]'),
    ).toBeTruthy();
  });

  it('exposes a Copy button per block (no live execution)', () => {
    const fixture = TestBed.createComponent(VerifyIndependentlyComponent);
    fixture.componentRef.setInput('result', result);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const copyButtons = Array.from(
      fixture.nativeElement.querySelectorAll('button[aria-label^="Copy "]'),
    ) as HTMLButtonElement[];
    expect(copyButtons.length).toBe(4);
  });
});
