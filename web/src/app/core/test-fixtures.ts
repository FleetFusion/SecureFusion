/**
 * Deterministic fixture builders for verifier orchestrator tests.
 *
 * Uses the joint-plan D11 seed (bytes 0x00..0x1F) so every test run
 * sees byte-identical anchor txs and signatures.
 */

import * as ed from '@noble/ed25519';

import { canonicalise } from './verifier/canonical';
import { buildMemos, encodeBundleMemo } from './verifier/memo';
import { bytesToHex, concatBytes, utf8Encode } from './verifier/bytes';
import type { RegistryEntry } from './verifier-types';

export const SF1_TEST_APP_SEED = new Uint8Array(
  Array.from({ length: 32 }, (_, i) => i),
);

export const TESTNET_ACCOUNT = 'rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx';

/** The deterministic Ed25519 public key derived from the D11 seed. */
export async function fixturePublicKeyHex(): Promise<string> {
  const pub = await ed.getPublicKeyAsync(SF1_TEST_APP_SEED);
  return bytesToHex(pub);
}

export async function makeRegistry(): Promise<RegistryEntry[]> {
  return [
    {
      organisation: 'FleetFusion (TESTNET)',
      xrplAccount: TESTNET_ACCOUNT,
      appPublicKey: await fixturePublicKeyHex(),
      network: 'testnet',
      specVersion: 'SF1',
      certifiedAt: '2026-05-04T00:00:00.000Z',
      revokedAt: null,
      active: true,
      bitcoinProofMode: 'xrpl-sf1ots',
    },
  ];
}

export interface AnchorFixture {
  txHash: string;
  manifest: Record<string, unknown>;
  channelSha: string;
  bundleHashHex: string;
  rippledTx: Record<string, unknown>;
}

/**
 * Build a deterministic 3-memo anchor tx for a single-channel
 * manifest. The supplied `channelSha` becomes `channels[0].sha256`,
 * which is what the orchestrator's Tier-1 lookup matches against.
 */
export async function makeAnchorFixture(channelSha: string): Promise<AnchorFixture> {
  const manifest: Record<string, unknown> = {
    channels: [
      {
        capturedAt: '2026-04-30T12:34:56.000Z',
        channelId: 'front',
        durationMs: 12000,
        sha256: channelSha,
        sizeBytes: 1024,
      },
    ],
    eventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    ingestSource: 'fleetfusion',
    ingestedAt: '2026-04-30T12:35:02.123Z',
    occurredAt: '2026-04-30T12:34:56.000Z',
    sealedAt: '2026-04-30T12:35:05.456Z',
    signerKeyId: 'platform-2026-04',
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    v: 1,
    vehicleEventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    vehicleId: '11111111-2222-3333-4444-555555555555',
  };
  const eventBytes = canonicalise(manifest);
  const bundleHashHex = bytesToHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', eventBytes)),
  );
  const bundleBytes = encodeBundleMemo({
    bundleHash: bundleHashHex,
    eventId: '01933f5e-7c4a-7890-abcd-1234567890ab',
    ingestSourceCode: 1,
    channelCount: 1,
  });
  const sigInput = concatBytes(bundleBytes, eventBytes);
  const signature = await ed.signAsync(sigInput, SF1_TEST_APP_SEED);

  const memos = buildMemos({ bundleBytes, eventBytes, signature });
  const txHash = 'A'.repeat(64);
  const rippledTx = {
    Account: TESTNET_ACCOUNT,
    Destination: TESTNET_ACCOUNT,
    Amount: '1',
    TransactionType: 'Payment',
    hash: txHash,
    Memos: memos,
    validated: true,
    ledger_index: 1000,
    date: 800000000, // arbitrary ripple time
  };
  return { txHash, manifest, channelSha, bundleHashHex, rippledTx };
}
