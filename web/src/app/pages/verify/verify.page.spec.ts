import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';

import { SETTINGS_STORAGE_KEY, SettingsService } from '../../core/settings';
import type { TrustAnchorBundle } from '../../core/trust-anchors';
import type {
  VerificationEvent,
  VerifyOptions,
} from '../../core/verifier-types';
import { TRUST_ANCHOR_LOADER, VERIFY_VIDEO_FN, VerifyPage } from './verify.page';

const dummyBundle: TrustAnchorBundle = {
  xrplAccount: 'rExampleAccount',
  network: 'mainnet',
  specVersion: 'sf1',
  bitcoinProofMode: 'xrpl-sf1ots',
  registry: [
    {
      organisation: 'FleetFusion',
      xrplAccount: 'rExampleAccount',
      appPublicKey: 'a'.repeat(64),
      network: 'mainnet',
      specVersion: 'sf1',
      certifiedAt: '2026-01-01T00:00:00Z',
      revokedAt: null,
      active: true,
      bitcoinProofMode: 'xrpl-sf1ots',
    },
  ],
};

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'evidence.mp4', {
    type: 'video/mp4',
  });
}

function setupTestBed(
  events$: Observable<VerificationEvent>,
  bundle: TrustAnchorBundle = dummyBundle,
): void {
  TestBed.configureTestingModule({
    imports: [VerifyPage],
    providers: [
      {
        provide: VERIFY_VIDEO_FN,
        useValue: (_: VerifyOptions) => events$,
      },
      {
        provide: TRUST_ANCHOR_LOADER,
        useValue: () => Promise.resolve(bundle),
      },
    ],
  });
}

describe('VerifyPage', () => {
  beforeEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('starts in the idle state showing the drop-zone', () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('idle');
    expect(fixture.nativeElement.querySelector('app-drop-zone')).toBeTruthy();
  });

  it('walks file → hashing → scanning → verified when verifyVideo emits the full sequence', async () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();

    await fixture.componentInstance.onFile(makeFile());
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('hashing');

    subject.next({ type: 'progress', kind: 'hashing', fileSize: 3, fraction: 0.5 });
    fixture.detectChanges();
    expect(fixture.componentInstance.bytesProcessed()).toBe(2); // round(3*0.5)
    expect(fixture.componentInstance.state()).toBe('hashing');

    subject.next({
      type: 'progress',
      kind: 'scanning',
      ledgersWalked: 10,
      txsDecoded: 1,
      cursor: 100,
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('scanning');
    expect(fixture.nativeElement.textContent).toContain('Scanning XRPL...');

    subject.next({
      type: 'result',
      fileName: 'evidence.mp4',
      fileSizeBytes: 3,
      fileSha256: 'a'.repeat(64),
      tier1: {
        status: 'verified',
        matchedChannelSha: 'a'.repeat(64),
        anchor: {
          txHash: 'B'.repeat(64),
          ledgerIndex: 1,
          ledgerCloseTimeUtc: '2026-05-04T00:00:00Z',
          account: 'rExampleAccount',
          network: 'mainnet',
        },
      },
      tier2: { status: 'verified', signerKeyId: 'platform-2026-04' },
      tier3: { status: 'verified' },
      manifest: { vehicleId: 'V1', channels: [] },
      elapsedMs: 1234,
    });
    subject.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('verified');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Hash on XRPL');
    expect(text).toContain('Bitcoin-attested');
    expect(text).toContain('Manifest detail');
    expect(text).toContain('Verify independently');
  });

  it('returns to idle when the user clicks Cancel during hashing', async () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await fixture.componentInstance.onFile(makeFile());
    fixture.detectChanges();
    fixture.componentInstance.cancel();
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('cancels the prior run when a different file is dropped mid-flow', async () => {
    let activeUnsubs = 0;
    const events$ = new Observable<VerificationEvent>(() => {
      activeUnsubs += 1;
      return () => {
        activeUnsubs -= 1;
      };
    });
    setupTestBed(events$);
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();

    await fixture.componentInstance.onFile(makeFile());
    fixture.detectChanges();
    expect(activeUnsubs).toBe(1);

    await fixture.componentInstance.onFile(
      new File([new Uint8Array([9])], 'second.mp4', { type: 'video/mp4' }),
    );
    fixture.detectChanges();
    expect(activeUnsubs).toBe(1); // first cancelled, second active
  });

  it('routes errors to the failed state with the message', async () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await fixture.componentInstance.onFile(makeFile());
    subject.error(new Error('rippled unreachable'));
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('failed');
    expect(fixture.nativeElement.textContent).toContain('rippled unreachable');
  });

  it('treats AbortError as a silent return-to-idle, not a failure', async () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await fixture.componentInstance.onFile(makeFile());
    subject.error(new DOMException('aborted', 'AbortError'));
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('idle');
  });

  it('passes the user-configured rippled + OTS URLs from SettingsService into VerifyOptions', async () => {
    const subject = new Subject<VerificationEvent>();
    let captured: VerifyOptions | undefined;
    TestBed.configureTestingModule({
      imports: [VerifyPage],
      providers: [
        {
          provide: VERIFY_VIDEO_FN,
          useValue: (opts: VerifyOptions) => {
            captured = opts;
            return subject.asObservable();
          },
        },
        {
          provide: TRUST_ANCHOR_LOADER,
          useValue: () => Promise.resolve(dummyBundle),
        },
      ],
    });
    const settings = TestBed.inject(SettingsService);
    settings.set({ rippledUrl: 'https://node-x.example.com' });
    settings.set({ otsCalendarUrl: 'https://ots-x.example.com' });

    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await fixture.componentInstance.onFile(makeFile());
    expect(captured?.rippledUrl).toBe('https://node-x.example.com');
    expect(captured?.otsCalendarUrl).toBe('https://ots-x.example.com');
  });

  it('exposes the organisation derived from the trust-anchor registry', async () => {
    const subject = new Subject<VerificationEvent>();
    setupTestBed(subject.asObservable());
    const fixture = TestBed.createComponent(VerifyPage);
    fixture.detectChanges();
    await fixture.componentInstance.onFile(makeFile());

    subject.next({
      type: 'result',
      fileName: 'evidence.mp4',
      fileSizeBytes: 3,
      fileSha256: 'a'.repeat(64),
      tier1: {
        status: 'verified',
        anchor: {
          txHash: 'B'.repeat(64),
          ledgerIndex: 1,
          ledgerCloseTimeUtc: null,
          account: 'rExampleAccount',
          network: 'mainnet',
        },
      },
      tier2: { status: 'verified' },
      tier3: { status: 'verified' },
      elapsedMs: 1,
    });
    subject.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.organisation()).toBe('FleetFusion');
  });
});
