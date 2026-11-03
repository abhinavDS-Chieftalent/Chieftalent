"""Naming rule: nothing user-visible may name the AI provider ("NIM", "NVIDIA").

Run inside the scratch environment (fake data, unreachable AI endpoint):

    python scripts/ui_scratch.py --seed-only
    python <scratch>/scripts/test_ai_naming.py
"""
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from app import create_app  # noqa: E402
from app.config import Config  # noqa: E402
from app.services.nim_client import NIMClient, NIMError  # noqa: E402

# "nim"/"nvidia" as a word or env-var prefix (NIM_MODEL), but not inside words like "minimum"
LEAK = re.compile(r"(?<![A-Za-z])(nim|nvidia)(?![a-z])", re.I)
failures = []


def check(name, ok, detail=""):
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" - {detail}" if detail else ""))
    if not ok:
        failures.append(name)


def test_overview_has_ai_not_nim():
    app = create_app()
    client = app.test_client()
    with client.session_transaction() as s:
        s["user_id"] = 1
    resp = client.get("/api/admin/overview")
    data = resp.get_json() or {}
    ai = data.get("ai") or {}
    check("overview.status_200", resp.status_code == 200, f"status={resp.status_code}")
    check("overview.has_ai_object", set(ai) >= {"ok", "error"}, f"ai keys={sorted(ai)}")
    check("overview.no_nim_key", "nim" not in data, f"top-level keys={sorted(data)}")
    check("overview.no_model_field", "model" not in ai, f"ai keys={sorted(ai)}")
    check("overview.no_provider_text", not LEAK.search(str(data.get("ai"))), str(data.get("ai"))[:120])


def test_chat_failure_message_neutral():
    client = NIMClient("http://127.0.0.1:9/v1", "", "some-model")
    try:
        client.chat([{"role": "user", "content": "hi"}], retries=1)
        check("chat.failure_raises", False, "no exception")
        return
    except NIMError as e:
        msg = str(e)
    check("chat.failure_message_neutral", not LEAK.search(msg), msg[:140])


def test_no_models_message_neutral():
    client = NIMClient("http://127.0.0.1:9/v1", "", "")
    try:
        client.resolve_model()
        check("resolve.no_models_raises", False, "no exception")
        return
    except NIMError as e:
        msg = str(e)
    check("resolve.no_models_message_neutral", not LEAK.search(msg), msg[:140])


if __name__ == "__main__":
    assert str(Config.DB_PATH).startswith(str(ROOT)), "must run against the scratch copy"
    test_overview_has_ai_not_nim()
    test_chat_failure_message_neutral()
    test_no_models_message_neutral()
    print(f"\n{len(failures)} failed" if failures else "\nALL CHECKS PASSED")
    sys.exit(1 if failures else 0)
