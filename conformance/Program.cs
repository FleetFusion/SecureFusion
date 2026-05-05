// SecureFusion v1 conformance vector generator (S9.5).
//
// Usage:
//     dotnet run --project conformance -- --regen-vectors
//
// Reads examples/*.json, mirrors FleetAssistant.SecureFusion.SecureManifestBuilder
// byte-for-byte (Utf8JsonWriter default options, alpha-sort keys, single-value
// ingestSource enum "fleetfusion", omit-when-empty optional fields), builds the 50-byte SF1.bundle
// (Guid.ToByteArray mixed-endian, matching RippledXrpAnchorClient), signs
// SF1.sig with NSec.Cryptography Ed25519 using the deterministic test seed
// (bytes 0x00..0x1F per joint-plan-final §D11), and writes the conformance/
// vectors/* set. Output is byte-identical to _team/build-conformance-vectors.mjs.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using NSec.Cryptography;

namespace SecureFusion.Conformance.Generate;

public static class Program
{
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);
    private static readonly byte[] TestSeed = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();

    private const string TestnetAccount = "rSF1TESTNETxxxxxxxxxxxxxxxxxxxxxxx";
    private const string WrongAccount = "rATTACKERxxxxxxxxxxxxxxxxxxxxxxxxxx";
    private const string TxHash = "0BAD0000F00DC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DEC0DE";

    public static int Main(string[] args)
    {
        if (!args.Contains("--regen-vectors"))
        {
            Console.WriteLine("SecureFusion v1 conformance vector generator");
            Console.WriteLine();
            Console.WriteLine("  usage: dotnet run --project conformance -- --regen-vectors");
            Console.WriteLine();
            Console.WriteLine("  Without --regen-vectors this tool prints help and exits 0.");
            return 0;
        }

        var repoRoot = FindRepoRoot();
        var examplesDir = Path.Combine(repoRoot, "examples");
        var vectorsDir = Path.Combine(repoRoot, "conformance", "vectors");
        Directory.CreateDirectory(vectorsDir);

        var sc = LoadAndSeal(Path.Combine(examplesDir, "single-channel-event.json"));
        var mc = LoadAndSeal(Path.Combine(examplesDir, "four-channel-event.json"));

        Console.WriteLine($"single-channel bundleHash = {sc.BundleHash}");
        Console.WriteLine($"four-channel  bundleHash = {mc.BundleHash}");
        Console.WriteLine($"Ed25519 publicKey (hex)  = {Convert.ToHexString(DerivePublicKey(TestSeed)).ToLowerInvariant()}");

        // Manifest vectors (pretty-printed; the verifier re-canonicalises).
        File.Copy(Path.Combine(examplesDir, "single-channel-event.json"),
                  Path.Combine(vectorsDir, "v1-single-channel.manifest.json"), overwrite: true);
        File.Copy(Path.Combine(examplesDir, "four-channel-event.json"),
                  Path.Combine(vectorsDir, "v1-multi-channel.manifest.json"), overwrite: true);

        // Good anchor (uses single-channel manifest).
        var goodMemos = BuildMemos(sc.BundleBytes, sc.EventBytes, sc.Signature);
        WriteJson(vectorsDir, "v1-good-anchor.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, goodMemos, "10"));

        // Bad: tampered manifest -> bundle-hash-mismatch.
        var tamperedJson = sc.CanonicalJson.Replace(sc.Manifest.VehicleId, "99999999-9999-9999-9999-999999999999");
        var tamperedEventBytes = Utf8NoBom.GetBytes(tamperedJson);
        var tamperedMemos = BuildMemos(sc.BundleBytes, tamperedEventBytes, sc.Signature);
        WriteJson(vectorsDir, "v1-bad-tampered-manifest.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, tamperedMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-tampered-manifest.expected.json", new
        {
            verified = false,
            reason = "bundle-hash-mismatch",
            description = "SF1.event canonical bytes hash to a value different from SF1.bundle.bundleHash; manifest was modified after sealing.",
        });

        // Bad: swapped sig.
        var swappedMemos = BuildMemos(sc.BundleBytes, sc.EventBytes, mc.Signature);
        WriteJson(vectorsDir, "v1-bad-swapped-sig.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, swappedMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-swapped-sig.expected.json", new
        {
            verified = false,
            reason = "signature-invalid",
            description = "SF1.sig does not verify against (bundleBytes || eventBytes) under the registry appPublicKey.",
        });

        // Bad: wrong account.
        WriteJson(vectorsDir, "v1-bad-wrong-account.tx.json", BuildTxResult(WrongAccount, TestnetAccount, goodMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-wrong-account.expected.json", new
        {
            verified = false,
            reason = "account-not-self-pay",
            description = "Account != Destination. v1 SecureFusion anchors are always self-pay; mismatch is a hard failure.",
        });

        // Bad: missing memo (drop SF1.event at index 1).
        var missingMemos = goodMemos.Where((_, i) => i != 1).ToList();
        WriteJson(vectorsDir, "v1-bad-missing-memo.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, missingMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-missing-memo.expected.json", new
        {
            verified = false,
            reason = "memo-missing",
            description = "Memo set is not exactly {SF1.bundle, SF1.event, SF1.sig} - SF1.event is missing.",
        });

        // Bad: four memos.
        var fourMemos = new List<object>(goodMemos)
        {
            BuildMemo("SF1.junk", "application/octet-stream", new byte[] { 0xDE, 0xAD, 0xBE, 0xEF }),
        };
        WriteJson(vectorsDir, "v1-bad-four-memos.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, fourMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-four-memos.expected.json", new
        {
            verified = false,
            reason = "memo-extra",
            description = "Memo set contains a non-SF1 memo (SF1.junk). Exactly three SF1 memos are permitted in v1 anchors.",
        });

        // Bad: duplicate memo (append a second SF1.bundle).
        var dupMemos = new List<object>(goodMemos) { goodMemos[0] };
        WriteJson(vectorsDir, "v1-bad-duplicate-memo.tx.json", BuildTxResult(TestnetAccount, TestnetAccount, dupMemos, "10"));
        WriteJson(vectorsDir, "v1-bad-duplicate-memo.expected.json", new
        {
            verified = false,
            reason = "memo-duplicate",
            description = "Two memos share the same SF1 MemoType (SF1.bundle). Duplicates are a hard failure in v1.",
        });

        Console.WriteLine($"Wrote {vectorsDir}");
        return 0;
    }

    // ------------------------------------------------------------------
    // Sealing — mirrors SecureManifestBuilder + RippledXrpAnchorClient.
    // ------------------------------------------------------------------

    private sealed record SealedManifest(
        ManifestData Manifest,
        string CanonicalJson,
        byte[] EventBytes,
        string BundleHash,
        byte[] BundleBytes,
        byte[] Signature);

    private sealed record ManifestData(
        string EventId,
        string IngestSource,
        DateTime IngestedAt,
        DateTime OccurredAt,
        DateTime SealedAt,
        string? SignerKeyId,
        string? TenantId,
        string VehicleEventId,
        string VehicleId,
        IReadOnlyList<ChannelData> Channels);

    private sealed record ChannelData(string ChannelId, string Sha256, long SizeBytes, int? DurationMs, DateTime? CapturedAt);

    private static SealedManifest LoadAndSeal(string path)
    {
        var manifest = ParseManifest(File.ReadAllText(path));
        var canonical = Canonicalise(manifest);
        var eventBytes = Utf8NoBom.GetBytes(canonical);
        var bundleHashHex = Convert.ToHexString(SHA256.HashData(eventBytes)).ToLowerInvariant();
        var bundleBytes = BuildBundleBytes(manifest, bundleHashHex);
        var sig = Sign(TestSeed, Concat(bundleBytes, eventBytes));
        return new SealedManifest(manifest, canonical, eventBytes, bundleHashHex, bundleBytes, sig);
    }

    private static ManifestData ParseManifest(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        var channels = r.GetProperty("channels").EnumerateArray().Select(c => new ChannelData(
            ChannelId: c.GetProperty("channelId").GetString()!,
            Sha256: c.GetProperty("sha256").GetString()!,
            SizeBytes: c.GetProperty("sizeBytes").GetInt64(),
            DurationMs: c.TryGetProperty("durationMs", out var d) ? d.GetInt32() : (int?)null,
            CapturedAt: c.TryGetProperty("capturedAt", out var ca) ? ParseTs(ca.GetString()!) : (DateTime?)null)).ToList();

        return new ManifestData(
            EventId: r.GetProperty("eventId").GetString()!,
            IngestSource: r.GetProperty("ingestSource").GetString()!,
            IngestedAt: ParseTs(r.GetProperty("ingestedAt").GetString()!),
            OccurredAt: ParseTs(r.GetProperty("occurredAt").GetString()!),
            SealedAt: ParseTs(r.GetProperty("sealedAt").GetString()!),
            SignerKeyId: r.TryGetProperty("signerKeyId", out var s) ? s.GetString() : null,
            TenantId: r.TryGetProperty("tenantId", out var t) ? t.GetString() : null,
            VehicleEventId: r.GetProperty("vehicleEventId").GetString()!,
            VehicleId: r.GetProperty("vehicleId").GetString()!,
            Channels: channels);
    }

    private static DateTime ParseTs(string s) => DateTime.SpecifyKind(
        DateTime.ParseExact(s, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture),
        DateTimeKind.Utc);

    private static string Canonicalise(ManifestData m)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Indented = false, SkipValidation = false }))
        {
            writer.WriteStartObject();
            writer.WritePropertyName("channels");
            writer.WriteStartArray();
            foreach (var ch in m.Channels.OrderBy(c => c.ChannelId, StringComparer.Ordinal))
            {
                writer.WriteStartObject();
                if (ch.CapturedAt.HasValue) writer.WriteString("capturedAt", FormatTs(ch.CapturedAt.Value));
                writer.WriteString("channelId", ch.ChannelId);
                if (ch.DurationMs.HasValue) writer.WriteNumber("durationMs", ch.DurationMs.Value);
                writer.WriteString("sha256", ch.Sha256);
                writer.WriteNumber("sizeBytes", ch.SizeBytes);
                writer.WriteEndObject();
            }
            writer.WriteEndArray();
            writer.WriteString("eventId", m.EventId);
            writer.WriteString("ingestSource", m.IngestSource);
            writer.WriteString("ingestedAt", FormatTs(m.IngestedAt));
            writer.WriteString("occurredAt", FormatTs(m.OccurredAt));
            writer.WriteString("sealedAt", FormatTs(m.SealedAt));
            if (!string.IsNullOrEmpty(m.SignerKeyId)) writer.WriteString("signerKeyId", m.SignerKeyId);
            if (!string.IsNullOrEmpty(m.TenantId)) writer.WriteString("tenantId", m.TenantId);
            writer.WriteNumber("v", 1);
            writer.WriteString("vehicleEventId", m.VehicleEventId);
            writer.WriteString("vehicleId", m.VehicleId);
            writer.WriteEndObject();
        }
        return Utf8NoBom.GetString(stream.ToArray());
    }

    private static string FormatTs(DateTime dt)
    {
        var utc = dt.Kind == DateTimeKind.Utc ? dt : dt.ToUniversalTime();
        return utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture);
    }

    private static byte[] BuildBundleBytes(ManifestData m, string bundleHashHex)
    {
        var hash = Convert.FromHexString(bundleHashHex);
        var guid = Guid.Parse(m.EventId).ToByteArray(); // .NET mixed-endian
        // SecureFusion v1: single-value enum, single source-code byte.
        byte sourceCode = string.Equals(m.IngestSource, "fleetfusion", StringComparison.Ordinal)
            ? (byte)0x01
            : throw new ArgumentException($"Unknown ingestSource '{m.IngestSource}'");
        var bundle = new byte[50];
        Buffer.BlockCopy(hash, 0, bundle, 0, 32);
        Buffer.BlockCopy(guid, 0, bundle, 32, 16);
        bundle[48] = sourceCode;
        bundle[49] = (byte)m.Channels.Count;
        return bundle;
    }

    private static byte[] Sign(byte[] seed, byte[] data)
    {
        using var key = Key.Import(SignatureAlgorithm.Ed25519, seed, KeyBlobFormat.RawPrivateKey);
        return SignatureAlgorithm.Ed25519.Sign(key, data);
    }

    private static byte[] DerivePublicKey(byte[] seed)
    {
        using var key = Key.Import(SignatureAlgorithm.Ed25519, seed, KeyBlobFormat.RawPrivateKey);
        return key.PublicKey.Export(KeyBlobFormat.RawPublicKey);
    }

    private static byte[] Concat(byte[] a, byte[] b)
    {
        var r = new byte[a.Length + b.Length];
        Buffer.BlockCopy(a, 0, r, 0, a.Length);
        Buffer.BlockCopy(b, 0, r, a.Length, b.Length);
        return r;
    }

    // ------------------------------------------------------------------
    // XRPL tx response synthesis.
    // ------------------------------------------------------------------

    private static List<object> BuildMemos(byte[] bundleBytes, byte[] eventBytes, byte[] sig) =>
        new()
        {
            BuildMemo("SF1.bundle", "application/octet-stream", bundleBytes),
            BuildMemo("SF1.event", "application/json", eventBytes),
            BuildMemo("SF1.sig", "application/octet-stream", sig),
        };

    private static object BuildMemo(string memoType, string memoFormat, byte[] data) => new
    {
        Memo = new
        {
            MemoType = HexAscii(memoType),
            MemoFormat = HexAscii(memoFormat),
            MemoData = Convert.ToHexString(data),
        },
    };

    private static string HexAscii(string s) => Convert.ToHexString(Encoding.ASCII.GetBytes(s));

    private static object BuildTxResult(string account, string destination, IEnumerable<object> memos, string amount) => new
    {
        result = new
        {
            Account = account,
            Destination = destination,
            Amount = amount,
            Fee = "12",
            Sequence = 4321,
            TransactionType = "Payment",
            Memos = memos.ToList(),
            hash = TxHash,
            ledger_index = 95000000L,
            validated = true,
            date = 762345678L,
        },
    };

    private static void WriteJson(string dir, string name, object obj)
    {
        var json = JsonSerializer.Serialize(obj, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(dir, name), json + "\n");
    }

    private static string FindRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        for (int i = 0; i < 12; i++)
        {
            var probe = Path.Combine(dir, "examples", "test-vectors.json");
            if (File.Exists(probe))
            {
                return dir;
            }
            dir = Path.GetDirectoryName(dir) ?? dir;
        }
        throw new DirectoryNotFoundException("Could not locate the SecureFusion repo root (looking for examples/test-vectors.json).");
    }
}
