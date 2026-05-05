import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SettingsPanelComponent } from '../settings/settings.component';

/**
 * Persistent application header.
 *
 * - Brand wordmark on the left, links to `/` (the project landing page).
 * - Inline nav row with `Verify` (`/verify`) and `About` (`/about`); the
 *   active link gets `font-bold` via Angular's `RouterLinkActive`.
 * - Settings cog (gear) on the right, opens the slide-over
 *   `<app-settings-panel>` (only meaningful on `/verify`, but kept on
 *   every route so the panel state persists across navigation).
 * - GitHub Octocat mark on the far right, links to the SecureFusion
 *   repo, opens in a new tab with `noopener noreferrer`.
 *
 * The brand colour palette is the FleetFusion `ff.green` family defined
 * in `tailwind.config.js`. Using `text-ff-green` keeps the SPA visually
 * aligned with the FleetFusion console without taking a dependency on
 * the console's full Lepton-X theme.
 */
@Component({
  standalone: true,
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, SettingsPanelComponent],
  host: { class: 'block w-full border-b border-gray-200 bg-white' },
  template: `
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
      <a
        routerLink="/"
        class="flex items-center gap-2 font-semibold"
        aria-label="SecureFusion home"
      >
        <span class="text-ff-green">SecureFusion</span>
      </a>
      <nav
        class="flex items-center gap-4 text-sm text-gray-700"
        aria-label="Primary"
      >
        <a
          routerLink="/verify"
          routerLinkActive="font-bold text-ff-green"
          data-testid="nav-verify"
          class="hover:text-black focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2 rounded"
        >
          Verify
        </a>
        <a
          routerLink="/about"
          routerLinkActive="font-bold text-ff-green"
          data-testid="nav-about"
          class="hover:text-black focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2 rounded"
        >
          About
        </a>
      </nav>
      <div class="flex items-center gap-3">
        <button
          #cogBtn
          type="button"
          aria-label="Settings"
          data-testid="settings-cog"
          class="rounded-md p-1 text-gray-700 hover:bg-gray-100 hover:text-black focus:outline-none focus:ring-2 focus:ring-ff-green focus:ring-offset-2"
          (click)="toggle()"
        >
          <svg
            viewBox="0 0 20 20"
            width="22"
            height="22"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 0 1-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 0 1 .947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 0 1 2.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 0 1 2.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 0 1 .947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 0 1-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 0 1-2.287-.947ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
        <a
          href="https://github.com/FleetFusion/SecureFusion"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Source code on GitHub"
          class="text-gray-700 hover:text-black"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.55v-2c-3.2.7-3.88-1.36-3.88-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.92 10.92 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.7 5.36-5.27 5.65.42.36.78 1.07.78 2.16v3.21c0 .31.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"
            />
          </svg>
        </a>
      </div>
    </div>

    <app-settings-panel
      [open]="settingsOpen()"
      (close)="closePanel()"
    />
  `,
})
export class HeaderComponent {
  readonly settingsOpen = signal<boolean>(false);

  @ViewChild('cogBtn') cogBtn?: ElementRef<HTMLButtonElement>;

  toggle(): void {
    this.settingsOpen.update((v) => !v);
  }

  closePanel(): void {
    this.settingsOpen.set(false);
    // Restore focus to the cog so keyboard users don't lose context.
    queueMicrotask(() => this.cogBtn?.nativeElement.focus());
  }
}
