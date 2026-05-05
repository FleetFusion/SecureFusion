import { TestBed } from '@angular/core/testing';

import type { VerificationResult } from '../../core/verifier-types';
import { ManifestDetailComponent } from './manifest-detail.component';

const baseResult: VerificationResult = {
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
      account: 'rExample',
      network: 'mainnet',
    },
  },
  tier2: { status: 'verified', signerKeyId: 'platform-2026-04' },
  tier3: { status: 'verified' },
  manifest: {
    vehicleEventId: '00000000-0000-0000-0000-000000000000',
    vehicleId: 'V123',
    tenantId: 'tenant-1',
    occurredAt: '2026-05-04T00:00:00Z',
    sealedAt: '2026-05-04T00:00:01Z',
    ingestSource: 'demo-ingest',
    signerKeyId: 'platform-2026-04',
    channels: [
      {
        channelId: 'cam-front',
        sha256: 'a'.repeat(64),
        sizeBytes: 2048,
        durationMs: 5000,
        capturedAt: '2026-05-04T00:00:00Z',
      },
      {
        channelId: 'cam-cabin',
        sha256: 'f'.repeat(64),
        sizeBytes: 1024,
      },
    ],
  },
  elapsedMs: 100,
};

const noManifest: VerificationResult = {
  fileName: 'orphan.mp4',
  fileSizeBytes: 0,
  fileSha256: 'e'.repeat(64),
  tier1: { status: 'not-found' },
  tier2: { status: 'not-applicable' },
  tier3: { status: 'not-applicable' },
  elapsedMs: 0,
};

describe('ManifestDetailComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManifestDetailComponent],
    }).compileComponents();
  });

  it('renders vehicleEventId, vehicleId, tenantId, occurredAt, sealedAt, ingestSource, signerKeyId', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', baseResult);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('00000000-0000-0000-0000-000000000000');
    expect(text).toContain('V123');
    expect(text).toContain('tenant-1');
    expect(text).toContain('2026-05-04T00:00:00Z');
    expect(text).toContain('2026-05-04T00:00:01Z');
    expect(text).toContain('demo-ingest');
    expect(text).toContain('platform-2026-04');
  });

  it('lists every channel with channelId, sha256, sizeBytes', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', baseResult);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('cam-front');
    expect(text).toContain('cam-cabin');
    expect(text).toContain('a'.repeat(64));
    expect(text).toContain('f'.repeat(64));
    expect(text).toContain('2.0 KB');
    expect(text).toContain('1.0 KB');
  });

  it('renders durationMs and capturedAt when present, "—" otherwise', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', baseResult);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('5.0 s');
    expect(text).toContain('—');
  });

  it('renders the anchor tx hash as a link to livenet.xrpl.org for mainnet', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', baseResult);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      `a[href="https://livenet.xrpl.org/transactions/${'B'.repeat(64)}"]`,
    );
    expect(link).toBeTruthy();
    expect(link.target).toBe('_blank');
  });

  it('routes the explorer link to testnet.xrpl.org when the anchor network is testnet', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    const testnetResult: VerificationResult = {
      ...baseResult,
      tier1: {
        ...baseResult.tier1,
        anchor: { ...baseResult.tier1.anchor!, network: 'testnet' },
      },
    };
    fixture.componentRef.setInput('result', testnetResult);
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      `a[href="https://testnet.xrpl.org/transactions/${'B'.repeat(64)}"]`,
    );
    expect(link).toBeTruthy();
  });

  it('shows a friendly empty-state when there is no manifest', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', noManifest);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No manifest available');
  });

  it('highlights the matched channel row', () => {
    const fixture = TestBed.createComponent(ManifestDetailComponent);
    fixture.componentRef.setInput('result', baseResult);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((rows[0] as HTMLElement).className).toContain('bg-green-50');
    expect((rows[1] as HTMLElement).className).not.toContain('bg-green-50');
  });
});
