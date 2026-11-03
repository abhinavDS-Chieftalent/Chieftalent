"""Verify the configured NIM endpoint and model with a real test call.

    python scripts/check_nim.py

Exits 0 only if the server answers AND the configured model produces output.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config
from app.services.nim_client import NIMClient, NIMError


def main():
    print(f"NIM_BASE_URL = {Config.NIM_BASE_URL}")
    print(f"NIM_MODEL    = {Config.NIM_MODEL or '(auto-discover)'}")
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)

    health = nim.health()
    if not health["ok"]:
        print(f"FAIL: server unreachable or not set up: {health['error']}")
        print("If this is a fresh nim-proxy, complete http://localhost:8100/setup first.")
        sys.exit(1)
    print(f"Server OK - {len(health['models'])} catalog models")

    model = nim.resolve_model()
    print(f"Using model: {model}")
    try:
        out = nim.chat(
            [{"role": "user", "content": 'Reply with ONLY this JSON: {"ok": true}'}],
            temperature=0.2, max_tokens=400,
        )
    except NIMError as e:
        print(f"FAIL: model call failed: {e}")
        print("The model may not be enabled on this NVIDIA account - "
              "set NIM_MODEL to one listed by this server's /v1/models.")
        sys.exit(1)
    print(f"Model responded: {out.strip()[:120]!r}")
    print("PASS")


if __name__ == "__main__":
    main()
