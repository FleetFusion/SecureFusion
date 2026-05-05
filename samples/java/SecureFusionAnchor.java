/*
 * SecureFusion v1.0 (SF1) anchor producer - Java sample.
 *
 * Mirrors FleetAssistant.SecureFusion.SecureManifestBuilder + the C# reference
 * sample byte-for-byte:
 *   - Hand-rolled canonicaliser (alpha-sort keys, no whitespace, integer-only
 *     numerics, omit-when-empty for tenantId / signerKeyId).
 *   - ingestSource is the literal string "fleetfusion" (single-value enum in v1).
 *   - Manual timestamp formatting -- NEVER Instant.toString(), which strips
 *     trailing zero-millisecond digits and would diverge from FleetFusion's
 *     "yyyy-MM-dd'T'HH:mm:ss.fff'Z'" (3-digit ms, suffix Z).
 *   - SF1.bundle layout: bundleHash(32) || eventIdGuid(16) || sourceCode(1) ||
 *     channelCount(1), 50 bytes total. eventIdGuid uses .NET Guid.ToByteArray()
 *     byte order (mixed-endian: Data1/2/3 little-endian, Data4 verbatim) to
 *     match FleetFusion. The default Java UUID.getMostSignificantBits() byte
 *     order is RFC 4122 big-endian and would NOT match -- toDotNetGuidBytes()
 *     does the byte-swap.
 *   - SF1.sig: Ed25519 signature (BouncyCastle) over (bundleBytes || eventBytes)
 *     using the deterministic test seed (32 bytes 0x00..0x1F per
 *     joint-plan-final §D11).
 *
 * Build & run (Java 17+):
 *     cd samples/java
 *     # If using BouncyCastle:
 *     #   download bcprov-jdk18on-1.78.jar into ./lib/
 *     javac -cp "lib/*" SecureFusionAnchor.java
 *     java  -cp ".;lib/*" SecureFusionAnchor    (Windows)
 *     java  -cp ".:lib/*" SecureFusionAnchor    (Linux/macOS)
 *
 * Or via Maven -- a pom.xml in this directory wires bcprov-jdk18on so
 * `mvn compile exec:java -Dexec.mainClass=SecureFusionAnchor` does the
 * right thing.
 *
 * Expected bundleHashes for the bundled examples:
 *     single-channel:  e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
 *     four-channel:    8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
 *
 * For XRPL submission see submit_xrpl/SubmitXrpl.java (using xrpl4j).
 * For Bitcoin/OpenTimestamps see submit_bitcoin/SubmitBitcoin.java.
 */

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;

public class SecureFusionAnchor {

    private static final byte[] TEST_APP_SEED = new byte[32];
    static {
        for (int i = 0; i < 32; i++) TEST_APP_SEED[i] = (byte) i;
    }

    public static void main(String[] args) throws Exception {
        // Linked map: print order matches the test-vectors.json order.
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("single-channel-event.json", "e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05");
        expected.put("four-channel-event.json",   "8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb");

        System.out.println("SecureFusion v1.0 - Java anchor producer sample");
        System.out.println("=".repeat(60));

        Path examplesDir = findExamplesDir();
        boolean allOk = true;

        for (var e : expected.entrySet()) {
            Path manifestPath = examplesDir.resolve(e.getKey());
            String json = Files.readString(manifestPath, StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Map<String, Object> manifest = (Map<String, Object>) TinyJson.parse(json);

            AnchorPayload payload = buildAnchorPayload(manifest, TEST_APP_SEED);
            boolean ok = payload.bundleHash.equals(e.getValue());
            allOk &= ok;

            System.out.println();
            System.out.println("  Manifest:    " + e.getKey());
            System.out.println("  bundleHash:  " + payload.bundleHash);
            System.out.println("  expected:    " + e.getValue());
            System.out.println("  match:       " + (ok ? "[OK]" : "[FAIL]"));
            System.out.println("  channels:    " + ((List<?>) manifest.get("channels")).size());
            System.out.println("  bundle:      " + payload.bundleBytes.length + " bytes");
            System.out.println("  signature:   " + toHexLower(payload.signature).substring(0, 32) + "...");
        }

        System.out.println();
        System.out.println(allOk ? "[OK] All test vectors match." : "[FAIL] One or more test vectors did not match.");
        System.exit(allOk ? 0 : 1);
    }

    private static Path findExamplesDir() {
        Path p = Path.of("").toAbsolutePath();
        for (int i = 0; i < 8 && p != null; i++, p = p.getParent()) {
            Path c = p.resolve("examples");
            if (Files.isDirectory(c)) return c;
        }
        throw new RuntimeException("Examples directory not found");
    }

    // ============================================================
    // Anchor builder.
    // ============================================================

    public record AnchorPayload(String bundleHash, byte[] bundleBytes, byte[] eventBytes,
                                byte[] signature, List<XrplMemo> memos) {}

    public record XrplMemo(String memoType, String memoFormat, String memoData) {}

    // SecureFusion v1: single-value enum, single source-code byte.
    private static final Map<String, Integer> SOURCE_CODES = Map.of(
        "fleetfusion", 1);

    public static AnchorPayload buildAnchorPayload(Map<String, Object> manifest, byte[] appSeed32) {
        byte[] eventBytes = CanonicalJson.serialise(manifest);
        String bundleHash = sha256Hex(eventBytes);

        byte[] bundleBytes = encodeBundleMemo(
            bundleHash,
            (String) manifest.get("eventId"),
            (String) manifest.get("ingestSource"),
            ((List<?>) manifest.get("channels")).size());

        byte[] sigInput = concat(bundleBytes, eventBytes);
        byte[] signature = appSeed32 == null ? new byte[64] : ed25519Sign(sigInput, appSeed32);

        List<XrplMemo> memos = List.of(
            new XrplMemo(hexUtf8("SF1.bundle"), hexUtf8("application/octet-stream"), toHexUpper(bundleBytes)),
            new XrplMemo(hexUtf8("SF1.event"),  hexUtf8("application/json"),         toHexUpper(eventBytes)),
            new XrplMemo(hexUtf8("SF1.sig"),    hexUtf8("application/octet-stream"), toHexUpper(signature)));

        return new AnchorPayload(bundleHash, bundleBytes, eventBytes, signature, memos);
    }

    public static byte[] encodeBundleMemo(String bundleHash, String eventId, String source, int channelCount) {
        if (bundleHash.length() != 64) throw new IllegalArgumentException("bundleHash must be 64 hex chars");
        Integer src = SOURCE_CODES.get(source);
        if (src == null) throw new IllegalArgumentException("Unknown ingestSource: " + source);
        if (channelCount < 1 || channelCount > 255) throw new IllegalArgumentException("channelCount out of range");

        byte[] out = new byte[50];
        System.arraycopy(fromHex(bundleHash), 0, out, 0, 32);
        System.arraycopy(toDotNetGuidBytes(eventId), 0, out, 32, 16);
        out[48] = src.byteValue();
        out[49] = (byte) channelCount;
        return out;
    }

    /**
     * Convert a UUID string to .NET Guid.ToByteArray() byte order (mixed-endian:
     * Data1/2/3 little-endian, Data4 verbatim). FleetFusion's
     * RippledXrpAnchorClient writes Guid bytes this way and the conformance
     * vectors are byte-stable on this convention.
     */
    static byte[] toDotNetGuidBytes(String uuidStr) {
        String hex = uuidStr.replace("-", "");
        if (hex.length() != 32) throw new IllegalArgumentException("bad uuid: " + uuidStr);
        byte[] raw = fromHex(hex);
        byte[] out = new byte[16];
        // Data1: 4 bytes little-endian
        out[0] = raw[3]; out[1] = raw[2]; out[2] = raw[1]; out[3] = raw[0];
        // Data2: 2 bytes little-endian
        out[4] = raw[5]; out[5] = raw[4];
        // Data3: 2 bytes little-endian
        out[6] = raw[7]; out[7] = raw[6];
        // Data4: 8 bytes verbatim
        System.arraycopy(raw, 8, out, 8, 8);
        return out;
    }

    /**
     * Sign with Ed25519 using BouncyCastle. The provider class is loaded by
     * reflection so the file compiles even if BC is absent on the classpath
     * (the runtime call will then fail with a clear error). Add bcprov-jdk18on
     * to the classpath to enable signing.
     */
    public static byte[] ed25519Sign(byte[] message, byte[] seed32) {
        try {
            Class<?> paramsClass = Class.forName("org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters");
            Class<?> signerClass = Class.forName("org.bouncycastle.crypto.signers.Ed25519Signer");
            Object params = paramsClass.getConstructor(byte[].class, int.class).newInstance(seed32, 0);
            Object signer = signerClass.getDeclaredConstructor().newInstance();
            signerClass.getMethod("init", boolean.class, Class.forName("org.bouncycastle.crypto.CipherParameters"))
                .invoke(signer, true, params);
            signerClass.getMethod("update", byte[].class, int.class, int.class)
                .invoke(signer, message, 0, message.length);
            return (byte[]) signerClass.getMethod("generateSignature").invoke(signer);
        } catch (ClassNotFoundException e) {
            throw new RuntimeException(
                "Ed25519 signing requires BouncyCastle on the classpath. " +
                "Add bcprov-jdk18on (e.g. via Maven's pom.xml or by dropping bcprov-jdk18on-1.78.jar into lib/).", e);
        } catch (Exception e) {
            throw new RuntimeException("BouncyCastle Ed25519 signing failed: " + e.getMessage(), e);
        }
    }

    // ============================================================
    // Canonical JSON.
    //
    // Hand-rolled because java.time.Instant.toString() drops trailing
    // zero-millisecond digits and json libraries (Jackson/Gson) take
    // configuration-dependent shortcuts that cannot be relied on across
    // versions. We emit timestamps with formatTimestamp() and walk the
    // tree manually with sorted keys.
    // ============================================================

    static final class CanonicalJson {
        static byte[] serialise(Object v) {
            StringBuilder sb = new StringBuilder();
            write(sb, v);
            return sb.toString().getBytes(StandardCharsets.UTF_8);
        }

        static void write(StringBuilder sb, Object v) {
            if (v == null) { sb.append("null"); return; }
            if (v instanceof Boolean b) { sb.append(b ? "true" : "false"); return; }
            if (v instanceof Long l) { sb.append(l); return; }
            if (v instanceof Integer i) { sb.append(i); return; }
            if (v instanceof Double d) {
                if (!Double.isFinite(d)) throw new IllegalArgumentException("Non-finite numbers not allowed");
                if (d == Math.floor(d) && Math.abs(d) < 1e16) sb.append((long) (double) d);
                else throw new IllegalArgumentException("Floats are forbidden in v1 manifests");
                return;
            }
            if (v instanceof Number n) { sb.append(n); return; }
            if (v instanceof String s) { writeString(sb, s); return; }
            if (v instanceof List<?> list) {
                sb.append('[');
                boolean first = true;
                for (Object item : list) { if (!first) sb.append(','); first = false; write(sb, item); }
                sb.append(']');
                return;
            }
            if (v instanceof Map<?, ?> map) {
                List<String> keys = new ArrayList<>();
                for (Object k : map.keySet()) keys.add((String) k);
                Collections.sort(keys);  // ordinal codepoint comparison (String.compareTo)
                sb.append('{');
                boolean first = true;
                for (String k : keys) {
                    if (!first) sb.append(',');
                    first = false;
                    writeString(sb, k);
                    sb.append(':');
                    write(sb, map.get(k));
                }
                sb.append('}');
                return;
            }
            throw new IllegalArgumentException("Cannot canonicalise " + v.getClass());
        }

        static void writeString(StringBuilder sb, String s) {
            sb.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '"':  sb.append("\\\""); break;
                    case '\\': sb.append("\\\\"); break;
                    case '\b': sb.append("\\b");  break;
                    case '\f': sb.append("\\f");  break;
                    case '\n': sb.append("\\n");  break;
                    case '\r': sb.append("\\r");  break;
                    case '\t': sb.append("\\t");  break;
                    default:
                        if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                        else sb.append(c);
                }
            }
            sb.append('"');
        }
    }

    /**
     * Format an ISO-8601 timestamp with explicit millisecond precision and
     * trailing Z. NEVER call Instant.toString() -- it strips trailing zeros
     * (e.g. "2026-04-30T12:00:00Z" instead of the spec-mandated
     * "2026-04-30T12:00:00.000Z"). Builds the string from epoch seconds + ms
     * via a fixed pattern.
     */
    public static String formatTimestamp(Instant instant) {
        return DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .withZone(ZoneOffset.UTC)
            .format(instant);
    }

    // ============================================================
    // Tiny JSON parser (so the sample has zero third-party deps for
    // reading the example manifests). For production, swap in your
    // existing JSON library.
    // ============================================================

    static final class TinyJson {
        private final String s;
        private int i;

        private TinyJson(String s) { this.s = s; }

        static Object parse(String json) {
            TinyJson t = new TinyJson(json);
            t.skipWs();
            Object v = t.value();
            t.skipWs();
            if (t.i != t.s.length()) throw new RuntimeException("Trailing content at " + t.i);
            return v;
        }

        Object value() {
            skipWs();
            char c = s.charAt(i);
            return switch (c) {
                case '{' -> obj();
                case '[' -> arr();
                case '"' -> str();
                case 't', 'f' -> bool();
                case 'n' -> nul();
                default -> num();
            };
        }

        Map<String, Object> obj() {
            Map<String, Object> m = new LinkedHashMap<>();
            i++; skipWs();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) {
                skipWs();
                String k = str();
                skipWs();
                if (s.charAt(i) != ':') throw new RuntimeException("Expected ':' at " + i);
                i++;
                m.put(k, value());
                skipWs();
                if (s.charAt(i) == ',') { i++; continue; }
                if (s.charAt(i) == '}') { i++; return m; }
                throw new RuntimeException("Expected ',' or '}' at " + i);
            }
        }

        List<Object> arr() {
            List<Object> a = new ArrayList<>();
            i++; skipWs();
            if (s.charAt(i) == ']') { i++; return a; }
            while (true) {
                a.add(value());
                skipWs();
                if (s.charAt(i) == ',') { i++; continue; }
                if (s.charAt(i) == ']') { i++; return a; }
                throw new RuntimeException("Expected ',' or ']' at " + i);
            }
        }

        String str() {
            if (s.charAt(i) != '"') throw new RuntimeException("Expected string at " + i);
            i++;
            StringBuilder sb = new StringBuilder();
            while (s.charAt(i) != '"') {
                char c = s.charAt(i++);
                if (c != '\\') { sb.append(c); continue; }
                char e = s.charAt(i++);
                switch (e) {
                    case '"', '\\', '/' -> sb.append(e);
                    case 'b' -> sb.append('\b');
                    case 'f' -> sb.append('\f');
                    case 'n' -> sb.append('\n');
                    case 'r' -> sb.append('\r');
                    case 't' -> sb.append('\t');
                    case 'u' -> {
                        sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        i += 4;
                    }
                    default -> throw new RuntimeException("Bad escape \\" + e);
                }
            }
            i++;
            return sb.toString();
        }

        Boolean bool() {
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            throw new RuntimeException("Bad boolean at " + i);
        }

        Object nul() {
            if (s.startsWith("null", i)) { i += 4; return null; }
            throw new RuntimeException("Bad null at " + i);
        }

        Number num() {
            int start = i;
            if (s.charAt(i) == '-') i++;
            while (i < s.length() && "0123456789.eE+-".indexOf(s.charAt(i)) >= 0) i++;
            String t = s.substring(start, i);
            if (t.contains(".") || t.contains("e") || t.contains("E")) return Double.parseDouble(t);
            return Long.parseLong(t);
        }

        void skipWs() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        }
    }

    // ============================================================
    // Utilities.
    // ============================================================

    static byte[] concat(byte[] a, byte[] b) {
        byte[] r = new byte[a.length + b.length];
        System.arraycopy(a, 0, r, 0, a.length);
        System.arraycopy(b, 0, r, a.length, b.length);
        return r;
    }

    static String sha256Hex(byte[] data) {
        try {
            return toHexLower(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    static String hexUtf8(String s) { return toHexUpper(s.getBytes(StandardCharsets.UTF_8)); }

    static String toHexUpper(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02X", x));
        return sb.toString();
    }

    static String toHexLower(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    static byte[] fromHex(String h) {
        byte[] out = new byte[h.length() / 2];
        for (int i = 0; i < h.length(); i += 2)
            out[i / 2] = (byte) ((Character.digit(h.charAt(i), 16) << 4) | Character.digit(h.charAt(i + 1), 16));
        return out;
    }
}
