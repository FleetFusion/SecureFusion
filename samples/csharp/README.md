# SecureFusion v1.0 — C# / .NET 8 anchor producer

A self-contained .NET 8 implementation of the SecureFusion v1 anchor producer. Builds the three SF1 memos for a video event, ready to attach to an XRPL `Payment` transaction. Mirrors `FleetAssistant.SecureFusion.SecureManifestBuilder` and `FleetFusion.Functions.Workers.SecureFusion.RippledXrpAnchorClient` byte-for-byte so the demo's output bundleHashes match the values in [examples/test-vectors.json](../../examples/test-vectors.json).

## Files

| File | Purpose |
|---|---|
| `Program.cs` | Anchor builder (canonical JSON + bundle bytes + Ed25519 signature) and demo entry point. |
| `submit_xrpl/SubmitXrpl.cs` | Reference XRPL submission snippet (uses `Xrpl.NET`). Excluded from the default compile — see notes below. |
| `submit_bitcoin/SubmitBitcoin.cs` | Reference Bitcoin / OpenTimestamps snippet (uses `HttpClient`). Excluded from the default compile. |
| `SecureFusion.Samples.CSharp.csproj` | Project file. References `NSec.Cryptography` for Ed25519. |

## Requirements

- **.NET 8 SDK** (or newer).

The project file already references [`NSec.Cryptography`](https://www.nuget.org/packages/NSec.Cryptography/) (a managed wrapper over libsodium). If you prefer [`BouncyCastle.Cryptography`](https://www.nuget.org/packages/BouncyCastle.Cryptography/), swap the reference in the csproj — both will produce byte-identical signatures over the same input.

For actual XRPL submission, the actively maintained options are [`Xrpl.NET`](https://www.nuget.org/packages/Xrpl.NET/) (community) and the cross-platform [`xrpl-dotnet`](https://github.com/Transia-RnD/Xrpl4j) family. The bundled `submit_xrpl/SubmitXrpl.cs` uses `Xrpl.NET` shapes; copy it into a separate project (with that NuGet package added) when you want to drive a real submission.

## Run the demo

```bash
dotnet run --project samples/csharp
```

Expected output:

```
SecureFusion v1.0 - C# anchor producer sample
============================================================

  Manifest:    single-channel-event.json
  bundleHash:  e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
  expected:    e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
  match:       [OK]
  channels:    1
  bundle:      50 bytes
  signature:   <hex prefix>...

  Manifest:    four-channel-event.json
  bundleHash:  8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
  expected:    8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
  match:       [OK]
  channels:    4
  bundle:      50 bytes
  signature:   <hex prefix>...

[OK] All test vectors match.
```

If your output matches, your implementation is conformant with the SecureFusion v1.0 standard for canonicalisation, the 50-byte SF1.bundle layout, and the Ed25519 SF1.sig over `(bundleBytes || eventBytes)` using the deterministic test seed.

## Submitting to XRPL

The reference submission snippet is in [`submit_xrpl/SubmitXrpl.cs`](submit_xrpl/SubmitXrpl.cs). It is **excluded from the default compile** because it has its own `Main` and depends on `Xrpl.NET`. To use it:

1. Copy the file into a new console project.
2. `dotnet add package Xrpl.NET`.
3. `dotnet add package NSec.Cryptography`.
4. Set environment variables:
   ```bash
   export SECUREFUSION_XRPL_SEED=s...                    # XRPL wallet seed
   export SECUREFUSION_APP_KEY_HEX=64-hex-char-Ed25519   # 32-byte app seed
   ```
5. `dotnet run --project <your-project>`.

The snippet builds the SecureFusion payload (canonical hash + signed memos) and shows the exact `Xrpl.NET` calls needed to attach the memos to a self-pay 10-drop Payment and submit it.

## Submitting to Bitcoin via OpenTimestamps

The reference Bitcoin submission snippet is in [`submit_bitcoin/SubmitBitcoin.cs`](submit_bitcoin/SubmitBitcoin.cs). Like the XRPL snippet it has its own `Main` and is excluded from the default compile. It uses only the BCL `HttpClient` — no third-party dependencies — and POSTs the bundleHash to multiple OpenTimestamps calendar servers. The proof becomes complete once Bitcoin includes the calendar's commitment (~1 hour later).

## Two distinct keys, two distinct signatures

- The **XRPL account key** signs the *transaction wrapper* (handled by the XRPL library when you submit).
- The **application Ed25519 key** signs the *memo payload* (handled by `AnchorBuilder.SignAppMemo`, embedded in the `SF1.sig` memo).

Verifiers check both. See [spec/memo-format.md §5.1](../../spec/memo-format.md).

## Production guidance

- **Hash before processing.** The sample reads the manifest from disk; in production, hash the inbound video bytes at the ingest gateway before any transcoding. This is the moment the SecureFusion guarantee starts.
- **Hold the application key in Azure Key Vault Managed HSM.** The sample uses a deterministic test seed for reproducibility. Production code MUST call into Key Vault and never let the raw key material touch application memory.
- **Use Tickets for high-volume sequencing.** XRPL's `TicketCreate` lets you allocate a pool of sequence numbers and submit in parallel. Most XRPL libraries support this directly.
- **Stream large files.** Use `SHA256.HashData(Stream)` (in `System.Security.Cryptography`) rather than reading entire video files into memory.
- **Use a single SecureFusion XRPL account across all tenants.** Tenant identity belongs in the manifest, not in the account address. See `GOVERNANCE.md` for the rationale.

## Architecture: where this fits in FleetFusion / ABP Framework

In an ABP Framework application this sample maps onto:

```
Domain/SecureFusion/
+- SecureManifestBuilder.cs                <- canonical JSON + bundleHash
Functions.Workers/SecureFusion/
+- RippledXrpAnchorClient.cs               <- 50-byte SF1.bundle + Ed25519 SF1.sig + submit
+- IXrpAnchorClient.cs                      <- interface
+- XrpAnchorWorker.cs                       <- Service Bus consumer
```

A `BackgroundService` consuming a `Service Bus` queue is the recommended deployment shape — see [spec/SPEC.md §7](../../spec/SPEC.md).

## What the code does

- `SecureManifestEmitter.Emit(Manifest)` — produces the canonical UTF-8 bytes and the bundleHash, mirroring `SecureManifestBuilder.Build` exactly.
- `AnchorBuilder.Build(...)` — end-to-end: takes the bundleHash + manifest JSON + ingest source code + channel count + app seed, returns the three memos plus the raw bundle and signature bytes.
- `AnchorBuilder.BuildBundleMemoBytes(...)` — the 50-byte `SF1.bundle` binary header. Uses `Guid.ToByteArray()` (mixed-endian) to match `RippledXrpAnchorClient.BuildBundleMemoBytes`.
- `AnchorBuilder.SignAppMemo(...)` — Ed25519 over `(bundleBytes || eventBytes)` using NSec.Cryptography.
- `AnchorBuilder.DerivePublicKey(...)` — derives the Ed25519 public key from a 32-byte seed; useful for confirming a registry entry's `appPublicKey` matches the seed you configured.

## Licence

Apache 2.0 — see [../../LICENSE-CODE](../../LICENSE-CODE).
