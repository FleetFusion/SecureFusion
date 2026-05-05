/**
 * Static-only assertions on the verifier-types contract surface.
 *
 * These tests intentionally do NOT exercise runtime behaviour — every
 * `expect` here is exists/instanceof. Their job is to fail the build
 * if a type was renamed or its discriminator drifted between Phase B
 * and Phase C, which would silently break the UI.
 */

import type {
  AnchorRef,
  BitcoinAttestation,
  BitcoinProofMode,
  MerkleProofStep,
  Network,
  RegistryEntry,
  ScanProgress,
  Tier1Result,
  Tier2Result,
  Tier3Result,
  VerificationEvent,
  VerificationProgress,
  VerificationResult,
  VerifyOptions,
} from './verifier-types';

describe('verifier-types contract', () => {
  it('discriminates VerificationEvent on `type`', () => {
    const progress: VerificationEvent = {
      type: 'progress',
      kind: 'hashing',
      fileSize: 1,
      fraction: 0,
    };
    const result: VerificationEvent = {
      type: 'result',
      fileName: 'x.mp4',
      fileSizeBytes: 1,
      fileSha256: 'a'.repeat(64),
      tier1: { status: 'not-found' },
      tier2: { status: 'not-applicable' },
      tier3: { status: 'not-applicable' },
      elapsedMs: 0,
    };
    expect(progress.type).toBe('progress');
    expect(result.type).toBe('result');
  });

  it('Tier statuses include the documented terminal values', () => {
    const t1: Tier1Result = { status: 'verified' };
    const t2: Tier2Result = { status: 'invalid', reason: 'signature-invalid' };
    const t3: Tier3Result = { status: 'attested-on-chain' };
    expect(t1.status).toBe('verified');
    expect(t2.reason).toBe('signature-invalid');
    expect(t3.status).toBe('attested-on-chain');
  });

  it('VerifyOptions accepts File or Blob and reports trust anchor', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const opts: VerifyOptions = {
      file: blob,
      trustAnchorBundle: { xrplAccount: 'rABC', registry: [] },
    };
    expect(opts.file).toBeDefined();
  });

  it('exposes BitcoinProofMode and Network unions', () => {
    const m: BitcoinProofMode = 'xrpl-sf1ots';
    const n: Network = 'testnet';
    expect(m).toBe('xrpl-sf1ots');
    expect(n).toBe('testnet');
  });

  it('keeps MerkleProofStep / BitcoinAttestation / AnchorRef shape', () => {
    const step: MerkleProofStep = { side: 'L', hash: 'a'.repeat(64) };
    const btc: BitcoinAttestation = { blockHeight: 800000, blockTimeUtc: null };
    const ref: AnchorRef = {
      txHash: 'A'.repeat(64),
      ledgerIndex: 100,
      ledgerCloseTimeUtc: null,
      account: 'rTEST',
      network: 'testnet',
    };
    expect(step.side).toBe('L');
    expect(btc.blockHeight).toBe(800000);
    expect(ref.network).toBe('testnet');
  });

  it('ScanProgress / VerificationResult / VerificationProgress / RegistryEntry compile', () => {
    const sp: ScanProgress = { ledgersWalked: 0, txsDecoded: 0, cursor: -1 };
    const vp: VerificationProgress = {
      kind: 'scanning',
      ledgersWalked: 1,
      txsDecoded: 0,
      cursor: 100,
    };
    const r: RegistryEntry = {
      organisation: 'X',
      xrplAccount: 'rTEST',
      appPublicKey: '0'.repeat(64),
      network: 'testnet',
      specVersion: 'SF1',
      certifiedAt: '2026-01-01',
      revokedAt: null,
      active: true,
      bitcoinProofMode: 'xrpl-sf1ots',
    };
    const vr: VerificationResult = {
      fileName: 'x',
      fileSizeBytes: 1,
      fileSha256: '0'.repeat(64),
      tier1: { status: 'pending' },
      tier2: { status: 'pending' },
      tier3: { status: 'pending' },
      elapsedMs: 0,
    };
    expect(sp.cursor).toBe(-1);
    expect(vp.kind).toBe('scanning');
    expect(r.bitcoinProofMode).toBe('xrpl-sf1ots');
    expect(vr.tier1.status).toBe('pending');
  });
});
