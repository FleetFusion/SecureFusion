// Round-trip golden test for the Go anchor sample. (B9.5)
//
// Reads each manifest listed in examples/test-vectors.json, runs it through
// canonicalise + sha256, and asserts the resulting bundleHash matches the
// vector's published value. This proves the Go canonicaliser stays
// byte-for-byte aligned with the reference.
//
// If schema dev refreshes examples/test-vectors.json, this test picks up
// the new oracle automatically.

package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type vectorFile struct {
	Vectors []struct {
		Manifest   string `json:"manifest"`
		BundleHash string `json:"bundleHash"`
	} `json:"vectors"`
}

func TestBundleHashesMatchPublishedVectors(t *testing.T) {
	examplesDir, err := findExamplesDir()
	if err != nil {
		t.Fatalf("examples dir: %v", err)
	}

	vfData, err := os.ReadFile(filepath.Join(examplesDir, "test-vectors.json"))
	if err != nil {
		t.Fatalf("read test-vectors.json: %v", err)
	}
	var vf vectorFile
	if err := json.Unmarshal(vfData, &vf); err != nil {
		t.Fatalf("parse test-vectors.json: %v", err)
	}
	if len(vf.Vectors) == 0 {
		t.Fatal("test-vectors.json has no vectors")
	}

	for _, v := range vf.Vectors {
		v := v
		t.Run(v.Manifest, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join(examplesDir, v.Manifest))
			if err != nil {
				t.Fatalf("read manifest %s: %v", v.Manifest, err)
			}
			dec := json.NewDecoder(strings.NewReader(string(data)))
			dec.UseNumber()
			var manifest map[string]any
			if err := dec.Decode(&manifest); err != nil {
				t.Fatalf("parse manifest %s: %v", v.Manifest, err)
			}
			eventBytes, err := canonicalise(manifest)
			if err != nil {
				t.Fatalf("canonicalise %s: %v", v.Manifest, err)
			}
			sum := sha256.Sum256(eventBytes)
			got := hex.EncodeToString(sum[:])
			if got != v.BundleHash {
				t.Fatalf("bundleHash drift for %s:\n  want: %s\n  got:  %s",
					v.Manifest, v.BundleHash, got)
			}
		})
	}
}
