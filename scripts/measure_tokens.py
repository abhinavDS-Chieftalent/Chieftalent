"""Measure REAL token usage of every LLM call type in the ChiefTalent workflow.

Runs each of the 4 production call sites with realistic inputs and captures
the exact `usage` block from the API response (prompt_tokens /
completion_tokens). No estimates - these are the numbers the provider bills.

Run inside the container:
    docker compose cp scripts/measure_tokens.py app:/tmp/measure_tokens.py
    docker compose exec app sh -c "PYTHONPATH=/app python /tmp/measure_tokens.py"
"""
import json
import time

import requests

from app import create_app
from app import db
from app.config import Config
from app.services import ats_reviewer, evaluation_service, jd_service, question_generator

app = create_app()

HEADERS = {"Content-Type": "application/json"}
if Config.NIM_API_KEY:
    HEADERS["Authorization"] = f"Bearer {Config.NIM_API_KEY}"


def raw_call(messages, temperature, max_tokens, label):
    """Make the exact request nim_client.chat() makes, but read `usage`."""
    payload = {
        "model": Config.NIM_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }
    t0 = time.time()
    r = requests.post(
        f"{Config.NIM_BASE_URL.rstrip('/')}/chat/completions",
        headers=HEADERS, json=payload, timeout=300,
    )
    dt = time.time() - t0
    r.raise_for_status()
    data = r.json()
    usage = data.get("usage") or {}
    print(f"[{label}] model={data.get('model')} time={dt:.1f}s "
          f"prompt_tokens={usage.get('prompt_tokens')} "
          f"completion_tokens={usage.get('completion_tokens')} "
          f"total_tokens={usage.get('total_tokens')}")
    return usage


with app.app_context():
    posting = json.loads(
        (Config.DATA_DIR / "job_postings" / "business_analyst.json").read_text(encoding="utf-8")
    )
    # A real CV from the business_analyst folder for realistic size.
    from app.services.cv_parser import extract_text_from_pdf
    cv_path = Config.JOBS_DIR / "business_analyst" / "candidate_01_cv.pdf"
    cv_text = extract_text_from_pdf(cv_path)[:6000]
    print(f"sample CV: {cv_path.name}, {len(cv_text)} chars\n")

    # ---- Call 1: JD structuring (AI fallback path only) ----
    messy_jd = (
        "hey we need a ba for our jaipur office, must know sql excel and power bi, "
        "2-4 yrs exp, client handling, good comm skills, salary 6-9 lpa, "
        "send cv to hr@dotstark.com asap, joining soon, thanks"
    )
    msgs = [
        {"role": "system", "content": jd_service.JD_SYSTEM},
        {"role": "user", "content": jd_service.JD_USER_TEMPLATE.format(raw_text=messy_jd[:15000])},
    ]
    u1 = raw_call(msgs, 0.3, 2500, "1. JD structuring (AI fallback, messy input)")

    # ---- Call 2: ATS review of one CV ----
    msgs, _profile = ats_reviewer.build_messages(posting, cv_text)
    u2 = raw_call(msgs, 0.3, 2000, "2. ATS CV review (per CV)")

    # ---- Call 3: question generation (per shortlisted candidate) ----
    msgs = question_generator.build_messages(posting, cv_text)
    u3 = raw_call(msgs, 0.4, 6000, "3. Question generation (per shortlist)")

    # ---- Call 4: spoken-answer evaluation (per completed interview) ----
    spoken = [{
        "question_id": "intro_self",
        "question_text": "Tell me about yourself in brief.",
        "transcript": ("I am a business analyst with four years of experience in "
                       "requirements gathering, SQL analysis and stakeholder management. "
                       "I have a bachelors in commerce and I enjoy turning messy data into decisions."),
        "time_limit": 300, "time_used": 95, "overtime": False,
    }]
    msgs = evaluation_service.build_messages("Business Analyst", spoken)
    u4 = raw_call(msgs, 0.3, 2500, "4. Spoken evaluation (per interview)")

    total_prompt = sum(u.get("prompt_tokens", 0) for u in (u1, u2, u3, u4))
    total_completion = sum(u.get("completion_tokens", 0) for u in (u1, u2, u3, u4))
    print(f"\nWORST-CASE FULL WORKFLOW (all 4 calls): "
          f"prompt={total_prompt} completion={total_completion} "
          f"total={total_prompt + total_completion} tokens")
    print("HAPPY PATH (JD deterministic, no retry): calls 2+3+4 only")
