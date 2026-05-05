import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders without errors', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('has an <h1> hero heading', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const h1 = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(h1).toBeTruthy();
    // Hero heading carries an id used by aria-labelledby on the hero section.
    expect(h1.id).toBe('hero-heading');
    expect(h1.textContent).toContain('Tamper-evident video evidence');
  });

  it('exposes a primary "Verify a video" CTA pointing at /verify', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const cta = fixture.nativeElement.querySelector(
      '[data-testid="hero-verify-cta"]',
    ) as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    // Angular's RouterLink directive sets the href reflectively.
    expect(cta.getAttribute('href')).toBe('/verify');
    expect(cta.textContent).toContain('Verify a video');
  });

  it('the "Verify a video" CTA is a real anchor (keyboard accessible by default)', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const cta = fixture.nativeElement.querySelector(
      '[data-testid="hero-verify-cta"]',
    ) as HTMLElement;
    // Anchors with hrefs are keyboard-focusable by default; tabIndex
    // would only be required if it were a non-anchor element.
    expect(cta.tagName).toBe('A');
    expect(cta.hasAttribute('href')).toBe(true);
  });

  it('the "View on GitHub" link points at FleetFusion/SecureFusion in a new tab', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const cta = fixture.nativeElement.querySelector(
      '[data-testid="hero-github-cta"]',
    ) as HTMLAnchorElement;
    expect(cta).toBeTruthy();
    expect(cta.href).toBe('https://github.com/FleetFusion/SecureFusion');
    expect(cta.target).toBe('_blank');
    expect(cta.rel).toContain('noopener');
    expect(cta.rel).toContain('noreferrer');
  });

  it('renders the three explainer cards', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Hash on ingest');
    expect(text).toContain('Anchor on chain');
    expect(text).toContain('Verify publicly');
  });

  it('exposes a footer CTA row with verify, spec, and roadmap links', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const footerCta = fixture.nativeElement.querySelector(
      '[data-testid="footer-verify-cta"]',
    ) as HTMLAnchorElement;
    expect(footerCta).toBeTruthy();
    expect(footerCta.getAttribute('href')).toBe('/verify');

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Read the spec on GitHub');
    expect(text).toContain('Browse v2 roadmap on GitHub');
  });

  it('renders the SecureFusion logo with an alt attribute', () => {
    const fixture = TestBed.createComponent(LandingPage);
    fixture.detectChanges();
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.alt).toContain('SecureFusion');
    expect(img.getAttribute('src')).toBe('logo.png');
  });
});
