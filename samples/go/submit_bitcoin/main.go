// SecureFusion v1.0 -- Bitcoin / OpenTimestamps submission example (Go).
//
// Submits a SecureFusion bundleHash to OpenTimestamps calendar servers.
// Stdlib only -- no third-party dependencies.
//
// Run:
//     cd samples/go/submit_bitcoin
//     go run main.go

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

var calendarServers = []string{
	"https://a.pool.opentimestamps.org",
	"https://b.pool.opentimestamps.org",
	"https://finney.calendar.eternitywall.com",
}

func main() {
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
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var manifest map[string]any
	if err := dec.Decode(&manifest); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	// Compute bundleHash via canonical JSON.
	eventBytes, err := canonicalise(manifest)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	hash := sha256.Sum256(eventBytes)
	bundleHash := hex.EncodeToString(hash[:])

	fmt.Println("SecureFusion v1.0 -- OpenTimestamps (Bitcoin) submission")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("  bundleHash:  " + bundleHash)
	fmt.Println()

	// Submit to multiple calendars.
	fmt.Println("Anchoring to OpenTimestamps calendar servers:")
	proofs := map[string][]byte{}
	for _, server := range calendarServers {
		fmt.Printf("  Submitting to %s... ", server)
		proof, err := submitToCalendar(hash[:], server)
		if err != nil {
			fmt.Println("[FAIL]", err)
			continue
		}
		proofs[server] = proof
		fmt.Printf("[OK] (%d bytes)\n", len(proof))
	}

	if len(proofs) == 0 {
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "[FAIL] All OpenTimestamps calendars failed.")
		os.Exit(1)
	}

	// Save partial proofs.
	outPath := bundleHash[:16] + ".partial.ots"
	f, err := os.Create(outPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer f.Close()

	// Stable order in output.
	urls := make([]string, 0, len(proofs))
	for u := range proofs {
		urls = append(urls, u)
	}
	sort.Strings(urls)
	for _, u := range urls {
		fmt.Fprintf(f, "--- %s ---\n", u)
		f.Write(proofs[u])
		f.Write([]byte{'\n'})
	}

	fmt.Println()
	fmt.Println("[OK] Saved partial proof:", outPath)
	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. The proof is currently 'partial' -- calendars have aggregated")
	fmt.Println("     your digest but Bitcoin has not yet committed to it.")
	fmt.Println("  2. Wait at least 1 hour, then call the calendars' upgrade API")
	fmt.Println("     to get the full Bitcoin block commitment.")
	fmt.Println("  3. Store the upgraded .ots proof in the SecureFusion ledger.")
}

func submitToCalendar(digest []byte, calendarURL string) ([]byte, error) {
	if len(digest) != 32 {
		return nil, fmt.Errorf("OpenTimestamps digest must be 32 bytes")
	}
	url := strings.TrimRight(calendarURL, "/") + "/digest"

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("POST", url, bytes.NewReader(digest))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// ============================================================
// Inline canonical JSON (same as the anchor sample).
// ============================================================

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
