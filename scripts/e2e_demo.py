"""End-to-end Phase 0 demo: walks a shortlisted candidate through the whole
interview over HTTP (answers, recordings, transcripts) and waits for the AI
evaluation. Run with the Flask server already running:

    python scripts/e2e_demo.py
"""

import io
import json
import math
import sqlite3
import struct
import sys
import time
import wave
from pathlib import Path

import requests

BASE = "http://localhost:5000"
DB = Path(__file__).resolve().parent.parent / "data" / "hr_mvp.db"

SPOKEN_ANSWERS = {
    "q3": "A business requirement describes a high-level business need or objective, for example "
          "reducing customer onboarding time by thirty percent. A functional requirement describes "
          "what the system must do to support that business need, such as allowing a user to upload "
          "KYC documents and validating them automatically. I always trace functional requirements "
          "back to the business requirement they serve.",
    "q4": "I would start with a structured elicitation approach: observe the stakeholder's current "
          "process, ask open-ended questions about their goals and pain points, and use techniques "
          "like the five whys. Then I would draft a simple process map or prototype and walk them "
          "through it, because stakeholders react better to something concrete. I would iterate in "
          "short feedback loops and confirm understanding in writing after each session.",
    "q5": "First I would welcome the change but make its impact visible: estimate the cost, effort "
          "and schedule impact and present it to the stakeholder and product owner. Then I would "
          "route the change through the agreed change-control or backlog-refinement process, so it "
          "is prioritised properly instead of disrupting the sprint. Finally I would update the "
          "requirements documentation and acceptance criteria so the whole team stays aligned.",
    "q7": "I would start by documenting the as-is process, ideally with a BPMN process map built "
          "from stakeholder interviews and observation. Then I would measure it: cycle time, error "
          "rates, hand-offs and rework. Against that baseline I would identify bottlenecks and "
          "redundant steps, quantify the improvement opportunities, and propose a to-be process "
          "with clear benefits, then validate it with the stakeholders before implementation.",
}


def make_wav(seconds=1.5, freq=440.0, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = b"".join(
            struct.pack("<h", int(8000 * math.sin(2 * math.pi * freq * i / rate)))
            for i in range(int(rate * seconds))
        )
        w.writeframes(frames)
    return buf.getvalue()


FAKE_WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 256  # EBML magic + padding (test artifact)


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cand = conn.execute(
        "SELECT * FROM candidates WHERE status IN ('interview_sent','shortlisted') "
        "AND interview_token IS NOT NULL ORDER BY ats_score DESC LIMIT 1"
    ).fetchone()
    if not cand:
        print("No shortlisted candidate with an interview token. Run the pipeline first.")
        sys.exit(1)
    token = cand["interview_token"]
    print(f"Candidate: {cand['name']} (ATS {cand['ats_score']}) token={token[:8]}...")

    # The interview page itself must render for the candidate.
    page = requests.get(f"{BASE}/interview/{token}", timeout=15)
    assert page.status_code == 200, f"interview page returned {page.status_code}"
    print(f"Interview page OK ({len(page.text)} bytes)")

    while True:
        state = requests.get(f"{BASE}/api/interview/{token}/state", timeout=15).json()
        if state.get("status") == "completed":
            break
        q = state["question"]
        idx = state["index"]
        print(f"Q{idx + 1}/{state['total']} [{q['type']}] {q['text'][:60]}... "
              f"(limit {q['time_limit']}s, remaining {state['remaining_seconds']}s)")
        time.sleep(1)  # simulate a human thinking briefly
        data = {"question_index": str(idx)}
        files = {}
        if q["type"] == "yes_no":
            data["answer_text"] = "Yes"
        else:
            text = SPOKEN_ANSWERS.get(q["id"], "I would analyse the situation carefully.")
            data["transcript"] = text
            data["answer_text"] = text
            files["audio"] = (f"q{idx + 1}.wav", make_wav(), "audio/wav")
            if q.get("require_camera"):
                files["video"] = (f"q{idx + 1}.webm", FAKE_WEBM, "video/webm")
        r = requests.post(f"{BASE}/api/interview/{token}/answer", data=data,
                          files=files or None, timeout=30)
        resp = r.json()
        assert r.status_code == 200, f"answer failed: {resp}"
        print(f"   saved (time_used={resp.get('time_used')}s, overtime={resp.get('overtime')})")
        if resp.get("completed"):
            break

    print("Interview completed. Waiting for AI evaluation...")
    final_status = ""
    for _ in range(90):
        row = conn.execute(
            "SELECT status FROM interviews WHERE token=?", (token,)).fetchone()
        final_status = row["status"]
        if final_status == "evaluation_completed":
            break
        time.sleep(2)
    print(f"Interview status: {final_status}")

    ev = conn.execute(
        """SELECT e.* FROM evaluations e
           JOIN interviews i ON i.id = e.interview_id WHERE i.token=?""", (token,)).fetchone()
    if ev:
        result = json.loads(ev["result_json"])
        print(f"Objective: {ev['objective_correct']}/{ev['objective_total']} "
              f"({ev['objective_accuracy']}%)")
        print(f"Spoken avg: {ev['spoken_avg']}/10 | Overall: {ev['overall_score']}/100 "
              f"-> {ev['recommendation']}")
        print(f"Summary: {result.get('summary', '')[:300]}")
    else:
        print("No evaluation row found!")

    # Rejected candidates must have no interview artefacts.
    rejected = conn.execute(
        "SELECT COUNT(*) AS n FROM candidates WHERE status='rejected' "
        "AND interview_token IS NULL").fetchone()
    print(f"Rejected candidates without interview tokens: {rejected['n']}")
    conn.close()


if __name__ == "__main__":
    main()
