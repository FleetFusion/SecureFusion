# SecureFusion Conformance Vectors

A SecureFusion implementation is conformant if it produces the same results as the reference verifier on the published test vectors.

## Layout

```
conformance/
  README.md                                <- this file
  generate.csproj                          <- C# vector generator (--regen-vectors)
  Program.cs                               <- generator entry point (S9.5)
  vectors/
    v1-single-channel.manifest.json        <- pretty-printed manifest (canonical bytes equal to examples/single-channel-event.json)
    v1-multi-channel.manifest.json
    v1-good-anchor.tx.json                 <- synthesized XRPL tx response that verifies clean
    v1-bad-tampered-manifest.tx.json       <- payload tweaked after sealing -> bundle-hash-mismatch
    v1-bad-tampered-manifest.expected.json
    v1-bad-swapped-sig.tx.json             <- SF1.sig from a different manifest -> signature-invalid
    v1-bad-swapped-sig.expected.json
    v1-bad-wrong-account.tx.json           <- Account != Destination -> account-not-self-pay
    v1-bad-wrong-account.expected.json
    v1-bad-missing-memo.tx.json            <- SF1.event memo removed -> memo-missing
    v1-bad-missing-memo.expected.json
    v1-bad-four-memos.tx.json              <- SF1.junk added alongside the three SF1 memos -> memo-extra
    v1-bad-four-memos.expected.json
    v1-bad-duplicate-memo.tx.json          <- SF1.bundle appears twice -> memo-duplicate
    v1-bad-duplicate-memo.expected.json
    v1-good-account-tx.json                <- account_tx response covering the anchor
                                              + a sibling SF1.ots upgrade tx for the
                                              same bundleHash (Phase 4 §6.1)
```

### `v1-good-account-tx.json`

This vector models a rippled `account_tx` response for the platform XRPL account that contains:

1. The original anchor Payment from `v1-good-anchor.tx.json` (3 memos: `{SF1.bundle, SF1.event, SF1.sig}`).
2. A sibling SF1.ots upgrade Payment for the **same** bundleHash (4 memos: `{SF1.bundle, SF1.merkleProof, SF1.ots, SF1.sig}`).

The upgrade tx reuses the original 50-byte SF1.bundle payload byte-for-byte (so the verifier's bundleHash correlation succeeds). The `SF1.merkleProof` memo carries the empty JSON array `[]` — modelling a "single-event batch" where the bundleHash IS the batch root, so an empty branch is the correct proof. `SF1.ots` is 16 dummy 0x42 bytes; the OTS calendar is not actually consulted in conformance tests (the `javascript-opentimestamps` library is an optional dep). `SF1.sig` is an Ed25519 signature over `SF1.bundle.data || SF1.merkleProof.data || SF1.ots.data` produced with the deterministic test seed `SF1_TEST_APP_SEED` (bytes `0x00..0x1F`).

Verifiers running in `bitcoinProofMode: "xrpl-sf1ots"` SHOULD return one of:
- `tier3.status: "verified"` (when an OTS library is installed and resolves the proof to a Bitcoin block), or
- `tier3.status: "attested-on-chain"` (when no OTS library is installed; the XRPL leg fully verified, Bitcoin block resolution skipped).

The good vectors are byte-identical to `examples/single-channel-event.json` and `examples/four-channel-event.json` after canonicalisation. The bad vectors are derived from the same inputs and tweaked to exercise one specific verifier rejection path each. Sidecar `*.expected.json` files name the `verified: false` reason code the reference verifier MUST emit.

## Deterministic test seed (joint-plan-final §D11)

The conformance vectors are reproducible because the Ed25519 application key is derived from a fixed, public seed:

```
SF1_TEST_APP_SEED = bytes 0x00..0x1F (32 bytes: 0x00 0x01 0x02 ... 0x1F)
```

The corresponding Ed25519 public key (32 bytes, raw):

```
03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8
```

This public key is shipped as the testnet entry's `appPublicKey` in `reference-verifier/src/registry.js`. Together with the deterministic seed, anyone running the vector generator (Node or C#) reproduces every byte of every vector — no shared secret material is required.

The seed and its public key are intended for **conformance testing only**. They MUST NOT be used to anchor real production data; the bundled testnet registry entry's `organisation` field starts with the literal `"TESTNET — DEMO ONLY"` so any audit log sees the demo-ness immediately.

## Regenerating the vectors

When the schema or examples change, vectors must be regenerated. Two equivalent generators exist:

- **Node generator** (used by the schema dev during S9 to bootstrap the vectors). Run from the repo root:
  ```
  node _team/build-conformance-vectors.mjs
  ```
- **C# generator** (S9.5, lives alongside this README). Run with:
  ```
  dotnet run --project conformance --regen-vectors
  ```

Either generator MUST produce byte-identical files. CI on every release runs the C# generator into a temp directory and diffs against the committed vectors; any drift fails the release. The generator never runs automatically — maintainers run it explicitly when schema changes warrant a vector refresh, and the resulting diff goes through review.

## Self-certification

A vendor claiming SecureFusion v1 compliance for a release SHOULD:

1. Run their implementation against the full conformance vector set.
2. Confirm every good vector verifies, every bad vector fails with the matching reason code, and the canonicalisation of each manifest produces the bundleHash recorded in `examples/test-vectors.json`.
3. Publish a self-certification statement listing the implementation, the spec version, and the date of testing.
4. Open an issue in this repository to request listing in the public registry of compliant implementations.

The maintainers do not gate compliance — any implementation that matches the reference verifier on the published vectors may describe itself as SecureFusion-compliant.

## Adding a vector

Contribute via PR:

1. Add the vector file under `conformance/vectors/` and a matching `*.expected.json` if the vector is expected to fail verification.
2. Update `examples/test-vectors.json` (or the appropriate vector index file) with any new expected outputs.
3. Add a test in `reference-verifier/tests/` that asserts the vector behaves as expected.
4. Document the edge case the vector is intended to exercise in this README.
