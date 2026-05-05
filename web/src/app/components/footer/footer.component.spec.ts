import { TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();
  });

  it('renders the SecureFusion v1 spec link as an external link', () => {
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('a'),
    ) as HTMLAnchorElement[];
    const spec = links.find((a) => /spec/i.test(a.textContent ?? ''));
    expect(spec).toBeTruthy();
    expect(spec!.target).toBe('_blank');
    expect(spec!.rel).toContain('noopener');
  });

  it('reassures the user that nothing is uploaded', () => {
    const fixture = TestBed.createComponent(FooterComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.toLowerCase()).toContain('no upload');
  });
});
