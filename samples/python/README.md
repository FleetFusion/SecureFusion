# SecureFusion v1.0 — Python anchor producer

A self-contained Python implementation of the SecureFusion anchor producer. Demonstrates how to build the three SecureFusion memos for a single video event, ready to attach to an XRPL `Payment` transaction.

## Files

| File | Purpose |
|---|---|
| `securefusion_anchor.py` | Anchor builder + canonical JSON + demo entry point. |
| `submit_xrpl.py` | XRPL submission example (uses `xrpl-py`). |
| `submit_bitcoin.py` | Bitcoin / OpenTimestamps submission example (uses `urllib`). |

## Requirements

- **Python 3.10+** (for modern type hints)
- One of:
  - [`cryptography`](https://pypi.org/project/cryptography/) (recommended): `pip install cryptography`
  - [`PyNaCl`](https://pypi.org/project/PyNaCl/): `pip install pynacl`
- For actual XRPL submission: [`xrpl-py`](https://pypi.org/project/xrpl-py/): `pip install xrpl-py`

The hashing and canonicalisation code uses only the Python standard library — no third-party dependency is required just to compute the `bundleHash`.

## Run the demo

```bash
python3 securefusion_anchor.py
```

Expected output:

```
SecureFusion v1.0 — Python anchor producer sample
============================================================

  Manifest:    single-channel-event.json
  bundleHash:  e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
  ...
  match:       [OK]

  Manifest:    four-channel-event.json
  bundleHash:  8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
  ...
  match:       [OK]

[OK] All test vectors match.
```

If your output matches, your canonicalisation is conformant with the SecureFusion v1.0 standard.

## Submitting to XRPL with `xrpl-py`

The runnable submission example is in [`submit_xrpl.py`](submit_xrpl.py). After `pip install xrpl-py`:

```bash
export SECUREFUSION_XRPL_SEED=s...                    # XRPL wallet seed
export SECUREFUSION_APP_KEY_HEX=64-hex-char-Ed25519   # 32-byte seed
python3 submit_xrpl.py
```

For testnet, get a funded wallet at <https://xrpl.org/xrp-testnet-faucet.html>.

## Submitting to Bitcoin via OpenTimestamps

The OpenTimestamps submission example is in [`submit_bitcoin.py`](submit_bitcoin.py). It uses Python's standard library only — no third-party packages:

```bash
python3 submit_bitcoin.py
```

This POSTs the bundleHash to multiple OpenTimestamps calendar servers and saves a partial `.ots` proof. The proof becomes complete once Bitcoin includes the calendar's commitment (~1 hour). For production-grade `.ots` files with automatic upgrading, install the official client:

```bash
pip install opentimestamps-client
```

**Important — two distinct keys:**
- The XRPL account key (in `wallet`) signs the transaction wrapper. Used for fees and sequencing.
- The application Ed25519 key (`app_key_bytes`) signs the memo payload. Held separately, ideally in an HSM.

Verifiers check both signatures.

## Production guidance

- **Never load the application signing key from a file in production.** Use Azure Key Vault Managed HSM, AWS CloudHSM, GCP Cloud KMS, or an equivalent. The samples here read from variables for demonstration only.
- **Hash the video bytes as received** — before any transcoding, watermarking, or processing. This is what the SecureFusion guarantee depends on.
- **Stream large files** — `sha256_file()` in this sample uses 64 KB chunks so it doesn't load entire video files into memory.
- **Reuse the XRPL account** — a single SecureFusion XRPL account anchors all your tenants' events; tenant identity lives in the manifest, not in the account address. See [GOVERNANCE.md](../../GOVERNANCE.md) and the spec for the per-tenant alternative model.
- **Sequence handling at scale** — for high-volume implementers, use XRPL Tickets (`TicketCreate`) to allow parallel transaction submission. `xrpl-py` supports this directly.

## What the code does

- `canonicalise()` — RFC 8785-style canonical JSON serialisation (sorted keys, no whitespace, UTF-8, minimal escaping). Every key is hashed; comments belong in sibling `*.meta.json` files, never in the manifest itself.
- `sha256_hex()` / `sha256_file()` — content hashing.
- `encode_bundle_memo()` — the 50-byte `SF1.bundle` binary header.
- `build_memos()` — the three-memo XRPL payload structure.
- `ed25519_sign()` — signs the application attestation using `cryptography` or PyNaCl, whichever is installed.
- `build_anchor_payload()` — end-to-end: takes a manifest dict, returns everything needed to submit.

## Licence

Apache 2.0 — see [../../LICENSE-CODE](../../LICENSE-CODE).
