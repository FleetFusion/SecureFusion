// SecureFusion v1.0 — XRPL submission example (C# / .NET 8).
//
// Submits a SecureFusion-anchored video event to the XRP Ledger as a
// self-pay 1-drop Payment carrying the three SF1 memos.
//
// This file is reference code — to actually compile and run, you need:
//   1. A .NET 8 project that includes both this file and ../Program.cs
//   2. NuGet packages:
//        dotnet add package Xrpl.NET                 (community XRPL client)
//        dotnet add package NSec.Cryptography        (Ed25519 signing)
//   3. Environment variables:
//        SECUREFUSION_XRPL_SEED      — XRPL wallet seed
//        SECUREFUSION_APP_KEY_HEX    — 32-byte Ed25519 seed (64 hex chars)
//
// For testnet, get a funded wallet at:
//   https://xrpl.org/xrp-testnet-faucet.html

using System.Text.Json;
using SecureFusion.Samples.CSharp;

namespace SecureFusion.Samples.CSharp.SubmitXrpl;

public static class XrplSubmitProgram
{
    private const string TestnetUrl = "wss://s.altnet.rippletest.net:51233";
    private const string MainnetUrl = "wss://xrplcluster.com";

    public static async Task<int> Main()
    {
        var seed = Environment.GetEnvironmentVariable("SECUREFUSION_XRPL_SEED");
        var appKeyHex = Environment.GetEnvironmentVariable("SECUREFUSION_APP_KEY_HEX");

        if (string.IsNullOrEmpty(seed) || string.IsNullOrEmpty(appKeyHex))
        {
            Console.Error.WriteLine("Missing required environment variables:");
            Console.Error.WriteLine("  SECUREFUSION_XRPL_SEED      — XRPL wallet seed (s...)");
            Console.Error.WriteLine("  SECUREFUSION_APP_KEY_HEX    — 32-byte Ed25519 seed (64 hex chars)");
            return 2;
        }

        // 1. Load the example manifest.
        var examplesDir = FindExamplesDir();
        var manifestJson = await File.ReadAllTextAsync(Path.Combine(examplesDir, "single-channel-event.json"));
        using var doc = JsonDocument.Parse(manifestJson);
        var manifest = doc.RootElement;

        // 2. Build the SecureFusion payload (canonical hash + signed memos).
        var appKey = Convert.FromHexString(appKeyHex);
        var payload = AnchorBuilder.BuildAnchorPayload(manifest, appKey);

        Console.WriteLine("SecureFusion v1.0 — XRPL submission");
        Console.WriteLine(new string('=', 60));
        Console.WriteLine($"  bundleHash:  {payload.BundleHash}");
        Console.WriteLine($"  bundleBytes: {payload.BundleBytes.Length} bytes");
        Console.WriteLine($"  eventBytes:  {payload.EventBytes.Length} bytes");
        Console.WriteLine($"  signature:   {payload.Signature.Length} bytes");

        // 3. Submit to XRPL using your XRPL library.
        // The pseudocode below shows the Xrpl.NET pattern. Adapt to your client.
        await SubmitToXrpl(payload, seed, TestnetUrl);
        return 0;
    }

    private static async Task SubmitToXrpl(AnchorPayload payload, string seed, string rippledUrl)
    {
        // ============================================================
        // Pseudocode using Xrpl.NET (https://github.com/Transia-RnD/Xrpl.NET).
        // Uncomment after adding the NuGet package.
        // ============================================================
        //
        // var client = new XrplClient(rippledUrl);
        // await client.Connect();
        //
        // var wallet = Wallet.FromSeed(seed);
        // Console.WriteLine($"  XRPL account: {wallet.ClassicAddress}");
        // Console.WriteLine($"  rippled URL:  {rippledUrl}");
        //
        // var memos = payload.Memos.Select(m => new Memo
        // {
        //     MemoType = m.MemoType,
        //     MemoFormat = m.MemoFormat,
        //     MemoData = m.MemoData,
        // }).ToList();
        //
        // var payment = new Payment
        // {
        //     Account = wallet.ClassicAddress,
        //     Destination = wallet.ClassicAddress,
        //     Amount = "1",  // 1 drop, self-pay
        //     Memos = memos,
        // };
        //
        // var prepared = await client.Autofill(payment);
        // var signed = wallet.Sign(prepared);
        // Console.WriteLine($"  Submitting transaction {signed.Hash}...");
        //
        // var response = await client.SubmitAndWait(signed);
        // Console.WriteLine();
        // Console.WriteLine("✓ Anchored to XRPL");
        // Console.WriteLine($"  Transaction:  {response.Result.Hash}");
        // Console.WriteLine($"  Ledger:       {response.Result.LedgerIndex}");
        // Console.WriteLine($"  Validated:    {response.Result.Validated}");
        // Console.WriteLine();
        // Console.WriteLine($"  Verify at:    https://testnet.xrpl.org/transactions/{response.Result.Hash}");
        //
        // await client.Disconnect();

        await Task.Yield();
        Console.Error.WriteLine();
        Console.Error.WriteLine("Sample skipped — Xrpl.NET package not installed.");
        Console.Error.WriteLine("See the comments in SubmitToXrpl() to enable.");
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
