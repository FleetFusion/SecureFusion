// SecureFusion v1.0 (SF1) anchor producer - C# / .NET 8 sample.
//
// Mirrors FleetFusion's production builder (SecureManifestBuilder.cs +
// RippledXrpAnchorClient.cs) exactly:
//   - Utf8JsonWriter with default options (Indented=false, SkipValidation=false)
//   - Keys written in alphabetical order (no runtime sort - we write them
//     in the order the schema defines, which is alphabetical by codepoint).
//   - ingestSource is the literal string "fleetfusion" (single-value enum in v1).
//   - Always emit sealedAt and vehicleEventId.
//   - Omit tenantId / signerKeyId when null or empty (per spec §6.1.7).
//   - Channel capturedAt / durationMs are emitted only when present.
//   - SF1.bundle layout: bundleHash(32) || eventIdGuid(16) || sourceCode(1) ||
//     channelCount(1), 50 bytes total. eventIdGuid uses .NET Guid.ToByteArray()
//     byte order (mixed-endian) to match RippledXrpAnchorClient exactly.
//   - SF1.sig is Ed25519 over (bundleBytes || eventBytes) using the deterministic
//     test seed (32 bytes 0x00..0x1F per joint-plan-final §D11).
//
// Run:
//     dotnet run --project samples/csharp
//
// The output bundleHashes are baked into examples/test-vectors.json. If your
// implementation produces matching hashes you are SecureFusion v1 conformant
// for canonicalisation + bundle layout.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NSec.Cryptography;

namespace SecureFusion.Samples.CSharp;

public static class Program
{
    /// <summary>
    /// Deterministic Ed25519 application-key seed used to produce SF1.sig in the
    /// conformance vectors. Bytes 0x00..0x1F. See conformance/README.md and
    /// joint-plan-final §D11. The corresponding public key is recorded once in
    /// conformance/README.md and shipped as the testnet entry's appPublicKey
    /// in reference-verifier/src/registry.js.
    /// </summary>
    public static readonly byte[] TestAppSeed = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();

    public static int Main()
    {
        Console.WriteLine("SecureFusion v1.0 - C# anchor producer sample");
        Console.WriteLine(new string('=', 60));

        var examplesDir = FindExamplesDir();
        var expected = LoadExpectedBundleHashes(examplesDir);

        var allOk = true;
        foreach (var (filename, expectedHash) in expected)
        {
            var path = Path.Combine(examplesDir, filename);
            var pretty = File.ReadAllText(path);
            var manifest = ManifestParser.Parse(pretty);

            var sealResult = SecureManifestEmitter.Emit(manifest);
            var payload = AnchorBuilder.Build(
                bundleHashHex: sealResult.BundleHash,
                eventIdGuid: Guid.Parse(manifest.EventId),
                manifestJson: sealResult.CanonicalJson,
                ingestSourceCode: SourceCodeFor(manifest.IngestSource),
                channelCount: (byte)manifest.Channels.Count,
                appSeed32: TestAppSeed);

            var ok = string.Equals(payload.BundleHash, expectedHash, StringComparison.Ordinal);
            allOk &= ok;

            Console.WriteLine();
            Console.WriteLine($"  Manifest:    {filename}");
            Console.WriteLine($"  bundleHash:  {payload.BundleHash}");
            Console.WriteLine($"  expected:    {expectedHash}");
            Console.WriteLine($"  match:       {(ok ? "[OK]" : "[FAIL]")}");
            Console.WriteLine($"  channels:    {manifest.Channels.Count}");
            Console.WriteLine($"  bundle:      {payload.BundleBytes.Length} bytes");
            Console.WriteLine($"  signature:   {Convert.ToHexString(payload.Signature).ToLowerInvariant()[..32]}...");
        }

        Console.WriteLine();
        if (allOk)
        {
            Console.WriteLine("[OK] All test vectors match.");
            return 0;
        }
        Console.WriteLine("[FAIL] One or more test vectors did not match.");
        return 1;
    }

    private static byte SourceCodeFor(string ingestSource) =>
        // SecureFusion v1: single-value enum, single source-code byte.
        string.Equals(ingestSource, "fleetfusion", StringComparison.Ordinal)
            ? (byte)0x01
            : throw new ArgumentException($"Unknown ingestSource '{ingestSource}'");

    private static string FindExamplesDir()
    {
        var dir = AppContext.BaseDirectory;
        for (int i = 0; i < 10; i++)
        {
            var candidate = Path.Combine(dir, "examples");
            if (Directory.Exists(candidate)) return candidate;
            dir = Path.GetDirectoryName(dir) ?? dir;
        }
        throw new DirectoryNotFoundException("Could not locate the SecureFusion examples directory");
    }

    private static List<(string filename, string expectedHash)> LoadExpectedBundleHashes(string examplesDir)
    {
        var path = Path.Combine(examplesDir, "test-vectors.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var vectors = doc.RootElement.GetProperty("vectors");
        var list = new List<(string, string)>();
        foreach (var v in vectors.EnumerateArray())
        {
            list.Add((v.GetProperty("manifest").GetString()!, v.GetProperty("bundleHash").GetString()!));
        }
        return list;
    }
}

// ---------------------------------------------------------------------
// Strongly-typed manifest (mirrors FleetAssistant.SecureFusion.SecureManifestInput).
// ---------------------------------------------------------------------

public sealed record Manifest(
    string EventId,
    string IngestSource,
    DateTime IngestedAt,
    DateTime OccurredAt,
    DateTime SealedAt,
    string? SignerKeyId,
    string? TenantId,
    string VehicleEventId,
    string VehicleId,
    IReadOnlyList<ManifestChannel> Channels);

public sealed record ManifestChannel(
    string ChannelId,
    string Sha256,
    long SizeBytes,
    int? DurationMs,
    DateTime? CapturedAt);

// ---------------------------------------------------------------------
// Manifest parser. The on-disk JSON is pretty-printed for readability;
// we re-canonicalise (alpha-sort, no whitespace) before hashing.
// ---------------------------------------------------------------------

public static class ManifestParser
{
    public static Manifest Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var channels = root.GetProperty("channels").EnumerateArray()
            .Select(c => new ManifestChannel(
                ChannelId: c.GetProperty("channelId").GetString()!,
                Sha256: c.GetProperty("sha256").GetString()!,
                SizeBytes: c.GetProperty("sizeBytes").GetInt64(),
                DurationMs: c.TryGetProperty("durationMs", out var d) ? d.GetInt32() : (int?)null,
                CapturedAt: c.TryGetProperty("capturedAt", out var ca) ? ParseUtc(ca.GetString()!) : (DateTime?)null))
            .ToList();

        return new Manifest(
            EventId: root.GetProperty("eventId").GetString()!,
            IngestSource: root.GetProperty("ingestSource").GetString()!,
            IngestedAt: ParseUtc(root.GetProperty("ingestedAt").GetString()!),
            OccurredAt: ParseUtc(root.GetProperty("occurredAt").GetString()!),
            SealedAt: ParseUtc(root.GetProperty("sealedAt").GetString()!),
            SignerKeyId: root.TryGetProperty("signerKeyId", out var sk) ? sk.GetString() : null,
            TenantId: root.TryGetProperty("tenantId", out var t) ? t.GetString() : null,
            VehicleEventId: root.GetProperty("vehicleEventId").GetString()!,
            VehicleId: root.GetProperty("vehicleId").GetString()!,
            Channels: channels);
    }

    private static DateTime ParseUtc(string s) =>
        DateTime.SpecifyKind(
            DateTime.ParseExact(s, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
            DateTimeKind.Utc);
}

// ---------------------------------------------------------------------
// Canonical emitter - mirrors FleetAssistant.SecureFusion.SecureManifestBuilder
// byte-for-byte.
// ---------------------------------------------------------------------

public sealed record SecureManifestResult(string CanonicalJson, string BundleHash);

public static class SecureManifestEmitter
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    public static SecureManifestResult Emit(Manifest input)
    {
        if (input.Channels == null || input.Channels.Count == 0)
            throw new ArgumentException("At least one channel is required.");
        if (string.IsNullOrWhiteSpace(input.IngestSource))
            throw new ArgumentException("IngestSource is required.");

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = false, SkipValidation = false }))
        {
            writer.WriteStartObject();

            writer.WritePropertyName("channels");
            writer.WriteStartArray();
            foreach (var ch in input.Channels.OrderBy(c => c.ChannelId, StringComparer.Ordinal))
            {
                if (ch.Sha256 == null || ch.Sha256.Length != 64)
                    throw new ArgumentException($"Channel '{ch.ChannelId}' has invalid sha256 (expected 64 hex chars).");

                writer.WriteStartObject();
                if (ch.CapturedAt.HasValue)
                    writer.WriteString("capturedAt", FormatDate(ch.CapturedAt.Value));
                writer.WriteString("channelId", ch.ChannelId);
                if (ch.DurationMs.HasValue)
                    writer.WriteNumber("durationMs", ch.DurationMs.Value);
                writer.WriteString("sha256", ch.Sha256);
                writer.WriteNumber("sizeBytes", ch.SizeBytes);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();

            writer.WriteString("eventId", input.EventId);
            writer.WriteString("ingestSource", input.IngestSource);
            writer.WriteString("ingestedAt", FormatDate(input.IngestedAt));
            writer.WriteString("occurredAt", FormatDate(input.OccurredAt));
            writer.WriteString("sealedAt", FormatDate(input.SealedAt));

            // Omit-when-empty (spec §6.1.7).
            if (!string.IsNullOrEmpty(input.SignerKeyId))
                writer.WriteString("signerKeyId", input.SignerKeyId);
            if (!string.IsNullOrEmpty(input.TenantId))
                writer.WriteString("tenantId", input.TenantId);

            writer.WriteNumber("v", 1);
            writer.WriteString("vehicleEventId", input.VehicleEventId);
            writer.WriteString("vehicleId", input.VehicleId);

            writer.WriteEndObject();
        }

        var bytes = stream.ToArray();
        var canonicalJson = Utf8NoBom.GetString(bytes);

        var hash = SHA256.HashData(bytes);
        var bundleHash = Convert.ToHexString(hash).ToLowerInvariant();

        return new SecureManifestResult(canonicalJson, bundleHash);
    }

    private static string FormatDate(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
    }
}

// ---------------------------------------------------------------------
// Anchor payload - mirrors FleetFusion.Functions.Workers.SecureFusion
// .RippledXrpAnchorClient.BuildBundleMemoBytes / SignAppMemo.
// ---------------------------------------------------------------------

public sealed record AnchorPayload(
    string BundleHash,
    byte[] BundleBytes,
    byte[] EventBytes,
    byte[] Signature,
    XrplMemo[] Memos);

public sealed record XrplMemo(string MemoType, string MemoFormat, string MemoData);

public static class AnchorBuilder
{
    public static AnchorPayload Build(
        string bundleHashHex,
        Guid eventIdGuid,
        string manifestJson,
        byte ingestSourceCode,
        byte channelCount,
        byte[] appSeed32)
    {
        var bundleBytes = BuildBundleMemoBytes(bundleHashHex, eventIdGuid, ingestSourceCode, channelCount);
        var eventBytes = Encoding.UTF8.GetBytes(manifestJson);
        var sigBytes = SignAppMemo(appSeed32, bundleBytes, eventBytes);

        var memos = new[]
        {
            new XrplMemo(HexUtf8("SF1.bundle"), HexUtf8("application/octet-stream"), Convert.ToHexString(bundleBytes)),
            new XrplMemo(HexUtf8("SF1.event"),  HexUtf8("application/json"),         Convert.ToHexString(eventBytes)),
            new XrplMemo(HexUtf8("SF1.sig"),    HexUtf8("application/octet-stream"), Convert.ToHexString(sigBytes)),
        };

        return new AnchorPayload(bundleHashHex, bundleBytes, eventBytes, sigBytes, memos);
    }

    /// <summary>
    /// Build the 50-byte SF1.bundle binary payload. Mirrors RippledXrpAnchorClient
    /// exactly, including the .NET Guid.ToByteArray() byte order.
    /// </summary>
    public static byte[] BuildBundleMemoBytes(string bundleHashHex, Guid eventIdGuid, byte sourceCode, byte channelCount)
    {
        var hashBytes = Convert.FromHexString(bundleHashHex);
        if (hashBytes.Length != 32)
            throw new ArgumentException($"BundleHash must be 64 hex chars (32 bytes); got {hashBytes.Length}.");

        var guid = eventIdGuid.ToByteArray(); // .NET mixed-endian (matches RippledXrpAnchorClient)
        var bundle = new byte[32 + 16 + 1 + 1];
        Buffer.BlockCopy(hashBytes, 0, bundle, 0, 32);
        Buffer.BlockCopy(guid, 0, bundle, 32, 16);
        bundle[48] = sourceCode;
        bundle[49] = channelCount;
        return bundle;
    }

    /// <summary>
    /// Ed25519-sign (bundleBytes || eventBytes) with the application key. Returns
    /// the 64-byte signature. Mirrors RippledXrpAnchorClient.SignAppMemo.
    /// </summary>
    public static byte[] SignAppMemo(byte[] privateSeed32, byte[] bundleBytes, byte[] eventBytes)
    {
        var canonical = new byte[bundleBytes.Length + eventBytes.Length];
        Buffer.BlockCopy(bundleBytes, 0, canonical, 0, bundleBytes.Length);
        Buffer.BlockCopy(eventBytes, 0, canonical, bundleBytes.Length, eventBytes.Length);

        using var key = Key.Import(
            SignatureAlgorithm.Ed25519,
            privateSeed32,
            KeyBlobFormat.RawPrivateKey);
        return SignatureAlgorithm.Ed25519.Sign(key, canonical);
    }

    /// <summary>
    /// Compute the Ed25519 public key bytes (32 bytes) for a 32-byte seed. Used by
    /// the conformance vector generator and the demo's banner so callers can
    /// confirm the testnet registry entry's appPublicKey matches.
    /// </summary>
    public static byte[] DerivePublicKey(byte[] privateSeed32)
    {
        using var key = Key.Import(
            SignatureAlgorithm.Ed25519,
            privateSeed32,
            KeyBlobFormat.RawPrivateKey,
            new KeyCreationParameters { ExportPolicy = KeyExportPolicies.AllowPlaintextExport });
        var publicKey = key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
        return publicKey;
    }

    private static string HexUtf8(string s) =>
        Convert.ToHexString(Encoding.UTF8.GetBytes(s));
}
