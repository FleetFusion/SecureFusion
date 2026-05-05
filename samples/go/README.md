# SecureFusion v1.0 — Go anchor producer

A self-contained Go implementation of the SecureFusion anchor producer. Standard library only — `crypto/sha256`, `crypto/ed25519`, and `encoding/json` are all that's needed for the canonical hash.

## Files

| File | Purpose |
|---|---|
| `anchor.go` | Anchor builder + canonical JSON + demo entry point. |
| `submit_xrpl/main.go` | XRPL submission example (uses `Peersyst/xrpl-go`). |
| `submit_bitcoin/main.go` | Bitcoin / OpenTimestamps submission example (stdlib `net/http`). |

The submission examples are in subdirectories because each is its own `package main` — the idiomatic Go layout for multiple commands sharing a module.

## Requirements

- **Go 1.21+** (uses `any` and modern stdlib `crypto/ed25519`)

For XRPL submission: [`Peersyst/xrpl-go`](https://github.com/Peersyst/xrpl-go) is the actively maintained Go client. Older alternatives include `rubblelabs/ripple` (lower-level).

```bash
go get github.com/Peersyst/xrpl-go@latest
```

## Run the demo (anchor only, stdlib only)

```bash
cd samples/go
go run anchor.go
```

Expected output:

```
SecureFusion v1.0 — Go anchor producer sample
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

## Run the XRPL submission example

After adding `Peersyst/xrpl-go` to `go.mod` and uncommenting the active block in `submit_xrpl/main.go`:

```bash
export SECUREFUSION_XRPL_SEED=s...                    # XRPL wallet seed
export SECUREFUSION_APP_KEY_HEX=64-hex-char-Ed25519   # 32-byte seed

cd samples/go/submit_xrpl
go run main.go
```

For testnet, get a funded wallet at <https://xrpl.org/xrp-testnet-faucet.html>.

## Run the OpenTimestamps submission example

```bash
cd samples/go/submit_bitcoin
go run main.go
```

This produces a `<bundleHash>.partial.ots` file. The proof becomes complete once Bitcoin commits to the calendar (~1 hour). Production code should call the calendars' upgrade API later to attach the Bitcoin block reference.

## Notes for production

- **Hold the application Ed25519 key in an HSM** (AWS CloudHSM, GCP Cloud KMS, or equivalent). The samples take the key as a `[]byte` for clarity — production must not.
- **Hash the inbound video bytes before any processing** — transcoding, watermarking, etc. The SecureFusion guarantee starts at first hash.
- **Use TicketCreate for high-volume submission.** XRPL Tickets enable parallel transaction submission, which Go's concurrency model is well suited to.
- **Use a single SecureFusion XRPL account across all tenants** — tenant identity belongs in the manifest.

## What the code does

- `BuildAnchorPayload(manifest, appKey32)` — end-to-end: takes a parsed manifest, returns the bundleHash, raw memo bytes, and the `Memo` array suitable for an XRPL Payment.
- `encodeBundleMemo(...)` — the 50-byte `SF1.bundle` binary header.
- `canonicalise(value)` — RFC 8785-compatible canonical JSON.
- Ed25519 signing uses `crypto/ed25519` from the standard library — no third-party dependency required.

## Module layout

```
samples/go/
├── go.mod
├── anchor.go                       ← runs the demo (package main)
├── submit_xrpl/main.go             ← XRPL submission (separate package main)
└── submit_bitcoin/main.go          ← OpenTimestamps submission (separate package main)
```

A real project would extract the shared anchor logic into a library package (e.g. `internal/securefusion`) and have each `cmd/<tool>` import it. The samples duplicate the canonicalisation code intentionally so each file is readable on its own.

## Licence

Apache 2.0 — see [../../LICENSE-CODE](../../LICENSE-CODE).
