# SecureFusion v1.0 - Java anchor producer

A Java implementation of the SecureFusion v1 anchor producer. Mirrors `FleetAssistant.SecureFusion.SecureManifestBuilder` byte-for-byte so the demo output bundleHashes match `examples/test-vectors.json`.

## Files

| File | Purpose |
|---|---|
| `SecureFusionAnchor.java` | Anchor builder, hand-rolled canonicaliser, tiny embedded JSON parser. Demo entry point. |
| `pom.xml` | Maven build with BouncyCastle dependency wired up. |
| `submit_xrpl/SubmitXrpl.java` | XRPL submission snippet (uses `xrpl4j`). Reference only. |
| `submit_bitcoin/SubmitBitcoin.java` | Bitcoin / OpenTimestamps snippet (stdlib HTTP). Reference only. |

## Requirements

- **JDK 17+** (uses pattern-matching `instanceof` and records).
- **BouncyCastle** for Ed25519 signing. The `pom.xml` wires `org.bouncycastle:bcprov-jdk18on:1.78.1`. Without BouncyCastle on the classpath the demo throws a clear error explaining how to add it.

For XRPL submission, [`xrpl4j`](https://github.com/XRPLF/xrpl4j) is the official Java XRPL client. The submit snippet shows the call shape; you'll add the dependency in your own project.

## Run the demo

With Maven:

```bash
cd samples/java
mvn compile exec:java -Dexec.mainClass=SecureFusionAnchor
```

With plain `javac` (drop `bcprov-jdk18on-1.78.1.jar` into `lib/` first):

```bash
cd samples/java
javac -cp "lib/*" SecureFusionAnchor.java
# Linux / macOS:
java  -cp ".:lib/*" SecureFusionAnchor
# Windows:
java  -cp ".;lib/*" SecureFusionAnchor
```

Expected output:

```
SecureFusion v1.0 - Java anchor producer sample
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

## Run the XRPL submission example

After adding xrpl4j to your project's dependencies and uncommenting the active block in `submit_xrpl/SubmitXrpl.java`:

```bash
export SECUREFUSION_XRPL_SEED=s...                    # XRPL wallet seed
export SECUREFUSION_APP_KEY_HEX=64-hex-char-Ed25519   # 32-byte app seed

mvn compile exec:java -Dexec.mainClass=SubmitXrpl
```

For testnet, get a funded wallet at <https://xrpl.org/xrp-testnet-faucet.html>.

## Run the OpenTimestamps submission example

```bash
mvn compile exec:java -Dexec.mainClass=SubmitBitcoin
```

This produces a partial `.ots` proof file. The proof becomes complete once Bitcoin includes the calendar's commitment (~1 hour). Production code should call the calendars' upgrade API later to attach the Bitcoin block reference.

## Notes for production

- **Replace the embedded `TinyJson` with Jackson or Gson.** The bundled parser exists only to keep the demo free of dependencies for reading example JSON. The canonical writer (`CanonicalJson.serialise`) is hand-rolled because no third-party library reproduces FleetFusion's exact bytes — keep it.
- **Never call `Instant.toString()` to produce timestamps.** It strips trailing zero-millisecond digits (`...:00Z` instead of `...:00.000Z`) which would diverge from FleetFusion. Use `formatTimestamp(Instant)`.
- **Never use `UUID.getMostSignificantBits()` to encode the SF1.bundle eventIdGuid.** That gives RFC 4122 big-endian bytes; FleetFusion writes `Guid.ToByteArray()` mixed-endian. Use `toDotNetGuidBytes(uuidStr)`.
- **Never load the application Ed25519 key from a file or environment variable in production.** Use AWS CloudHSM, GCP Cloud KMS, or platform-equivalent. The sample uses a deterministic test seed for reproducibility only.
- **Hash the inbound video bytes BEFORE any processing** — transcoding, watermarking, etc. The SecureFusion guarantee starts at first hash, so first hash must capture original bytes.
- **Use TicketCreate for high-volume sequencing.** xrpl4j supports ticket-based parallel transaction submission.
- **Use a single SecureFusion XRPL account across all tenants** — tenant identity belongs in the manifest, not in the account address.

## What the code does

- `SecureFusionAnchor.buildAnchorPayload(manifest, appSeed32)` — end-to-end: takes a parsed manifest, returns the bundle bytes, the signed memos, and the bundleHash.
- `SecureFusionAnchor.encodeBundleMemo(bundleHash, eventId, source, channelCount)` — the 50-byte `SF1.bundle` binary header. Calls `toDotNetGuidBytes` for the 16-byte eventIdGuid slot.
- `SecureFusionAnchor.toDotNetGuidBytes(uuidStr)` — converts a UUID string to .NET `Guid.ToByteArray()` byte order (Data1/2/3 little-endian, Data4 verbatim) so SF1.bundle is byte-stable across the .NET reference and Java port.
- `CanonicalJson.serialise(value)` — alpha-sorted, no-whitespace, integer-only canonical JSON.
- `formatTimestamp(Instant)` — manual `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` formatter.
- `ed25519Sign(message, seed32)` — Ed25519 via BouncyCastle's `Ed25519Signer`. Loaded by reflection so the file compiles without BC; runtime call fails with a clear message.

## Licence

Apache 2.0 — see [../../LICENSE-CODE](../../LICENSE-CODE).
