// SecureFusion v1.0 -- XRPL submission example (Go).
//
// Submits a SecureFusion-anchored video event to the XRP Ledger.
//
// Reference XRPL libraries (pick one -- neither is bundled with this sample):
//   - github.com/Peersyst/xrpl-go    (active community, JSON-RPC + WebSocket)
//   - github.com/rubblelabs/ripple   (older, lower-level)
//
// This file is REFERENCE CODE: the active XRPL submission is commented out
// to keep the sample buildable with stdlib only. To use, add the dependency
// to go.mod and uncomment the block in submitToXrpl().
//
// Run (after enabling the library):
//     export SECUREFUSION_XRPL_SEED=s...
//     export SECUREFUSION_APP_KEY_HEX=64hex
//     cd samples/go/submit_xrpl
//     go run main.go

package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const (
	testnetURL = "https://s.altnet.rippletest.net:51234"
	mainnetURL = "https://xrplcluster.com"
)

func main() {
	seed := os.Getenv("SECUREFUSION_XRPL_SEED")
	appKeyHex := os.Getenv("SECUREFUSION_APP_KEY_HEX")
	if seed == "" || appKeyHex == "" {
		fmt.Fprintln(os.Stderr, "Missing required environment variables:")
		fmt.Fprintln(os.Stderr, "  SECUREFUSION_XRPL_SEED      -- XRPL wallet seed (s...)")
		fmt.Fprintln(os.Stderr, "  SECUREFUSION_APP_KEY_HEX    -- 32-byte Ed25519 seed (64 hex chars)")
		os.Exit(2)
	}

	examplesDir, err := findExamplesDir()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	data, err := os.ReadFile(filepath.Join(examplesDir, "single-channel-event.json"))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	dec := json.NewDecoder(strings.NewReader(string(data)))
	dec.UseNumber()
	var manifest map[string]any
	if err := dec.Decode(&manifest); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	appKey, err := hex.DecodeString(appKeyHex)
	if err != nil || len(appKey) != 32 {
		fmt.Fprintln(os.Stderr, "SECUREFUSION_APP_KEY_HEX must be 32 bytes (64 hex chars)")
		os.Exit(2)
	}

	payload, err := buildAnchorPayload(manifest, appKey)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	fmt.Println("SecureFusion v1.0 -- XRPL submission")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("  bundleHash:  " + payload.BundleHash)
	fmt.Printf("  bundleBytes: %d bytes\n", len(payload.BundleBytes))
	fmt.Printf("  eventBytes:  %d bytes\n", len(payload.EventBytes))
	fmt.Printf("  signature:   %d bytes\n", len(payload.Signature))

	if err := submitToXrpl(payload, seed, testnetURL); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func submitToXrpl(payload *anchorPayload, seed, rippledURL string) error {
	// ============================================================
	// Pseudocode using github.com/Peersyst/xrpl-go.
	// Uncomment after `go get github.com/Peersyst/xrpl-go/@latest`.
	// ============================================================
	//
	// import (
	//     "github.com/Peersyst/xrpl-go/xrpl"
	//     "github.com/Peersyst/xrpl-go/xrpl/transactions"
	// )
	//
	// client := xrpl.NewClient(rippledURL)
	// wallet, err := xrpl.WalletFromSeed(seed)
	// if err != nil { return err }
	// fmt.Println("  XRPL account:", wallet.ClassicAddress)
	//
	// memos := make([]transactions.MemoWrapper, len(payload.Memos))
	// for i, m := range payload.Memos {
	//     memos[i] = transactions.MemoWrapper{
	//         Memo: transactions.Memo{
	//             MemoType:   m.MemoType,
	//             MemoFormat: m.MemoFormat,
	//             MemoData:   m.MemoData,
	//         },
	//     }
	// }
	//
	// payment := &transactions.Payment{
	//     Account:     wallet.ClassicAddress,
	//     Destination: wallet.ClassicAddress,
	//     Amount:      "1",
	//     Memos:       memos,
	// }
	//
	// signed, err := wallet.Sign(client.Autofill(payment))
	// if err != nil { return err }
	// fmt.Println("  Submitting transaction", signed.Hash, "...")
	//
	// result, err := client.SubmitAndWait(signed)
	// if err != nil { return err }
	// fmt.Println()
	// fmt.Println("[OK] Anchored to XRPL")
	// fmt.Println("  Transaction:", result.Hash)
	// fmt.Println("  Ledger:     ", result.LedgerIndex)
	// fmt.Println("  Verify at:   https://testnet.xrpl.org/transactions/" + result.Hash)
	// return nil

	fmt.Fprintln(os.Stderr)
	fmt.Fprintln(os.Stderr, "Sample skipped -- xrpl-go not on module path.")
	fmt.Fprintln(os.Stderr, "See the comments in submitToXrpl() to enable.")
	return nil
}

// ============================================================
// Inline copy of the anchor builder so this file is self-contained.
// In a real project, `import "github.com/yourorg/securefusion/anchor"`.
// ============================================================

type xrplMemo struct {
	MemoType, MemoFormat, MemoData string
}

type anchorPayload struct {
	BundleHash  string
	BundleBytes []byte
	EventBytes  []byte
	Signature   []byte
	Memos       []xrplMemo
}

// SecureFusion v1: single-value enum, single source-code byte.
var ingestSourceCodes = map[string]byte{"fleetfusion": 1}

func buildAnchorPayload(manifest map[string]any, appKey32 []byte) (*anchorPayload, error) {
	eventBytes, err := canonicalise(manifest)
	if err != nil {
		return nil, err
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
		signature = ed25519.Sign(ed25519.NewKeyFromSeed(appKey32), sigInput)
	}

	memos := []xrplMemo{
		{MemoType: hexUTF8("SF1.bundle"), MemoFormat: hexUTF8("application/octet-stream"), MemoData: strings.ToUpper(hex.EncodeToString(bundleBytes))},
		{MemoType: hexUTF8("SF1.event"), MemoFormat: hexUTF8("application/json"), MemoData: strings.ToUpper(hex.EncodeToString(eventBytes))},
		{MemoType: hexUTF8("SF1.sig"), MemoFormat: hexUTF8("application/octet-stream"), MemoData: strings.ToUpper(hex.EncodeToString(signature))},
	}

	return &anchorPayload{bundleHash, bundleBytes, eventBytes, signature, memos}, nil
}

func encodeBundleMemo(bundleHash, eventID, source string, channelCount int) ([]byte, error) {
	src, ok := ingestSourceCodes[source]
	if !ok {
		return nil, fmt.Errorf("unknown ingestSource: %s", source)
	}
	out := make([]byte, 50)
	hb, _ := hex.DecodeString(bundleHash)
	copy(out[0:32], hb)
	uh, _ := hex.DecodeString(strings.ReplaceAll(eventID, "-", ""))
	// .NET Guid byte order to match FleetFusion (joint-plan winner rule).
	if len(uh) == 16 {
		dn := make([]byte, 16)
		dn[0], dn[1], dn[2], dn[3] = uh[3], uh[2], uh[1], uh[0]
		dn[4], dn[5] = uh[5], uh[4]
		dn[6], dn[7] = uh[7], uh[6]
		copy(dn[8:], uh[8:])
		copy(out[32:48], dn)
	}
	out[48] = src
	out[49] = byte(channelCount)
	return out, nil
}

func hexUTF8(s string) string { return strings.ToUpper(hex.EncodeToString([]byte(s))) }

func canonicalise(v any) ([]byte, error) {
	var sb strings.Builder
	if err := writeC(&sb, v); err != nil {
		return nil, err
	}
	return []byte(sb.String()), nil
}

func writeC(sb *strings.Builder, v any) error {
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
		s := string(x)
		if i, err := x.Int64(); err == nil && !strings.ContainsAny(s, ".eE") {
			sb.WriteString(strconv.FormatInt(i, 10))
		} else if f, err := x.Float64(); err == nil {
			if f == float64(int64(f)) && !strings.ContainsAny(s, ".eE") {
				sb.WriteString(strconv.FormatInt(int64(f), 10))
			} else {
				sb.WriteString(strconv.FormatFloat(f, 'g', -1, 64))
			}
		}
	case string:
		writeS(sb, x)
	case []any:
		sb.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				sb.WriteByte(',')
			}
			if err := writeC(sb, item); err != nil {
				return err
			}
		}
		sb.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			if !strings.HasPrefix(k, "_") {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		sb.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				sb.WriteByte(',')
			}
			writeS(sb, k)
			sb.WriteByte(':')
			if err := writeC(sb, x[k]); err != nil {
				return err
			}
		}
		sb.WriteByte('}')
	default:
		return fmt.Errorf("cannot canonicalise type %T", v)
	}
	return nil
}

func writeS(sb *strings.Builder, s string) {
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

func findExamplesDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for i := 0; i < 10; i++ {
		c := filepath.Join(dir, "examples")
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", fmt.Errorf("examples directory not found")
}
