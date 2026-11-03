"""Benchmark candidate NIM models on the REAL ATS prompt (latency + JSON validity).

    python scripts/benchmark_models.py [model ...]
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests

from app.config import Config
from app.services import cv_parser
from app.services.ats_reviewer import ATS_SYSTEM, ATS_USER_TEMPLATE
from app.services.interview_service import load_job_posting
from app.services.nim_client import extract_json

CANDIDATES = [
    "openai/gpt-oss-20b",
    "z-ai/glm-5.3-flash",
]


def bench(model, messages, extra=None):
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 1500,
        "stream": False,
    }
    if extra:
        payload.update(extra)
    headers = {"Content-Type": "application/json"}
    if Config.NIM_API_KEY:
        headers["Authorization"] = f"Bearer {Config.NIM_API_KEY}"
    t0 = time.time()
    try:
        r = requests.post(f"{Config.NIM_BASE_URL}/chat/completions",
                          headers=headers, json=payload, timeout=300)
        dt = time.time() - t0
        if r.status_code != 200:
            return {"model": model, "ok": False, "error": f"HTTP {r.status_code}: {r.text[:120]}", "seconds": round(dt, 1)}
        msg = (r.json().get("choices") or [{}])[0].get("message", {})
        content = (msg.get("content") or "").strip()
        usage = r.json().get("usage", {})
        if not content:
            return {"model": model, "ok": False, "error": "empty content", "seconds": round(dt, 1)}
        try:
            parsed = extract_json(content)
            score = parsed.get("overall_score", "?")
            return {"model": model, "ok": True, "seconds": round(dt, 1),
                    "score": score, "completion_tokens": usage.get("completion_tokens")}
        except Exception as e:
            return {"model": model, "ok": False, "error": f"bad JSON: {e}", "seconds": round(dt, 1)}
    except Exception as e:
        return {"model": model, "ok": False, "error": str(e)[:120], "seconds": round(time.time() - t0, 1)}


def main():
    job = load_job_posting("business_analyst")
    cv_text = cv_parser.extract_text_from_pdf(
        Config.JOBS_DIR / "business_analyst" / "candidate_01_cv.pdf")
    user = ATS_USER_TEMPLATE.format(
        job_title=job["title"], job_summary=job["summary"],
        job_responsibilities="\n".join(f"- {i}" for i in job["responsibilities"]),
        job_requirements="\n".join(f"- {i}" for i in job["requirements"]),
        job_nice_to_have="\n".join(f"- {i}" for i in job["nice_to_have"]),
        cv_text=cv_text[:12000],
    )
    messages = [{"role": "system", "content": ATS_SYSTEM},
                {"role": "user", "content": user}]

    models = sys.argv[1:] or CANDIDATES
    print(f"Endpoint: {Config.NIM_BASE_URL}\n")
    results = []
    for m in models:
        print(f"... benchmarking {m}", flush=True)
        res = bench(m, messages)
        # gpt-oss: also try low reasoning effort if the plain call worked
        if m == "openai/gpt-oss-20b" and res["ok"]:
            res_low = bench(m, messages, extra={"reasoning_effort": "low"})
            res_low["model"] = m + " (reasoning_effort=low)"
            results.append(res_low)
        results.append(res)
        if res["ok"]:
            print(f"    -> {res['seconds']}s score={res.get('score')} tokens={res.get('completion_tokens')}", flush=True)
        else:
            print(f"    -> FAIL {res['error']}", flush=True)
    print("\n=== Results (real ATS prompt, candidate_01_cv.pdf) ===")
    for r in sorted(results, key=lambda x: x.get("seconds", 9999)):
        if r["ok"]:
            print(f"{r['seconds']:>7.1f}s  {r['model']}  score={r.get('score')} tokens={r.get('completion_tokens')}")
        else:
            print(f"{r.get('seconds', 0):>7.1f}s  {r['model']}  FAIL: {r['error']}")


if __name__ == "__main__":
    main()
