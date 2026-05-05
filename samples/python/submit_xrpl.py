"""
SecureFusion v1.0 -- XRPL submission example (Python).

Submits a SecureFusion-anchored video event to the XRP Ledger as a
self-pay 1-drop Payment carrying the three SF1 memos.

Requires:
    pip install xrpl-py

This sample is INTENTIONALLY NON-EXECUTING by default -- it requires real
XRPL credentials and a funded testnet/mainnet account. It is provided as
copy-paste reference for implementers.

To run against testnet:
    1. Get a funded testnet wallet at https://xrpl.org/xrp-testnet-faucet.html
    2. Set environment variables:
           SECUREFUSION_XRPL_SEED   (the wallet's seed: starts with 's...')
           SECUREFUSION_APP_KEY_HEX (32-byte hex Ed25519 seed for SF1.sig)
    3. python3 submit_xrpl.py

For mainnet, point at https://xrplcluster.com (or your own rippled node)
and use a real funded account.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Reuse the anchor builder from this sample directory.
sys.path.insert(0, str(Path(__file__).parent))
from securefusion_anchor import build_anchor_payload  # noqa: E402

# xrpl-py imports -- all optional for the demo. If not installed, we exit early.
try:
    from xrpl.clients import JsonRpcClient
    from xrpl.models.transactions import Memo, Payment
    from xrpl.transaction import autofill_and_sign, submit_and_wait
    from xrpl.wallet import Wallet
except ImportError:
    print("xrpl-py not installed. Run: pip install xrpl-py")
    sys.exit(2)


TESTNET_URL = "https://s.altnet.rippletest.net:51234"
MAINNET_URL = "https://xrplcluster.com"


def submit_securefusion_anchor(
    manifest: dict,
    application_key_hex: str,
    xrpl_account_seed: str,
    rippled_url: str = TESTNET_URL,
) -> dict:
    """
    Submit a SecureFusion anchor to XRPL.

    Returns the validated transaction result, including the txHash and ledgerIndex.
    """
    # 1. Build the SecureFusion payload (canonical hash + signed memos).
    app_key = bytes.fromhex(application_key_hex)
    payload = build_anchor_payload(manifest, app_signing_key_32=app_key)

    print(f"  bundleHash:  {payload['bundleHash']}")
    print(f"  bundleBytes: {len(payload['bundleBytes'])} bytes")
    print(f"  eventBytes:  {len(payload['eventBytes'])} bytes")
    print(f"  signature:   {len(payload['signature'])} bytes")

    # 2. Convert our memos format to xrpl-py Memo objects.
    xrpl_memos = [
        Memo(
            memo_type=m["Memo"]["MemoType"],
            memo_format=m["Memo"]["MemoFormat"],
            memo_data=m["Memo"]["MemoData"],
        )
        for m in payload["memos"]
    ]

    # 3. Build a self-pay 1-drop Payment with the memos attached.
    client = JsonRpcClient(rippled_url)
    wallet = Wallet.from_seed(xrpl_account_seed)

    print(f"  XRPL account: {wallet.classic_address}")
    print(f"  rippled URL:  {rippled_url}")

    tx = Payment(
        account=wallet.classic_address,
        destination=wallet.classic_address,
        amount="1",  # 1 drop, self-pay (transaction is the anchor, not a value transfer)
        memos=xrpl_memos,
    )

    # 4. Autofill (sequence, fee, last-ledger), sign, submit, and wait.
    signed_tx = autofill_and_sign(tx, client, wallet)
    print(f"  Submitting transaction {signed_tx.get_hash()}...")
    response = submit_and_wait(signed_tx, client)

    return response.result


def main() -> int:
    seed = os.environ.get("SECUREFUSION_XRPL_SEED")
    app_key = os.environ.get("SECUREFUSION_APP_KEY_HEX")

    if not seed or not app_key:
        print("Missing required environment variables:")
        print("  SECUREFUSION_XRPL_SEED   -- XRPL wallet seed (s...)")
        print("  SECUREFUSION_APP_KEY_HEX -- 32-byte Ed25519 seed (64 hex chars)")
        print()
        print("This sample submits to testnet by default. Get a funded testnet wallet at:")
        print("  https://xrpl.org/xrp-testnet-faucet.html")
        return 2

    if len(app_key) != 64:
        print("SECUREFUSION_APP_KEY_HEX must be 64 hex chars (32 bytes)")
        return 2

    # Load the example manifest.
    examples_dir = Path(__file__).resolve().parent.parent.parent / "examples"
    with (examples_dir / "single-channel-event.json").open("r", encoding="utf-8") as f:
        manifest = json.load(f)

    print("SecureFusion v1.0 -- XRPL submission")
    print("=" * 60)
    result = submit_securefusion_anchor(manifest, app_key, seed)

    print()
    print("[OK] Anchored to XRPL")
    print(f"  Transaction:  {result.get('hash')}")
    print(f"  Ledger:       {result.get('ledger_index')}")
    print(f"  Validated:    {result.get('validated')}")
    print(f"  Engine:       {result.get('engine_result')}")

    # Anyone can verify this on a public XRPL explorer:
    tx_hash = result.get("hash")
    print()
    print(f"  Verify at:    https://testnet.xrpl.org/transactions/{tx_hash}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
