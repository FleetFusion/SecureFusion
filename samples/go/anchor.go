// SecureFusion v1.0 (SF1) anchor producer -- Go sample.
//
// Builds the three-memo XRPL transaction payload for a video event.
// Standard library only -- no third-party dependencies for hashing,
// canonicalisation, or Ed25519 signing.
//
// Run:
//     cd samples/go
//     go run anchor.go
//
// Expected bundleHash for the bundled examples (see examples/test-vectors.json):
//     single-channel: e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
//     four-channel:   8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb
//
// For XRPL submission see submit_xrpl.go (using Peersyst/xrpl-go).
// For Bitcoin/OpenTimestamps see submit_bitcoin.go.

package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// Expected bundleHashes are mirrored from examples/test-vectors.json. Keep
// in sync any time the schema dev refreshes that file.
var expectedBundleHashes = map[string]string{
	"single-channel-event.json": "e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05",
	"four-channel-event.json":   "8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb",
}

// SecureFusion v1: ingestSource is a single-value enum on the wire — always
// "fleetfusion" — and the source-code byte in SF1.bundle is always 0x01.
// Per-upstream-provider distinctions (FleetLive / FTCloud / future) are
// preserved internally inside the producing platform but never leak onto the
// public ledger or the verifier-facing JSON. v2 may extend this enum.
var ingestSourceCodes = map[string]byte{
	"fleetfusion": 1,
}

// XrplMemo is the Memo entry suitable for inclusion in an XRPL Payment.
type XrplMemo struct {
	MemoType   string `json:"MemoType"`
	MemoFormat string `json:"MemoFormat"`
	MemoData   string `json:"MemoData"`
}

// AnchorPayload is the full output of the anchor builder.
type AnchorPayload struct {
	BundleHash  string
	BundleBytes []byte
	EventBytes  []byte
	Signature   []byte
	Memos       []XrplMemo
}

// BuildAnchorPayload computes the bundleHash, the SF1.bundle binary header,
// and assembles the three Memos for the XRPL Payment.
//
// If appKey32 is nil, the signature is 64 zero bytes -- useful for testing
// canonicalisation only. Production code MUST sign with a real Ed25519 key
// held in an HSM.
func BuildAnchorPayload(manifest map[string]any, appKey32 []byte) (*AnchorPayload, error) {
	eventBytes, err := canonicalise(manifest)
	if err != nil {
		return nil, fmt.Errorf("canonicalise manifest: %w", err)
	}

	hash := sha256.Sum256(eventBytes)
	bundleHash := hex.EncodeToString(hash[:])

	eventID, _ := manifest["eventId"].(string)
	source, _ := manifest["ingestSource"].(string)
	channels, _ := manifest["channels"].([]any)

	bundleBytes, err := encodeBundleMemo(bundleHash, eventID, source, len(channels))
	if err != nil {
		return nil, err
	}

	sigInput := append(append([]byte{}, bundleBytes...), eventBytes...)
	signature := make([]byte, 64)
	if appKey32 != nil {
		if len(appKey32) != ed25519.SeedSize {
			return nil, fmt.Errorf("ed25519 seed must be 32 bytes")
		}
		priv := ed25519.NewKeyFromSeed(appKey32)
		signature = ed25519.Sign(priv, sigInput)
	}

	memos := []XrplMemo{
		{MemoType: hexUTF8("SF1.bundle"), MemoFormat: hexUTF8("application/octet-stream"), MemoData: strings.ToUpper(hex.EncodeToString(bundleBytes))},
		{MemoType: hexUTF8("SF1.event"), MemoFormat: hexUTF8("application/json"), MemoData: strings.ToUpper(hex.EncodeToString(eventBytes))},
		{MemoType: hexUTF8("SF1.sig"), MemoFormat: hexUTF8("application/octet-stream"), MemoData: strings.ToUpper(hex.EncodeToString(signature))},
	}

	return &AnchorPayload{
		BundleHash:  bundleHash,
		BundleBytes: bundleBytes,
		EventBytes:  eventBytes,
		Signature:   signature,
		Memos:       memos,
	}, nil
}

// encodeBundleMemo returns the 50-byte SF1.bundle binary header.
//
//	[0:32]   bundleHash
//	[32:48]  eventId raw 16-byte UUID (big-endian throughout)
//	[48]     ingestSource code
//	[49]     channel count
func encodeBundleMemo(bundleHash, eventID, source string, channelCount int) ([]byte, error) {
	if len(bundleHash) != 64 {
		return nil, errors.New("bundleHash must be 64 hex chars")
	}
	srcCode, ok := ingestSourceCodes[source]
	if !ok {
		return nil, fmt.Errorf("unknown ingestSource: %s", source)
	}
	if channelCount < 1 || channelCount > 255 {
		return nil, errors.New("channelCount must be 1..255")
	}

	out := make([]byte, 50)
	hashBytes, err := hex.DecodeString(bundleHash)
	if err != nil {
		return nil, fmt.Errorf("decode bundleHash: %w", err)
	}
	copy(out[0:32], hashBytes)

	uuidHex := strings.ReplaceAll(eventID, "-", "")
	if len(uuidHex) != 32 {
		return nil, errors.New("eventId must be a hyphenated UUID")
	}
	uuidBytes, err := hex.DecodeString(uuidHex)
	if err != nil {
		return nil, fmt.Errorf("decode eventId: %w", err)
	}
	// FleetFusion writes the eventId via .NET Guid.ToByteArray(), which
	// is little-endian for the first 3 fields. Match that wire format
	// so cross-language verifiers decode the same eventIdGuid.
	dotnet := guidToDotNetBytes(uuidBytes)
	copy(out[32:48], dotnet)

	out[48] = srcCode
	out[49] = byte(channelCount)
	return out, nil
}

func hexUTF8(s string) string {
	return strings.ToUpper(hex.EncodeToString([]byte(s)))
}

// guidToDotNetBytes converts a 16-byte big-endian UUID (canonical
// hyphenated form) to the .NET Guid byte order: first three fields
// little-endian, remaining bytes preserved. Matches
// SecureManifestBuilder.cs's `Guid.ToByteArray()` exactly.
func guidToDotNetBytes(raw []byte) []byte {
	if len(raw) != 16 {
		return raw
	}
	out := make([]byte, 16)
	out[0], out[1], out[2], out[3] = raw[3], raw[2], raw[1], raw[0]
	out[4], out[5] = raw[5], raw[4]
	out[6], out[7] = raw[7], raw[6]
	copy(out[8:], raw[8:])
	return out
}

// ----------------------------------------------------------------------
// Canonical JSON serialisation (RFC 8785-compatible subset).
// ----------------------------------------------------------------------

func canonicalise(value any) ([]byte, error) {
	var sb strings.Builder
	if err := writeCanonical(&sb, value); err != nil {
		return nil, err
	}
	return []byte(sb.String()), nil
}

func writeCanonical(sb *strings.Builder, v any) error {
	switch x := v.(type) {
	case nil:
		sb.WriteString("null")
	case bool:
		if x {
			sb.WriteString("true")
		} else {
			sb.WriteString("false")
		}
	case json.Number:
		// json.Number preserves the original textual representation.
		// Re-emit canonically.
		s := string(x)
		if i, err := x.Int64(); err == nil && !strings.ContainsAny(s, ".eE") {
			sb.WriteString(strconv.FormatInt(i, 10))
		} else {
			f, err := x.Float64()
			if err != nil {
				return err
			}
			if f == float64(int64(f)) && !strings.ContainsAny(s, ".eE") {
				sb.WriteString(strconv.FormatInt(int64(f), 10))
			} else {
				sb.WriteString(strconv.FormatFloat(f, 'g', -1, 64))
			}
		}
	case float64:
		if x == float64(int64(x)) {
			sb.WriteString(strconv.FormatInt(int64(x), 10))
		} else {
			sb.WriteString(strconv.FormatFloat(x, 'g', -1, 64))
		}
	case int:
		sb.WriteString(strconv.Itoa(x))
	case int64:
		sb.WriteString(strconv.FormatInt(x, 10))
	case string:
		writeCanonicalString(sb, x)
	case []any:
		sb.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeCanonical(sb, item); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		sb.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				sb.WriteByte(',')
			}
			writeCanonicalString(sb, k)
			sb.WriteByte(':')
			if err := writeCanonical(sb, x[k]); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	default:
		return fmt.Errorf("cannot canonicalise type %T", v)
	}
	return nil
}

func writeCanonicalString(sb *strings.Builder, s string) {
	sb.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			sb.WriteString(`\"`)
		case '\\':
			sb.WriteString(`\\`)
		case '\b':
			sb.WriteString(`\b`)
		case '\f':
			sb.WriteString(`\f`)
		case '\n':
			sb.WriteString(`\n`)
		case '\r':
			sb.WriteString(`\r`)
		case '\t':
			sb.WriteString(`\t`)
		default:
			if r < 0x20 {
				sb.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				sb.WriteRune(r)
			}
		}
	}
	sb.WriteByte('"')
}

// ----------------------------------------------------------------------
// Demo entry point.
// ----------------------------------------------------------------------

func main() {
	fmt.Println("SecureFusion v1.0 -- Go anchor producer sample")
	fmt.Println(strings.Repeat("=", 60))

	examplesDir, err := findExamplesDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error:", err)
		os.Exit(2)
	}

	allOk := true
	for filename, expected := range expectedBundleHashes {
		path := filepath.Join(examplesDir, filename)
		data, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Read error:", err)
			os.Exit(2)
		}

		dec := json.NewDecoder(strings.NewReader(string(data)))
		dec.UseNumber()
		var manifest map[string]any
		if err := dec.Decode(&manifest); err != nil {
			fmt.Fprintln(os.Stderr, "Parse error:", err)
			os.Exit(2)
		}

		payload, err := BuildAnchorPayload(manifest, nil)
		if err != nil {
			fmt.Fprintln(os.Stderr, "Build error:", err)
			os.Exit(2)
		}

		ok := payload.BundleHash == expected
		allOk = allOk && ok

		channels := manifest["channels"].([]any)

		fmt.Println()
		fmt.Println("  Manifest:    " + filename)
		fmt.Println("  bundleHash:  " + payload.BundleHash)
		fmt.Println("  expected:    " + expected)
		match := "[FAIL]"
		if ok {
			match = "[OK]"
		}
		fmt.Println("  match:       " + match)
		fmt.Printf("  channels:    %d\n", len(channels))
		fmt.Printf("  memos:       %d\n", len(payload.Memos))
		fmt.Println("  bundle hex:  " + hex.EncodeToString(payload.BundleBytes)[:64] + "...")
	}

	fmt.Println()
	if allOk {
		fmt.Println("[OK] All test vectors match.")
		os.Exit(0)
	}
	fmt.Println("[FAIL] One or more test vectors did not match.")
	os.Exit(1)
}

func findExamplesDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for i := 0; i < 8; i++ {
		candidate := filepath.Join(dir, "examples")
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return candidate, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", errors.New("examples directory not found")
}
