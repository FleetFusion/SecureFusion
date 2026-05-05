import { TestBed } from '@angular/core/testing';

import type { VerificationResult } from '../../core/verifier-types';
import { ResultTiersComponent } from './result-tiers.component';

const fullyVerified: VerificationResult = {
  fileName: 'good.mp4',
  fileSizeBytes: 1024,
  fileSha256: 'a'.repeat(64),
  tier1: {
    status: 'verified',
    matchedChannelSha: 'a'.repeat(64),
    anchor: {
      txHash: 'B'.repeat(64),
      ledgerIndex: 12345,
      ledgerCloseTimeUtc: '2026-05-04T00:00:00.000Z',
      account: 'rExampleAccount',
      network: 'mainnet',
    },
  },
  tier2: {
    status: 'verified',
    signerKeyId: 'platform-2026-04',
    publicKey: 'c'.repeat(64),
  },
  tier3: {
    status: 'verified',
    bitcoinProofMode: 'xrpl-sf1ots',
    upgrade: { txHash: 'D'.repeat(64), ledgerIndex: 12346 },
    bitcoin: { blockHeight: 800000, blockTimeUtc: '2026-05-04T01:00:00.000Z' },
  },
  elapsedMs: 1234,
};

const notFound: VerificationResult = {
  fileName: 'unknown.mp4',
  fileSizeBytes: 1,
  fileSha256: 'e'.repeat(64),
  tier1: { status: 'not-found' },
  tier2: { status: 'not-applicable' },
  tier3: { status: 'not-applicable' },
  elapsedMs: 100,
};

const attestedOnChain: VerificationResult = {
  ...fullyVerified,
  tier3: {
    status: 'attested-on-chain',
    bitcoinProofMode: 'xrpl-sf1ots',
    upgrade: { txHash: 'D'.repeat(64), ledgerIndex: 12346 },
    reason: 'ots-library-not-installed',
  },
};

const tier1Invalid: VerificationResult = {
  ...notFound,
  tier1: {
    status: 'invalid',
    reason: 'bundle-hash-mismatch',
    bundleHashExpected: 'aa',
    bundleHashActual: 'bb',
  },
};

describe('ResultTiersComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResultTiersComponent],
    }).compileComponents();
  });

  it('renders three tiles for the three tiers', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', fullyVerified);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Hash on XRPL');
    expect(text).toContain('Signed by platform key');
    expect(text).toContain('Bitcoin-attested');
  });

  it('shows green dots when all three tiers are verified', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', fullyVerified);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier1-dot]').classList,
    ).toContain('bg-ff-green');
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier2-dot]').classList,
    ).toContain('bg-ff-green');
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier3-dot]').classList,
    ).toContain('bg-ff-green');
  });

  it('shows grey dots for not-found / not-applicable tiers', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', notFound);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier1-dot]').classList,
    ).toContain('bg-ff-grey');
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier3-dot]').classList,
    ).toContain('bg-ff-grey');
  });

  it('shows an amber dot for Tier-3 attested-on-chain', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', attestedOnChain);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier3-dot]').classList,
    ).toContain('bg-ff-amber');
  });

  it('shows a red dot for Tier-1 invalid', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', tier1Invalid);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid=tier1-dot]').classList,
    ).toContain('bg-ff-red');
  });

  it('expands the Tier-1 tile to show ledger index, close time, and an explorer link on click', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', fullyVerified);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    (buttons[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('12345');
    expect(text).toContain('2026-05-04T00:00:00.000Z');
    const link = fixture.nativeElement.querySelector(
      `a[href="https://livenet.xrpl.org/transactions/${'B'.repeat(64)}"]`,
    );
    expect(link).toBeTruthy();
    expect(link.target).toBe('_blank');
  });

  it('uses the testnet explorer when the anchor network is testnet', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    const testnet: VerificationResult = {
      ...fullyVerified,
      tier1: {
        ...fullyVerified.tier1,
        anchor: { ...fullyVerified.tier1.anchor!, network: 'testnet' },
      },
    };
    fixture.componentRef.setInput('result', testnet);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    (buttons[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      `a[href="https://testnet.xrpl.org/transactions/${'B'.repeat(64)}"]`,
    );
    expect(link).toBeTruthy();
  });

  it('expands Tier-2 to show signer key id and (when provided) organisation', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', fullyVerified);
    fixture.componentRef.setInput('organisation', 'FleetFusion');
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    (buttons[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('platform-2026-04');
    expect(text).toContain('FleetFusion');
  });

  it('expands Tier-3 to show block height + time when verified', () => {
    const fixture = TestBed.createComponent(ResultTiersComponent);
    fixture.componentRef.setInput('result', fullyVerified);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    (buttons[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('800000');
    expect(text).toContain('2026-05-04T01:00:00.000Z');
  });
});
