// SecureFusion v1.0 — Bitcoin / OpenTimestamps submission example (C# / .NET 8).
//
// Submits a SecureFusion bundleHash to OpenTimestamps calendar servers,
// which aggregate digests into Merkle trees and anchor them to Bitcoin.
//
// OpenTimestamps provides a free, decentralised long-term anchor with the
// strongest legal precedent of any blockchain. Per-event cost: £0.
// Calendar aggregation latency: ~1 hour until Bitcoin commits.
//
// This file uses HttpClient directly — no third-party OTS library is
// required. For production use with full proof upgrading, consider porting
// the python-opentimestamps client logic, or call out to the `ots` CLI.

using System.Text.Json;
using SecureFusion.Samples.CSharp;

namespace SecureFusion.Samples.CSharp.SubmitBitcoin;

public static class BitcoinSubmitProgram
{
    private static readonly string[] CalendarServers = new[]
    {
        "https://a.pool.opentimestamps.org",
        "https://b.pool.opentimestamps.org",
        "https://finney.calendar.eternitywall.com",
    };

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    public static async Task<int> Main()
    {
        // 1. Load the example manifest and compute its bundleHash.
        var examplesDir = FindExamplesDir();
        var manifestJson = await File.ReadAllTextAsync(Path.Combine(examplesDir, "single-channel-event.json"));
        using var doc = JsonDocument.Parse(manifestJson);
        var payload = AnchorBuilder.BuildAnchorPayload(doc.RootElement, applicationSigningKey: null);

        Console.WriteLine("SecureFusion v1.0 — OpenTimestamps (Bitcoin) submission");
        Console.WriteLine(new string('=', 60));
        Console.WriteLine($"  bundleHash:  {payload.BundleHash}");
        Console.WriteLine();

        // 2. Submit the digest to multiple calendar servers in parallel.
        var digest = Convert.FromHexString(payload.BundleHash);
        Console.WriteLine("Anchoring to OpenTimestamps calendar servers:");

        var proofs = new Dictionary<string, byte[]>();
        foreach (var server in CalendarServers)
        {
            Console.Write($"  Submitting to {server}... ");
            try
            {
                var proof = await SubmitToCalendar(digest, server);
                proofs[server] = proof;
                Console.WriteLine($"✓ ({proof.Length} bytes)");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"✗ {ex.Message}");
            }
        }

        if (proofs.Count == 0)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("✗ All OpenTimestamps calendars failed.");
            return 1;
        }

        // 3. Save the partial proofs.
        var outputPath = $"{payload.BundleHash[..16]}.partial.ots";
        await using var fs = File.Create(outputPath);
        foreach (var (url, proof) in proofs)
        {
            await fs.WriteAsync(System.Text.Encoding.UTF8.GetBytes($"--- {url} ---\n"));
            await fs.WriteAsync(proof);
            fs.WriteByte((byte)'\n');
        }

        Console.WriteLine();
        Console.WriteLine($"✓ Saved partial proof: {outputPath}");
        Console.WriteLine();
        Console.WriteLine("Next steps:");
        Console.WriteLine("  1. The proof is currently 'partial' — calendars have aggregated");
        Console.WriteLine("     your digest but Bitcoin has not yet committed to it.");
        Console.WriteLine("  2. Wait at least 1 hour, then call the calendars' upgrade API");
        Console.WriteLine("     to get the full Bitcoin block commitment.");
        Console.WriteLine("  3. Store the upgraded .ots proof in the SecureFusion ledger,");
        Console.WriteLine("     associated with the event record.");

        return 0;
    }

    private static async Task<byte[]> SubmitToCalendar(byte[] digest, string calendarUrl)
    {
        if (digest.Length != 32)
            throw new ArgumentException("OpenTimestamps digest must be 32 bytes (SHA-256)");

        var url = calendarUrl.TrimEnd('/') + "/digest";
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new ByteArrayContent(digest),
        };
        request.Content.Headers.ContentType =
            new System.Net.Http.Headers.MediaTypeHeaderValue("application/x-www-form-urlencoded");

        using var response = await Http.SendAsync(request);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync();
    }

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
}
