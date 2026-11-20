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

/** Signed upgrade fixture with a genuine pending timestamp, not a fake Bitcoin success. */
export async function makeUpgradeFixture(anchor: AnchorFixture, merkleProof = '[]', ots = new Uint8Array([0,131,223,227,13,46,249,12,142,25,24,104,116,116,112,115,58,47,47,99,97,108,101,110,100,97,114,46,101,120,97,109,112,108,101])): Promise<Record<string, unknown>> {
  const originalMemos = anchor.rippledTx['Memos'] as Array<{ Memo: { MemoData: string } }>;
  const bundle = Uint8Array.from(originalMemos[0].Memo.MemoData.match(/../g)!, h => parseInt(h,16));
  const signature = await ed.signAsync(concatBytes(bundle, utf8Encode(merkleProof), ots), SF1_TEST_APP_SEED);
  const parts: Array<[string,string,Uint8Array]> = [['SF1.bundle','application/octet-stream',bundle],['SF1.merkleProof','application/json',utf8Encode(merkleProof)],['SF1.ots','application/octet-stream',ots],['SF1.sig','application/octet-stream',signature]];
  return { Account: TESTNET_ACCOUNT, TransactionType: 'AccountSet', hash: 'B'.repeat(64), validated: true, ledger_index: 1100,
    Memos: parts.map(([type,format,data]) => ({ Memo: { MemoType: bytesToHex(utf8Encode(type)), MemoFormat: bytesToHex(utf8Encode(format)), MemoData: bytesToHex(data) } })) };
}
