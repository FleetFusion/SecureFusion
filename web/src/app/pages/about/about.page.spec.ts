import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AboutPage } from './about.page';

describe('AboutPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the about page heading', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('About this verifier');
  });

  it('links to the SecureFusion v1 spec and the repo', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a[target="_blank"]'),
    ) as HTMLAnchorElement[];
    expect(
      links.some((a) => a.href === 'https://github.com/FleetFusion/SecureFusion'),
    ).toBe(true);
    expect(
      links.some((a) =>
        a.href.startsWith(
          'https://github.com/FleetFusion/SecureFusion/blob/main/spec/securefusion-v1.md',
        ),
      ),
    ).toBe(true);
  });

  it('exposes a back-to-verifier link', () => {
    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Back to verifier');
  });
});
