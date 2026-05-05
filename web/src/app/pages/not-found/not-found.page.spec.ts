import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { NotFoundPage } from './not-found.page';

describe('NotFoundPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFoundPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders a 404 heading and a back link', () => {
    const fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('404');
    expect(fixture.nativeElement.textContent).toContain('Page not found');
    expect(
      fixture.nativeElement.querySelector('a[href="/"]'),
    ).toBeTruthy();
  });
});
