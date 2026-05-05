import { Component, EventEmitter, Output, ViewChild, ElementRef, signal } from '@angular/core';

/**
 * Drag-and-drop video file picker.
 *
 * Emits the chosen `File` via `(fileSelected)` once a video has been
 * accepted. Non-video files are rejected up-front with a visible inline
 * error and never reach the parent.
 *
 * Accessibility:
 * - The drop region is `role="button"` with `tabindex="0"` so keyboard
 *   users can `Tab` to it and press `Enter`/`Space` to open the file
 *   picker (mirroring the click target on the visible button).
 * - The hidden `<input type="file">` is the source of truth for picker
 *   activation; the visual button just forwards to it.
 *
 * MIME-type acceptance: any `video/*` plus the three explicit container
 * types we care about (mp4 / mov / mkv). On platforms where the MIME
 * type comes back as an empty string (Safari + .mkv being the common
 * case), the file extension is the fallback gate.
 */
@Component({
  standalone: true,
  selector: 'app-drop-zone',
  template: `
    <div
      data-testid="drop-zone"
      role="button"
      tabindex="0"
      [attr.aria-label]="'Drop a video file or press Enter to choose one'"
      [class.border-ff-green]="isDragOver()"
      [class.bg-green-50]="isDragOver()"
      class="flex w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white px-6 py-16 text-center transition-colors hover:border-ff-green focus:border-ff-green focus:outline-none focus:ring-2 focus:ring-ff-green"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave()"
      (drop)="onDrop($event)"
      (click)="openPicker()"
      (keydown.enter)="openPicker(); $event.preventDefault()"
      (keydown.space)="openPicker(); $event.preventDefault()"
    >
      <svg
        viewBox="0 0 24 24"
        width="40"
        height="40"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
        class="mb-4 text-gray-400"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      <p class="text-base font-medium text-gray-900">
        Drop a video file here, or
        <button
          type="button"
          class="ml-1 inline-flex items-center rounded-md bg-ff-green px-3 py-1 text-sm font-semibold text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          aria-label="Open file picker"
          (click)="openPicker(); $event.stopPropagation()"
        >
          Open file
        </button>
      </p>
      <p class="mt-2 text-sm text-gray-500">
        Supported: .mp4, .mov, .mkv. Files never leave your browser.
      </p>
      @if (rejected()) {
        <p
          role="alert"
          class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {{ rejected() }}
        </p>
      }
    </div>
    <input
      #fileInput
      type="file"
      accept="video/*,.mp4,.mov,.mkv"
      class="hidden"
      aria-hidden="true"
      tabindex="-1"
      (change)="onPicked($event)"
    />
  `,
})
export class DropZoneComponent {
  @Output() readonly fileSelected = new EventEmitter<File>();
  @ViewChild('fileInput', { static: true })
  private readonly fileInput!: ElementRef<HTMLInputElement>;

  readonly rejected = signal<string | null>(null);
  readonly isDragOver = signal(false);

  /** Acceptable MIME types (browsers sometimes lie, hence the ext fallback). */
  private readonly acceptedMime = /^video\//i;
  private readonly acceptedExt = /\.(mp4|mov|mkv|m4v|webm)$/i;

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragOver.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.acceptOrReject(file);
  }

  onPicked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.acceptOrReject(file);
    // Reset so picking the same file twice still fires `change`.
    input.value = '';
  }

  openPicker(): void {
    this.fileInput.nativeElement.click();
  }

  private acceptOrReject(file: File): void {
    const looksLikeVideo =
      this.acceptedMime.test(file.type) || this.acceptedExt.test(file.name);
    if (looksLikeVideo) {
      this.rejected.set(null);
      this.fileSelected.emit(file);
    } else {
      this.rejected.set('Only video files (.mp4, .mov, .mkv) are supported.');
    }
  }
}
