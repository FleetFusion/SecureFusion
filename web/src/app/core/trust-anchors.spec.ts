import { loadTrustAnchors, lookupKey } from './trust-anchors';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_BUNDLE = {
  xrplAccount: 'rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx',
  network: 'testnet' as const,
  specVersion: 'SF1',
  bitcoinProofMode: 'xrpl-sf1ots' as const,
  registry: [
    {
      organisation: 'FleetFusion (TESTNET)',
      xrplAccount: 'rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx',
      appPublicKey: '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8',
      network: 'testnet' as const,
      specVersion: 'SF1',
      certifiedAt: '2026-05-04T00:00:00.000Z',
      revokedAt: null,
      active: true,
      bitcoinProofMode: 'xrpl-sf1ots' as const,
    },
  ],
};

const VALID_KEY = {
  keyId: 'platform-2026-04',
  publicKey: '03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8',
  validFrom: '2026-04-01T00:00:00Z',
  validUntil: null,
  retiredReason: null,
};

describe('trust-anchors', () => {
  it('loads and validates the bundle', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(VALID_BUNDLE));
    const ta = await loadTrustAnchors('/assets/trust-anchors/');
    expect(ta.xrplAccount).toBe('rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx');
    expect(ta.registry.length).toBe(1);
    expect(ta.registry[0].bitcoinProofMode).toBe('xrpl-sf1ots');
  });

  it('rejects non-200 responses', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse({}, 404));
    await expectAsync(loadTrustAnchors('/assets/trust-anchors/')).toBeRejectedWithError(
      /HTTP 404/,
    );
  });

  it('rejects when xrplAccount mismatches the registry entry', async () => {
    const bad = {
      ...VALID_BUNDLE,
      registry: [{ ...VALID_BUNDLE.registry[0], xrplAccount: 'rOTHER' }],
    };
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(bad));
    await expectAsync(loadTrustAnchors('/assets/trust-anchors/')).toBeRejectedWithError(
      /registry entry account does not match top-level xrplAccount/,
    );
  });

  it('rejects when bitcoinProofMode is unknown', async () => {
    const bad = { ...VALID_BUNDLE, bitcoinProofMode: 'rot13' };
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(bad));
    await expectAsync(loadTrustAnchors('/assets/trust-anchors/')).toBeRejectedWithError(
      /bitcoinProofMode must be one of/,
    );
  });

  it('rejects when registry entry appPublicKey is not 64 hex chars', async () => {
    const bad = {
      ...VALID_BUNDLE,
      registry: [{ ...VALID_BUNDLE.registry[0], appPublicKey: 'short' }],
    };
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(bad));
    await expectAsync(loadTrustAnchors('/assets/trust-anchors/')).toBeRejectedWithError(
      /appPublicKey must be 64 lowercase hex chars/,
    );
  });

  it('looks up a key by keyId', async () => {
    spyOn(window, 'fetch').and.resolveTo(jsonResponse(VALID_KEY));
    const k = await lookupKey('platform-2026-04', '/assets/trust-anchors/');
    expect(k.publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(k.keyId).toBe('platform-2026-04');
  });

  it('rejects when key publicKey is malformed', async () => {
    spyOn(window, 'fetch').and.resolveTo(
      jsonResponse({ ...VALID_KEY, publicKey: 'not-hex' }),
    );
    await expectAsync(
      lookupKey('platform-2026-04', '/assets/trust-anchors/'),
    ).toBeRejectedWithError(/publicKey must be 64 lowercase hex chars/);
  });

  it('rejects keyIds with weird characters', async () => {
    await expectAsync(lookupKey('../escape', '/assets/trust-anchors/')).toBeRejectedWithError(
      /keyId must match/,
    );
  });
});
