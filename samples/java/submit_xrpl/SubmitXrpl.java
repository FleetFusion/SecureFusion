/*
 * SecureFusion v1.0 — XRPL submission example (Java).
 *
 * Submits a SecureFusion-anchored video event to the XRP Ledger using
 * xrpl4j (https://github.com/XRPLF/xrpl4j) — the official Java XRPL client.
 *
 * Build (with Maven/Gradle and xrpl4j on the classpath):
 *     # See ../README.md for the dependencies block.
 *
 * Run (after compile):
 *     export SECUREFUSION_XRPL_SEED=s...
 *     export SECUREFUSION_APP_KEY_HEX=64hex
 *     java SubmitXrpl
 *
 * For testnet, get a funded wallet at:
 *     https://xrpl.org/xrp-testnet-faucet.html
 *
 * This file is REFERENCE CODE — it imports xrpl4j classes that are not
 * present in this repo's plain `javac` build path. To use, add xrpl4j to
 * your project's dependencies. The active xrpl4j calls are commented out
 * to keep the sample compilable without dependencies.
 */

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public class SubmitXrpl {

    private static final String TESTNET_URL = "https://s.altnet.rippletest.net:51234";
    private static final String MAINNET_URL = "https://xrplcluster.com";

    public static void main(String[] args) throws Exception {
        String seed = System.getenv("SECUREFUSION_XRPL_SEED");
        String appKeyHex = System.getenv("SECUREFUSION_APP_KEY_HEX");

        if (seed == null || appKeyHex == null) {
            System.err.println("Missing required environment variables:");
            System.err.println("  SECUREFUSION_XRPL_SEED      — XRPL wallet seed (s...)");
            System.err.println("  SECUREFUSION_APP_KEY_HEX    — 32-byte Ed25519 seed (64 hex chars)");
            System.exit(2);
        }

        // 1. Load the example manifest.
        Path examplesDir = findExamplesDir();
        String json = Files.readString(examplesDir.resolve("single-channel-event.json"), StandardCharsets.UTF_8);
        @SuppressWarnings("unchecked")
        Map<String, Object> manifest = (Map<String, Object>) SecureFusionAnchor.TinyJson.parse(json);

        // 2. Build the SecureFusion payload.
        byte[] appKey = hexToBytes(appKeyHex);
        SecureFusionAnchor.AnchorPayload payload =
            SecureFusionAnchor.buildAnchorPayload(manifest, appKey);

        System.out.println("SecureFusion v1.0 — XRPL submission");
        System.out.println("=".repeat(60));
        System.out.println("  bundleHash:  " + payload.bundleHash());
        System.out.println("  bundleBytes: " + payload.bundleBytes().length + " bytes");
        System.out.println("  eventBytes:  " + payload.eventBytes().length + " bytes");
        System.out.println("  signature:   " + payload.signature().length + " bytes");

        // 3. Submit using xrpl4j.
        submitToXrpl(payload, seed, TESTNET_URL);
    }

    private static void submitToXrpl(
            SecureFusionAnchor.AnchorPayload payload,
            String seed,
            String rippledUrl) throws Exception {

        // ============================================================
        // Pseudocode using xrpl4j (https://github.com/XRPLF/xrpl4j).
        // Uncomment after adding the dependency.
        // ============================================================
        //
        // import org.xrpl.xrpl4j.client.XrplClient;
        // import org.xrpl.xrpl4j.crypto.keys.*;
        // import org.xrpl.xrpl4j.crypto.signing.*;
        // import org.xrpl.xrpl4j.model.client.accounts.*;
        // import org.xrpl.xrpl4j.model.transactions.*;
        //
        // XrplClient client = new XrplClient(HttpUrl.parse(rippledUrl));
        // KeyPair keyPair = Seed.fromBase58EncodedSecret(seed).deriveKeyPair();
        // Address account = keyPair.publicKey().deriveAddress();
        // System.out.println("  XRPL account: " + account);
        //
        // List<MemoWrapper> memos = payload.memos().stream()
        //     .map(m -> MemoWrapper.builder()
        //         .memo(Memo.builder()
        //             .memoType(m.memoType())
        //             .memoFormat(m.memoFormat())
        //             .memoData(m.memoData())
        //             .build())
        //         .build())
        //     .toList();
        //
        // AccountInfoResult accountInfo = client.accountInfo(
        //     AccountInfoRequestParams.of(account));
        //
        // Payment payment = Payment.builder()
        //     .account(account)
        //     .destination(account)
        //     .amount(XrpCurrencyAmount.ofDrops(1))
        //     .sequence(accountInfo.accountData().sequence())
        //     .fee(XrpCurrencyAmount.ofDrops(10))
        //     .signingPublicKey(keyPair.publicKey())
        //     .memos(memos)
        //     .build();
        //
        // BcSignatureService signer = new BcSignatureService();
        // SingleSignedTransaction<Payment> signed = signer.sign(keyPair.privateKey(), payment);
        // System.out.println("  Submitting transaction " + signed.hash() + "...");
        // SubmitResult<Payment> result = client.submit(signed);
        //
        // System.out.println();
        // System.out.println("[OK] Anchored to XRPL");
        // System.out.println("  Transaction:  " + signed.hash());
        // System.out.println("  Engine:       " + result.engineResult());
        // System.out.println("  Verify at:    https://testnet.xrpl.org/transactions/" + signed.hash());

        System.err.println();
        System.err.println("Sample skipped - xrpl4j not on classpath.");
        System.err.println("See the comments in submitToXrpl() to enable.");
    }

    private static Path findExamplesDir() {
        Path p = Path.of("").toAbsolutePath();
        for (int i = 0; i < 10 && p != null; i++, p = p.getParent()) {
            Path c = p.resolve("examples");
            if (Files.isDirectory(c)) return c;
        }
        throw new RuntimeException("Examples directory not found");
    }

    private static byte[] hexToBytes(String h) {
        byte[] out = new byte[h.length() / 2];
        for (int i = 0; i < h.length(); i += 2)
            out[i / 2] = (byte) ((Character.digit(h.charAt(i), 16) << 4) | Character.digit(h.charAt(i + 1), 16));
        return out;
    }
}
