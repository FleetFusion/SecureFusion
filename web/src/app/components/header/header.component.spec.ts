import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { TRUST_ANCHOR_LOADER } from '../../pages/verify/verify.page';
import { PURGE_SCAN_CACHE_FN } from '../settings/settings.component';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        provideRouter([
          // Stub routes so RouterLink/RouterLinkActive resolve cleanly.
          { path: '', children: [] },
          { path: 'verify', children: [] },
          { path: 'about', children: [] },
        ]),
        {
          provide: TRUST_ANCHOR_LOADER,
          useValue: () =>
            Promise.resolve({
              xrplAccount: 'rTestAccount',
              network: 'mainnet' as const,
              specVersion: 'sf1' as const,
              bitcoinProofMode: 'xrpl-sf1ots' as const,
              registry: [],
            }),
        },
        {
          provide: PURGE_SCAN_CACHE_FN,
          useValue: () => Promise.resolve(),
        },
      ],
    }).compileComponents();
  });

  it('renders a GitHub link to FleetFusion/SecureFusion in a new tab', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const a = fixture.nativeElement.querySelector(
      'a[aria-label="Source code on GitHub"]',
    ) as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.href).toBe('https://github.com/FleetFusion/SecureFusion');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    expect(a.rel).toContain('noreferrer');
  });

  it('shows the SecureFusion brand wordmark on the left, linking to /', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const brand = fixture.nativeElement.querySelector(
      'a[aria-label="SecureFusion home"]',
    ) as HTMLAnchorElement;
    expect(brand).toBeTruthy();
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.textContent).toContain('SecureFusion');
  });

  it('renders Verify and About nav links', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const verifyLink = fixture.nativeElement.querySelector(
      '[data-testid="nav-verify"]',
    ) as HTMLAnchorElement;
    const aboutLink = fixture.nativeElement.querySelector(
      '[data-testid="nav-about"]',
    ) as HTMLAnchorElement;
    expect(verifyLink).toBeTruthy();
    expect(verifyLink.getAttribute('href')).toBe('/verify');
    expect(aboutLink).toBeTruthy();
    expect(aboutLink.getAttribute('href')).toBe('/about');
  });

  it('marks the Verify nav link active when on /verify', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/verify');
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    // Allow RouterLinkActive to apply its classes after the nav.
    await fixture.whenStable();
    fixture.detectChanges();
    const verifyLink = fixture.nativeElement.querySelector(
      '[data-testid="nav-verify"]',
    ) as HTMLAnchorElement;
    expect(verifyLink.className).toContain('font-bold');
  });

  it('renders an inline GitHub Octocat SVG (no external image fetch)', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector(
      'a[aria-label="Source code on GitHub"] svg',
    );
    expect(svg).toBeTruthy();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders the settings cog and toggles the panel on click', () => {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();

    const cog = fixture.nativeElement.querySelector(
      '[data-testid="settings-cog"]',
    ) as HTMLButtonElement;
    expect(cog).toBeTruthy();
    expect(cog.getAttribute('aria-label')).toBe('Settings');

    expect(
      fixture.nativeElement.querySelector('[data-testid="settings-panel"]'),
    ).toBeFalsy();

    cog.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="settings-panel"]'),
    ).toBeTruthy();
  });
});
