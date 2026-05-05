/*
 * SecureFusion v1.0 — Bitcoin / OpenTimestamps submission example (Java).
 *
 * Submits a SecureFusion bundleHash to OpenTimestamps calendar servers,
 * which aggregate digests into Merkle trees and anchor them to Bitcoin.
 *
 * Uses java.net.http.HttpClient (JDK 11+) only — no third-party deps.
 *
 * Compile (with the SecureFusionAnchor sample on the classpath):
 *     cd samples/java
 *     javac SecureFusionAnchor.java submit_bitcoin/SubmitBitcoin.java
 *     java -cp .:submit_bitcoin SubmitBitcoin
 */

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;

public class SubmitBitcoin {

    private static final String[] CALENDAR_SERVERS = {
        "https://a.pool.opentimestamps.org",
        "https://b.pool.opentimestamps.org",
        "https://finney.calendar.eternitywall.com",
    };

    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .build();

    public static void main(String[] args) throws Exception {
        // 1. Load the example manifest and compute its bundleHash.
        Path examplesDir = findExamplesDir();
        String json = Files.readString(examplesDir.resolve("single-channel-event.json"), StandardCharsets.UTF_8);
        @SuppressWarnings("unchecked")
        Map<String, Object> manifest = (Map<String, Object>) SecureFusionAnchor.TinyJson.parse(json);
        SecureFusionAnchor.AnchorPayload payload = SecureFusionAnchor.buildAnchorPayload(manifest, null);

        System.out.println("SecureFusion v1.0 — OpenTimestamps (Bitcoin) submission");
        System.out.println("=".repeat(60));
        System.out.println("  bundleHash:  " + payload.bundleHash());
        System.out.println();

        // 2. Submit the digest to multiple calendars.
        byte[] digest = hexToBytes(payload.bundleHash());
        Map<String, byte[]> proofs = new LinkedHashMap<>();

        System.out.println("Anchoring to OpenTimestamps calendar servers:");
        for (String server : CALENDAR_SERVERS) {
            System.out.print("  Submitting to " + server + "... ");
            try {
                byte[] proof = submitToCalendar(digest, server);
                proofs.put(server, proof);
                System.out.println("[OK] (" + proof.length + " bytes)");
            } catch (Exception e) {
                System.out.println("[FAIL] " + e.getMessage());
            }
        }

        if (proofs.isEmpty()) {
            System.err.println();
            System.err.println("[FAIL] All OpenTimestamps calendars failed.");
            System.exit(1);
        }

        // 3. Save partial proofs.
        Path output = Path.of(payload.bundleHash().substring(0, 16) + ".partial.ots");
        try (var fos = Files.newOutputStream(output)) {
            for (var e : proofs.entrySet()) {
                fos.write(("--- " + e.getKey() + " ---\n").getBytes(StandardCharsets.UTF_8));
                fos.write(e.getValue());
                fos.write('\n');
            }
        }

        System.out.println();
        System.out.println("[OK] Saved partial proof: " + output);
        System.out.println();
        System.out.println("Next steps:");
        System.out.println("  1. The proof is currently 'partial' - calendars have aggregated");
        System.out.println("     your digest but Bitcoin has not yet committed to it.");
        System.out.println("  2. Wait at least 1 hour, then call the calendars' upgrade API");
        System.out.println("     to get the full Bitcoin block commitment.");
        System.out.println("  3. Store the upgraded .ots proof in the SecureFusion ledger.");
    }

    static byte[] submitToCalendar(byte[] digest, String calendarUrl) throws Exception {
        if (digest.length != 32)
            throw new IllegalArgumentException("OpenTimestamps digest must be 32 bytes");

        URI uri = URI.create(calendarUrl.replaceAll("/$", "") + "/digest");
        HttpRequest request = HttpRequest.newBuilder(uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .timeout(Duration.ofSeconds(30))
            .POST(HttpRequest.BodyPublishers.ofByteArray(digest))
            .build();

        HttpResponse<byte[]> response = HTTP.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200)
            throw new RuntimeException("HTTP " + response.statusCode());
        return response.body();
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
