import { TestBed } from '@angular/core/testing';

import { DropZoneComponent } from './drop-zone.component';

/**
 * Helper: Karma's jsdom-free environment doesn't actually fire a real
 * DragEvent with a populated `dataTransfer`. We synthesise one by
 * creating a plain `Event('drop')` and tacking a `dataTransfer.files`
 * property onto it — that's enough for the component's `onDrop`
 * handler since it only reads `e.dataTransfer.files[0]`.
 */
function makeDropEvent(file: File | null): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files: file ? [file] : [],
    },
  });
  return event;
}

describe('DropZoneComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DropZoneComponent],
    }).compileComponents();
  });

  it('renders the drop region with role=button and tabindex=0 (keyboard accessible)', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector(
      '[data-testid=drop-zone]',
    ) as HTMLElement;
    expect(region).toBeTruthy();
    expect(region.getAttribute('role')).toBe('button');
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('emits fileSelected when a video file is dropped', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const captured: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) =>
      captured.push(file),
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'a.mp4', {
      type: 'video/mp4',
    });
    fixture.nativeElement
      .querySelector('[data-testid=drop-zone]')
      .dispatchEvent(makeDropEvent(file));
    expect(captured.length).toBe(1);
    expect(captured[0].name).toBe('a.mp4');
  });

  it('rejects non-video files with a visible inline error', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const captured: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) =>
      captured.push(file),
    );
    const file = new File([new Uint8Array([1])], 'a.txt', {
      type: 'text/plain',
    });
    fixture.nativeElement
      .querySelector('[data-testid=drop-zone]')
      .dispatchEvent(makeDropEvent(file));
    fixture.detectChanges();
    expect(captured.length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Only video files');
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeTruthy();
  });

  it('emits fileSelected when the file-picker is used', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const captured: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) =>
      captured.push(file),
    );
    const input = fixture.nativeElement.querySelector(
      'input[type=file]',
    ) as HTMLInputElement;
    const file = new File([new Uint8Array([1])], 'b.mp4', { type: 'video/mp4' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    expect(captured.length).toBe(1);
    expect(captured[0].name).toBe('b.mp4');
  });

  it('accepts files by extension when the MIME type is empty (Safari + .mkv quirk)', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const captured: File[] = [];
    fixture.componentInstance.fileSelected.subscribe((file: File) =>
      captured.push(file),
    );
    const file = new File([new Uint8Array([1])], 'video.mkv', { type: '' });
    fixture.nativeElement
      .querySelector('[data-testid=drop-zone]')
      .dispatchEvent(makeDropEvent(file));
    expect(captured.length).toBe(1);
  });

  it('reflects drag-over state visually', () => {
    const fixture = TestBed.createComponent(DropZoneComponent);
    fixture.detectChanges();
    const region = fixture.nativeElement.querySelector(
      '[data-testid=drop-zone]',
    ) as HTMLElement;
    const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
    region.dispatchEvent(dragOver);
    fixture.detectChanges();
    expect(fixture.componentInstance.isDragOver()).toBe(true);
    region.dispatchEvent(new Event('dragleave', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.isDragOver()).toBe(false);
  });
});
