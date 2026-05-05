"""
SecureFusion v1.0 (SF1) anchor producer -- Python sample.

Builds the three-memo XRPL transaction payload for a video event:
  - SF1.bundle (50-byte binary header: hex-encoded)
  - SF1.event  (canonical manifest JSON: hex-encoded UTF-8)
  - SF1.sig    (Ed25519 signature over SF1.bundle || SF1.event: hex-encoded)

Submission to XRPL is left to a library such as `xrpl-py`:
    pip install xrpl-py

This sample has zero third-party dependencies for hashing / canonicalisation.
For Ed25519 signing, install one of:
    pip install cryptography
    pip install pynacl

Run:
    python securefusion_anchor.py

Expected output for the bundled example:
    bundleHash: e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05
"""

from __future__ import annotations

import hashlib
import json
import sys
import uuid
from pathlib import Path
from typing import Any


# --------------------------------------------------------------------------
# Canonical JSON serialisation (RFC 8785-compatible subset).
# --------------------------------------------------------------------------

def canonicalise(value: Any) -> bytes:
    """Return the canonical UTF-8 byte representation of `value`.

    Rules:
      - object keys sorted lexicographically
      - no insignificant whitespace
      - integers without decimal point
      - boolean/null lowercase
    """
    return _serialise(value).encode("utf-8")


def _serialise(v: Any) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int,)) and not isinstance(v, bool):
        return str(v)
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            raise ValueError("Non-finite numbers are not permitted in canonical JSON")
        # Python's repr produces a round-trippable shortest form.
        if v.is_integer():
            return str(int(v))
        return repr(v)
    if isinstance(v, str):
        return _serialise_string(v)
    if isinstance(v, list):
        return "[" + ",".join(_serialise(item) for item in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys())
        return "{" + ",".join(_serialise_string(k) + ":" + _serialise(v[k]) for k in keys) + "}"
    raise TypeError(f"Cannot canonicalise {type(v).__name__}")


def _serialise_string(s: str) -> str:
    out = ['"']
    for ch in s:
        c = ord(ch)
        if c == 0x22:
            out.append('\\"')
        elif c == 0x5C:
            out.append("\\\\")
        elif c == 0x08:
            out.append("\\b")
        elif c == 0x0C:
            out.append("\\f")
        elif c == 0x0A:
            out.append("\\n")
        elif c == 0x0D:
            out.append("\\r")
        elif c == 0x09:
            out.append("\\t")
        elif c < 0x20:
            out.append(f"\\u{c:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


# --------------------------------------------------------------------------
# SHA-256 helpers.
# --------------------------------------------------------------------------

def sha256_hex(data: bytes | str) -> str:
    """Return the lowercase hex SHA-256 of bytes or a UTF-8 string."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def sha256_bytes(data: bytes) -> bytes:
    """Return the raw SHA-256 digest."""
    return hashlib.sha256(data).digest()


def sha256_file(path: str | Path) -> str:
    """Stream a file and return its lowercase hex SHA-256."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# --------------------------------------------------------------------------
# SF1.bundle binary header (50 bytes).
# --------------------------------------------------------------------------

INGEST_SOURCE_CODES: dict[str, int] = {
    # SecureFusion v1: single-value enum on the wire, single source-code byte.
    # Per-upstream-provider distinctions are not exposed publicly. v2 may extend.
    "fleetfusion": 1,
}


def encode_bundle_memo(*, bundle_hash: str, event_id: str, ingest_source: str, channel_count: int) -> bytes:
    """Build the 50-byte SF1.bundle binary header.

    Layout:
      [0:32]   bundleHash
      [32:48]  eventId (raw 16-byte UUID, big-endian)
      [48]     ingestSource code
      [49]     channelCount
    """
    if len(bundle_hash) != 64:
        raise ValueError("bundleHash must be 64 hex chars (32 bytes)")
    src_code = INGEST_SOURCE_CODES.get(ingest_source)
    if src_code is None:
        raise ValueError(f"Unknown ingestSource: {ingest_source}")
    if not 1 <= channel_count <= 255:
        raise ValueError("channelCount must be 1..255")

    out = bytearray(50)
    out[0:32] = bytes.fromhex(bundle_hash)
    # FleetFusion writes the eventId via .NET Guid.ToByteArray(), which is
    # little-endian for the first 3 fields. Python's uuid.UUID.bytes_le
    # matches that exact wire format.
    out[32:48] = uuid.UUID(event_id).bytes_le
    out[48] = src_code
    out[49] = channel_count
    return bytes(out)


# --------------------------------------------------------------------------
# Memo construction for the XRPL Payment transaction.
# --------------------------------------------------------------------------

def _str_to_hex(s: str) -> str:
    return s.encode("utf-8").hex().upper()


def build_memos(*, bundle_bytes: bytes, event_bytes: bytes, signature: bytes) -> list[dict]:
    """Return the Memos array suitable for an XRPL Payment transaction.

    Each entry is a dict with a single 'Memo' key containing
    MemoType, MemoFormat, MemoData (all hex-encoded uppercase),
    matching the format expected by xrpl-py and rippled.
    """
    if len(bundle_bytes) != 50:
        raise ValueError("SF1.bundle must be 50 bytes")
    if len(signature) != 64:
        raise ValueError("Ed25519 signature must be 64 bytes")

    return [
        {
            "Memo": {
                "MemoType": _str_to_hex("SF1.bundle"),
                "MemoFormat": _str_to_hex("application/octet-stream"),
                "MemoData": bundle_bytes.hex().upper(),
            }
        },
        {
            "Memo": {
                "MemoType": _str_to_hex("SF1.event"),
                "MemoFormat": _str_to_hex("application/json"),
                "MemoData": event_bytes.hex().upper(),
            }
        },
        {
            "Memo": {
                "MemoType": _str_to_hex("SF1.sig"),
                "MemoFormat": _str_to_hex("application/octet-stream"),
                "MemoData": signature.hex().upper(),
            }
        },
    ]


# --------------------------------------------------------------------------
# Ed25519 signing via cryptography or PyNaCl.
# --------------------------------------------------------------------------

def ed25519_sign(message: bytes, secret_key_32: bytes) -> bytes:
    """Sign `message` with a 32-byte Ed25519 seed.

    Tries the `cryptography` library first, then PyNaCl. If neither is
    installed, raises a clear error.
    """
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
        key = Ed25519PrivateKey.from_private_bytes(secret_key_32)
        return key.sign(message)
    except ImportError:
        pass
    try:
        from nacl.signing import SigningKey
        return bytes(SigningKey(secret_key_32).sign(message).signature)
    except ImportError:
        pass
    raise RuntimeError(
        "Neither 'cryptography' nor 'pynacl' is installed. "
        "Install one with: pip install cryptography  (or)  pip install pynacl"
    )


# --------------------------------------------------------------------------
# End-to-end builder.
# --------------------------------------------------------------------------

def build_anchor_payload(manifest: dict, app_signing_key_32: bytes | None = None) -> dict:
    """Build the full SecureFusion anchor payload for an event.

    Returns a dict with:
        bundleHash:   the canonical SHA-256 over the manifest
        bundleBytes:  raw 50-byte SF1.bundle header (bytes)
        eventBytes:   canonical UTF-8 JSON of the manifest (bytes)
        signature:    Ed25519 signature over bundleBytes || eventBytes
        memos:        XRPL Memos array ready to attach to a Payment

    If app_signing_key_32 is None, signature is 64 zero bytes (for testing
    canonicalisation only -- never submit such a transaction).
    """
    event_bytes = canonicalise(manifest)
    bundle_hash = sha256_hex(event_bytes)
    bundle_bytes = encode_bundle_memo(
        bundle_hash=bundle_hash,
        event_id=manifest["eventId"],
        ingest_source=manifest["ingestSource"],
        channel_count=len(manifest["channels"]),
    )

    sig_input = bundle_bytes + event_bytes
    if app_signing_key_32 is None:
        signature = bytes(64)
    else:
        signature = ed25519_sign(sig_input, app_signing_key_32)

    memos = build_memos(
        bundle_bytes=bundle_bytes,
        event_bytes=event_bytes,
        signature=signature,
    )

    return {
        "bundleHash": bundle_hash,
        "bundleBytes": bundle_bytes,
        "eventBytes": event_bytes,
        "signature": signature,
        "memos": memos,
    }


# --------------------------------------------------------------------------
# Demonstration entry point.
# --------------------------------------------------------------------------

EXAMPLES_DIR = Path(__file__).resolve().parent.parent.parent / "examples"

EXPECTED_BUNDLE_HASHES = {
    # Mirror of examples/test-vectors.json. Update both files together.
    "single-channel-event.json": "e1b8a2206cf8c53754c392f8e6b7aad25972e6349a70bd7c4cecde424caf0f05",
    "four-channel-event.json": "8e4a41ebcc87183ca42f023409713ac2316f37c480bae00582536759543936fb",
}


def main() -> int:
    print("SecureFusion v1.0 -- Python anchor producer sample")
    print("=" * 60)

    all_ok = True
    for filename, expected in EXPECTED_BUNDLE_HASHES.items():
        path = EXAMPLES_DIR / filename
        with path.open("r", encoding="utf-8") as f:
            manifest = json.load(f)

        payload = build_anchor_payload(manifest)
        ok = payload["bundleHash"] == expected
        all_ok &= ok

        print(f"\n  Manifest:    {filename}")
        print(f"  bundleHash:  {payload['bundleHash']}")
        print(f"  expected:    {expected}")
        print(f"  match:       {'[OK]' if ok else '[FAIL]'}")
        print(f"  channels:    {len(manifest['channels'])}")
        print(f"  memos:       {len(payload['memos'])}")
        print(f"  bundle hex:  {payload['bundleBytes'].hex()[:64]}...")

    print()
    if all_ok:
        print("[OK] All test vectors match.")
        return 0
    print("[FAIL] One or more test vectors did not match.")
    return 1


def self_test() -> int:
    """Minimal smoke test that runs to completion under any code page.

    Reads the bundled examples, recomputes the bundleHash, and compares to
    the published EXPECTED_BUNDLE_HASHES. Exits non-zero if any vector
    diverges. ASCII output only -- safe under cp1252 / cp437 PowerShell.
    """
    print("SecureFusion -- Python self-test")
    failed = []
    for filename, expected in EXPECTED_BUNDLE_HASHES.items():
        path = EXAMPLES_DIR / filename
        with path.open("r", encoding="utf-8") as f:
            manifest = json.load(f)
        got = build_anchor_payload(manifest)["bundleHash"]
        status = "[OK]" if got == expected else "[FAIL]"
        print(f"  {status} {filename}: {got}")
        if got != expected:
            failed.append((filename, expected, got))
    if failed:
        print(f"[FAIL] self-test: {len(failed)} vector(s) diverged")
        return 1
    print("[OK] self-test passed")
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv[1:]:
        sys.exit(self_test())
    sys.exit(main())
