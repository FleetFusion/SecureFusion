"""
SecureFusion v1.0 -- Bitcoin / OpenTimestamps submission example (Python).

Submits a SecureFusion bundleHash to OpenTimestamps calendar servers,
which aggregate digests into Merkle trees and anchor them to Bitcoin.

The OpenTimestamps protocol provides a free, decentralised long-term
anchor with the strongest legal and archival precedent of any blockchain.
Per-event cost: GBP 0. Calendar aggregation latency: ~1 hour.

This sample uses the simplest version: POST the digest to multiple calendar
servers, collect the partial proofs. Production code should also "upgrade"
the proofs once Bitcoin includes the calendar's commitment (typically a
few hours later) -- see https://github.com/opentimestamps/python-opentimestamps
for the full client.

Requires: only Python's standard library (urllib).

Run:
    python3 submit_bitcoin.py
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

# Reuse the anchor builder from this sample directory.
sys.path.insert(0, str(Path(__file__).parent))
from securefusion_anchor import build_anchor_payload  # noqa: E402


# Public OpenTimestamps calendar servers.
# Production setups submit to multiple for redundancy.
CALENDAR_SERVERS = [
    "https://a.pool.opentimestamps.org",
    "https://b.pool.opentimestamps.org",
    "https://finney.calendar.eternitywall.com",
]


def submit_to_calendar(digest_bytes: bytes, calendar_url: str, timeout_s: int = 30) -> bytes:
    """
    POST a 32-byte SHA-256 digest to an OpenTimestamps calendar server.

    Returns the binary timestamp response, which is the partial proof that
    will be upgraded once Bitcoin includes the calendar's commitment.
    """
    if len(digest_bytes) != 32:
        raise ValueError("OpenTimestamps digest must be 32 bytes (SHA-256)")

    url = calendar_url.rstrip("/") + "/digest"
    req = urllib.request.Request(
        url,
        data=digest_bytes,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as response:
            if response.status != 200:
                raise RuntimeError(f"calendar {url} returned HTTP {response.status}")
            return response.read()
    except urllib.error.URLError as e:
        raise RuntimeError(f"calendar {url} failed: {e}") from e


def submit_anchor_to_bitcoin(bundle_hash_hex: str) -> dict[str, bytes]:
    """
    Submit a SecureFusion bundleHash to multiple OpenTimestamps calendars.

    Returns a mapping of calendar URL -> partial proof bytes. Save these
    as the .ots proof file alongside the SecureFusion event record.
    """
    digest = bytes.fromhex(bundle_hash_hex)
    proofs: dict[str, bytes] = {}
    for url in CALENDAR_SERVERS:
        print(f"  Submitting to {url}...", end=" ", flush=True)
        try:
            proofs[url] = submit_to_calendar(digest, url)
            print(f"[OK] ({len(proofs[url])} bytes)")
        except Exception as e:
            print(f"[FAIL] {e}")

    if not proofs:
        raise RuntimeError("All OpenTimestamps calendars failed")

    return proofs


def save_ots_proof(proofs: dict[str, bytes], output_path: Path) -> None:
    """
    Save calendar responses as a multi-calendar .ots-style file.

    Note: the simple format here is illustrative -- concatenated calendar
    responses with URL headers. Real .ots files use the OpenTimestamps
    binary format. For production, use the python-opentimestamps client
    which produces standard .ots files.
    """
    with output_path.open("wb") as f:
        for url, proof in proofs.items():
            header = f"--- {url} ---\n".encode("utf-8")
            f.write(header)
            f.write(proof)
            f.write(b"\n")


def main() -> int:
    examples_dir = Path(__file__).resolve().parent.parent.parent / "examples"
    with (examples_dir / "single-channel-event.json").open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    print("SecureFusion v1.0 -- OpenTimestamps (Bitcoin) submission")
    print("=" * 60)

    # Compute bundleHash. We don't need a signing key for OTS -- the digest
    # is what gets anchored.
    payload = build_anchor_payload(manifest)
    print(f"  bundleHash:  {payload['bundleHash']}")
    print()

    print("Anchoring to OpenTimestamps calendar servers:")
    proofs = submit_anchor_to_bitcoin(payload["bundleHash"])

    output_path = Path(__file__).parent / f"{payload['bundleHash'][:16]}.partial.ots"
    save_ots_proof(proofs, output_path)
    print()
    print(f"[OK] Saved partial proof: {output_path.name}")
    print()
    print("Next steps:")
    print("  1. The proof is currently 'partial' -- calendars have aggregated")
    print("     your digest but Bitcoin has not yet committed to it.")
    print("  2. Wait at least 1 hour, then call the calendars' upgrade API")
    print("     to get the full Bitcoin block commitment.")
    print("  3. Store the upgraded .ots proof in the SecureFusion ledger,")
    print("     associated with the event record.")
    print()
    print("For production use, the official OTS client handles upgrading:")
    print("  pip install opentimestamps-client")
    return 0


if __name__ == "__main__":
    sys.exit(main())
