"""Round-trip golden tests for the Python anchor sample. (B9.5)

For every entry in examples/test-vectors.json, parse the manifest, run it
through canonicalise + sha256, and compare to the published bundleHash.
This proves the Python canonicaliser stays byte-for-byte aligned with the
reference implementation.

Run:
    python -m pytest samples/python/test_canonical.py
    # or, since we use stdlib only:
    python samples/python/test_canonical.py
"""

from __future__ import annotations

import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from securefusion_anchor import canonicalise  # noqa: E402

EXAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "examples"


class CanonicalGoldenVectorsTest(unittest.TestCase):
    def test_published_vectors_match(self) -> None:
        vectors_path = EXAMPLES_DIR / "test-vectors.json"
        self.assertTrue(vectors_path.exists(), f"missing {vectors_path}")
        with vectors_path.open("r", encoding="utf-8") as f:
            vf = json.load(f)
        vectors = vf.get("vectors", [])
        self.assertGreater(len(vectors), 0, "test-vectors.json has no vectors")

        for v in vectors:
            with self.subTest(manifest=v["manifest"]):
                manifest_path = EXAMPLES_DIR / v["manifest"]
                with manifest_path.open("r", encoding="utf-8") as f:
                    manifest = json.load(f)
                got = hashlib.sha256(canonicalise(manifest)).hexdigest()
                self.assertEqual(
                    got,
                    v["bundleHash"],
                    f"bundleHash drift for {v['manifest']}: "
                    f"want {v['bundleHash']}, got {got}",
                )


if __name__ == "__main__":
    unittest.main()
