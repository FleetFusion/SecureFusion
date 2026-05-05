import { Component, computed, input } from '@angular/core';

import type { AnchorRef, VerificationResult } from '../../core/verifier-types';

/**
 * Manifest detail panel.
 *
 * Renders the parsed SF1.event manifest fields in a definition list,
 * followed by the per-channel table. Reads from
 * `result.manifest` (`Record<string, unknown>` per the contract); we
 * narrow to the UI-side `EventManifestView` shape here so the template
 * stays declarative.
 *
 * Channel rows show channelId, sha256, sizeBytes, optional durationMs,
 * optional capturedAt. The matched channel (the one whose sha256 equals
 * `result.tier1.matchedChannelSha`) is highlighted.
 */
@Component({
  standalone: true,
  selector: 'app-manifest-detail',
  template: `
    <section
      class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      aria-labelledby="manifest-detail-heading"
    >
      <h2
        id="manifest-detail-heading"
        class="mb-4 text-lg font-semibold text-gray-900"
      >
        Manifest detail
      </h2>

      @if (manifest(); as m) {
        <dl
          class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]"
        >
          @if (m.vehicleEventId) {
            <dt class="font-medium text-gray-500">Event id</dt>
            <dd class="break-all font-mono">{{ m.vehicleEventId }}</dd>
          }
          @if (m.vehicleId) {
            <dt class="font-medium text-gray-500">Vehicle id</dt>
            <dd class="break-all font-mono">{{ m.vehicleId }}</dd>
          }
          @if (m.tenantId) {
            <dt class="font-medium text-gray-500">Tenant id</dt>
            <dd class="break-all font-mono">{{ m.tenantId }}</dd>
          }
          @if (m.occurredAt) {
            <dt class="font-medium text-gray-500">Occurred at</dt>
            <dd>{{ m.occurredAt }}</dd>
          }
          @if (m.sealedAt) {
            <dt class="font-medium text-gray-500">Sealed at</dt>
            <dd>{{ m.sealedAt }}</dd>
          }
          @if (m.ingestSource) {
            <dt class="font-medium text-gray-500">Ingest source</dt>
            <dd>{{ m.ingestSource }}</dd>
          }
          @if (m.signerKeyId) {
            <dt class="font-medium text-gray-500">Signer key id</dt>
            <dd class="break-all font-mono">{{ m.signerKeyId }}</dd>
          }
        </dl>

        @if (anchor(); as a) {
          <div class="mt-4 border-t border-gray-100 pt-4">
            <h3 class="mb-2 text-sm font-semibold text-gray-700">XRPL anchor</h3>
            <dl
              class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]"
            >
              <dt class="font-medium text-gray-500">Tx hash</dt>
              <dd class="break-all">
                <a
                  [href]="explorerUrl(a)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-mono text-ff-green hover:underline"
                  >{{ a.txHash }}</a
                >
              </dd>
              <dt class="font-medium text-gray-500">Ledger index</dt>
              <dd class="tabular-nums">{{ a.ledgerIndex }}</dd>
              <dt class="font-medium text-gray-500">Network</dt>
              <dd>{{ a.network }}</dd>
            </dl>
          </div>
        }

        @if (m.channels && m.channels.length > 0) {
          <div class="mt-4 border-t border-gray-100 pt-4">
            <h3 class="mb-2 text-sm font-semibold text-gray-700">
              Channels ({{ m.channels.length }})
            </h3>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th class="px-3 py-2 font-medium">Channel</th>
                    <th class="px-3 py-2 font-medium">SHA-256</th>
                    <th class="px-3 py-2 font-medium">Size</th>
                    <th class="px-3 py-2 font-medium">Duration</th>
                    <th class="px-3 py-2 font-medium">Captured at</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (channel of m.channels; track channel.channelId) {
                    <tr
                      [class.bg-green-50]="
                        channel.sha256?.toLowerCase() === matchedSha()
                      "
                    >
                      <td class="px-3 py-2 font-mono text-xs">
                        {{ channel.channelId }}
                      </td>
                      <td class="break-all px-3 py-2 font-mono text-xs">
                        {{ channel.sha256 }}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 tabular-nums">
                        {{ formatBytes(channel.sizeBytes) }}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2 tabular-nums">
                        {{ formatDuration(channel.durationMs) }}
                      </td>
                      <td class="whitespace-nowrap px-3 py-2">
                        {{ channel.capturedAt ?? '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      } @else {
        <p class="text-sm text-gray-500">
          No manifest available. Tier 1 verification did not match an anchor.
        </p>
      }
    </section>
  `,
})
export class ManifestDetailComponent {
  readonly result = input.required<VerificationResult>();

  readonly manifest = computed<EventManifestView | null>(() => {
    const raw = this.result().manifest;
    if (!raw || typeof raw !== 'object') return null;
    return narrowManifest(raw);
  });

  readonly anchor = computed<AnchorRef | null>(
    () => this.result().tier1.anchor ?? null,
  );

  readonly matchedSha = computed(
    () => this.result().tier1.matchedChannelSha?.toLowerCase() ?? null,
  );

  explorerUrl(anchor: AnchorRef): string {
    const base =
      anchor.network === 'testnet'
        ? 'https://testnet.xrpl.org/transactions'
        : 'https://livenet.xrpl.org/transactions';
    return `${base}/${anchor.txHash}`;
  }

  formatBytes(bytes: number | undefined): string {
    if (bytes === undefined || bytes === null || !Number.isFinite(bytes))
      return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  formatDuration(ms: number | undefined): string {
    if (ms === undefined || ms === null || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${ms} ms`;
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)} s`;
    const m = Math.floor(s / 60);
    const rem = Math.round(s % 60);
    return `${m}m ${rem}s`;
  }
}

interface EventManifestView {
  readonly vehicleEventId?: string;
  readonly vehicleId?: string;
  readonly tenantId?: string;
  readonly occurredAt?: string;
  readonly sealedAt?: string;
  readonly ingestSource?: string;
  readonly signerKeyId?: string;
  readonly channels?: ReadonlyArray<{
    readonly channelId?: string;
    readonly sha256?: string;
    readonly sizeBytes?: number;
    readonly durationMs?: number;
    readonly capturedAt?: string;
  }>;
}

/**
 * Coerce a `Record<string, unknown>` into the UI-side view. Anything
 * we can't safely narrow becomes `undefined` — the template handles
 * missing fields with `@if`.
 *
 * The `vehicleEventId` field is also accepted under the legacy
 * `eventId` key the Phase A scaffold's stub used; both names map onto
 * the same display slot. Consumers can keep either spelling without
 * the UI breaking.
 */
function narrowManifest(raw: Record<string, unknown>): EventManifestView {
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : undefined;
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined;
  const channelsIn = Array.isArray(raw['channels']) ? raw['channels'] : [];
  const channels = channelsIn.map((c) => {
    const obj = (c ?? {}) as Record<string, unknown>;
    return {
      channelId: str(obj['channelId']),
      sha256: str(obj['sha256']),
      sizeBytes: num(obj['sizeBytes']),
      durationMs: num(obj['durationMs']),
      capturedAt: str(obj['capturedAt']),
    };
  });
  return {
    vehicleEventId: str(raw['vehicleEventId']) ?? str(raw['eventId']),
    vehicleId: str(raw['vehicleId']),
    tenantId: str(raw['tenantId']),
    occurredAt: str(raw['occurredAt']),
    sealedAt: str(raw['sealedAt']),
    ingestSource: str(raw['ingestSource']),
    signerKeyId: str(raw['signerKeyId']),
    channels,
  };
}
