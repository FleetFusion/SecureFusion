import { TestBed } from '@angular/core/testing';

import { HashingProgressComponent } from './hashing-progress.component';

describe('HashingProgressComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HashingProgressComponent],
    }).compileComponents();
  });

  it('renders the percent rounded to 0 decimals', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 420);
    fixture.componentRef.setInput('totalBytes', 1000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('42 %');
  });

  it('renders the bytes-processed / total chip in human units', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 1024 * 1024);
    fixture.componentRef.setInput('totalBytes', 10 * 1024 * 1024);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('1.0 MB');
    expect(text).toContain('10.0 MB');
  });

  it('renders an ARIA progressbar with current percent', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 250);
    fixture.componentRef.setInput('totalBytes', 1000);
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('[role=progressbar]');
    expect(bar).toBeTruthy();
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
  });

  it('emits cancel when the cancel button is clicked', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 0);
    fixture.componentRef.setInput('totalBytes', 1);
    fixture.detectChanges();
    let emitted = 0;
    fixture.componentInstance.cancel.subscribe(() => (emitted += 1));
    (
      fixture.nativeElement.querySelector(
        '[data-testid=cancel-btn]',
      ) as HTMLButtonElement
    ).click();
    expect(emitted).toBe(1);
  });

  it('renders an ETA chip when etaSeconds is provided', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 100);
    fixture.componentRef.setInput('totalBytes', 1000);
    fixture.componentRef.setInput('etaSeconds', 90);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1m 30s');
  });

  it('clamps percent to 0..100 even when inputs disagree', () => {
    const fixture = TestBed.createComponent(HashingProgressComponent);
    fixture.componentRef.setInput('bytesProcessed', 5000);
    fixture.componentRef.setInput('totalBytes', 1000);
    fixture.detectChanges();
    expect(fixture.componentInstance.percent()).toBe(100);
  });
});
