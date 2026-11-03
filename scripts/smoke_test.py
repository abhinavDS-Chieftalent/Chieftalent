"""End-to-end smoke test of the new backend flow, run inside the container:

    docker compose exec app python /app/scripts/smoke_test.py

Exercises, via the Flask test client (no HTTP, no auth):
  1. JD creation from raw text (deterministic parser path)
  2. Jobs listing + role sync
  3. Interview state machine: details -> guidelines -> interview
  4. Tab-warning proctoring (3 strikes -> abort)
  5. MCQ answer scoring

Prints PASS/FAIL per step; exits non-zero on any failure.
"""
import json
import secrets
import sys

from app import create_app
from app import db as database
from app.services import jd_service, interview_service

PASS, FAIL = "PASS", "FAIL"
results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"[{PASS if ok else FAIL}] {name}" + (f" - {detail}" if detail else ""))


app = create_app()
client = app.test_client()

RAW_JD = """Job Description: Senior Python Developer

Position Overview
We are looking for an experienced Python developer to build backend services
and data pipelines for our HR products.

Key Responsibilities
- Design and build REST APIs in Python (Django/FastAPI)
- Own PostgreSQL schema design and query performance
- Review code and mentor junior engineers

Qualifications
- 5+ years of Python experience in production systems
- Strong Django or FastAPI background
- Solid understanding of SQL and data modeling

Preferred Skills (Good to Have)
- Docker and CI/CD experience
- Experience with LLM APIs

Location: Jaipur
Experience: 5-8 Years
"""

# ---- 1. JD creation (deterministic path) ----
with app.app_context():
    from app.services.nim_client import NIMClient
    from app.config import Config
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    try:
        job = jd_service.create_job_from_raw_text(nim, RAW_JD)
        check("jd.create_job_from_raw_text", bool(job.get("role")),
              f"role={job.get('role')} title={job.get('title')}")
        structured = json.loads(job["jd_structured"])
        check("jd.deterministic_path", structured.get("structured_by") == "deterministic",
              f"structured_by={structured.get('structured_by')}")
        import os
        check("jd.pdf_generated",
              "job_postings" in (job.get("jd_pdf_path") or "") and os.path.exists(job["jd_pdf_path"]),
              job.get("jd_pdf_path", ""))
        role = job["role"]
    except Exception as e:
        check("jd.create_job_from_raw_text", False, repr(e))
        sys.exit(1)

# ---- 2. Jobs listing ----
with app.app_context():
    jobs = jd_service.list_jobs()
    roles = [j["role"] for j in jobs]
    check("jd.list_jobs_contains_new_role", role in roles, f"roles={roles}")

resp = client.get("/api/admin/jobs")
# 401 expected without a session - proves route is registered + protected
check("jd.jobs_route_protected", resp.status_code == 401, f"status={resp.status_code}")

# ---- 3. Interview state machine ----
with app.app_context():
    conn = database.get_db()
    conn.execute(
        "INSERT INTO candidates (role, cv_filename, cv_path, status, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (role, "smoke_test_cv.pdf", "jobs/smoke/test.pdf", "shortlisted", "smoke1@test.com", database.now_iso(), database.now_iso()),
    )
    conn.commit()
    cand_id = conn.execute(
        "SELECT id FROM candidates WHERE cv_filename='smoke_test_cv.pdf' ORDER BY id DESC LIMIT 1"
    ).fetchone()["id"]
    # Insert the interview row directly (no NIM call - keeps the smoke test
    # fast and deterministic) and inject a known question set.
    token = secrets.token_urlsafe(24)
    conn.execute(
        "INSERT INTO interviews (candidate_id, token, role, status, current_index, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (cand_id, token, role, "not_started", 0, database.now_iso()),
    )
    conn.execute("UPDATE candidates SET interview_token=? WHERE id=?", (token, cand_id))
    qset = {
        "questions": [
            {"id": "q1", "type": "spoken", "text": "Tell me about yourself.",
             "time_limit": 300, "require_camera": True,
             "guidance": "Cover your background, experience, and why this role."},
            {"id": "q2", "type": "mcq", "text": "What is the output of print(type([])) in Python?",
             "time_limit": 45, "choices": ["<class 'list'>", "<class 'dict'>", "<class 'tuple'>", "Error"],
             "correct_answer": "<class 'list'>"},
        ]
    }
    conn.execute(
        "UPDATE interviews SET question_set=? WHERE token=?",
        (json.dumps(qset), token),
    )
    conn.commit()
    conn.close()

check("interview.token_created", bool(token), f"token={token}")

# state: should be 'verify' phase first (resume-email ownership gate)
resp = client.get(f"/api/interview/{token}/state")
state = resp.get_json()
check("verify.phase_verify", resp.status_code == 200 and state.get("phase") == "verify",
      f"phase={state.get('phase')}")
check("verify.masked_email", state.get("masked_email") == "s***@test.com",
      f"masked={state.get('masked_email')}")

# details must be blocked before verification
resp = client.post(f"/api/interview/{token}/details", json={})
check("verify.details_blocked", resp.status_code in (400, 403), f"status={resp.status_code}")

# request a code (goes to the outbox - no SMTP in the container)
resp = client.post(f"/api/interview/{token}/verify/request")
check("verify.request_ok", resp.status_code == 200, f"status={resp.status_code} body={resp.get_json()}")

# immediate resend must be rate-limited
resp = client.post(f"/api/interview/{token}/verify/request")
check("verify.resend_rate_limited", resp.status_code == 429, f"status={resp.status_code}")

with app.app_context():
    conn = database.get_db()
    vrow = conn.execute(
        "SELECT code FROM interview_verifications WHERE interview_id=(SELECT id FROM interviews WHERE token=?)",
        (token,),
    ).fetchone()
    code = vrow["code"] if vrow else None
    conn.close()
check("verify.code_stored", bool(code and len(code) == 6), f"code={'set' if code else 'missing'}")

# wrong code rejected, right code accepted
resp = client.post(f"/api/interview/{token}/verify/confirm", json={"code": "000000" if code != "000000" else "111111"})
check("verify.wrong_code_rejected", resp.status_code == 400, f"status={resp.status_code}")
resp = client.post(f"/api/interview/{token}/verify/confirm", json={"code": code})
check("verify.confirm_ok", resp.status_code == 200, f"status={resp.status_code} body={resp.get_json()}")

# state: should now be 'details' phase
resp = client.get(f"/api/interview/{token}/state")
state = resp.get_json()
check("interview.phase_details", resp.status_code == 200 and state.get("phase") == "details",
      f"phase={state.get('phase')}")

# submit details
details = {
    "first_name": "Smoke", "last_name": "Test", "current_city": "Jaipur", "hometown": "Jaipur",
    "current_company": "TestCorp", "total_experience": "6", "notice_period": "30",
    "current_ctc": "1200000", "expected_ctc": "1500000", "family_members": "4",
    "earning_members": "2",
    "skills_description": (
        "Personal: I stay calm under deadline pressure and communicate clearly with teammates. "
        "Technical: I build REST APIs with Python/Django, and I have shipped React frontends "
        "to production. Analytical: I break complex requirements into small, testable pieces "
        "and track them to completion, which helped my team ship on schedule every sprint."
    ),
}
# details validation: text in a numeric field and a too-short skills answer
# must be rejected (run BEFORE the good payload - once details are saved the
# endpoint short-circuits with "already").
bad = dict(details, notice_period="immediate")
resp = client.post(f"/api/interview/{token}/details", json=bad)
check("interview.details_rejects_text_notice", resp.status_code == 400, f"status={resp.status_code}")
bad2 = dict(details, skills_description="too short")
resp = client.post(f"/api/interview/{token}/details", json=bad2)
check("interview.details_rejects_short_skills", resp.status_code == 400, f"status={resp.status_code}")

resp = client.post(f"/api/interview/{token}/details", json=details)
check("interview.details_accepted", resp.status_code == 200, f"status={resp.status_code} body={resp.get_json()}")

# state: should now be 'guidelines'
state = client.get(f"/api/interview/{token}/state").get_json()
check("interview.phase_guidelines", state.get("phase") == "guidelines", f"phase={state.get('phase')}")

# accept guidelines
resp = client.post(f"/api/interview/{token}/guidelines")
check("interview.guidelines_accepted", resp.status_code == 200, f"status={resp.status_code}")

# state: should now be 'interview' with deadline
state = client.get(f"/api/interview/{token}/state").get_json()
check("interview.phase_interview", state.get("phase") == "interview", f"phase={state.get('phase')}")
check("interview.deadline_set", 0 < (state.get("deadline_seconds") or 0) <= 1800,
      f"deadline_seconds={state.get('deadline_seconds')}")
check("interview.first_question", (state.get("question") or {}).get("id") == "q1",
      f"question={state.get('question')}")

# ---- 4. Tab warnings: 3 strikes -> abort ----
w1 = client.post(f"/api/interview/{token}/tab-warning").get_json()
w2 = client.post(f"/api/interview/{token}/tab-warning").get_json()
w3 = client.post(f"/api/interview/{token}/tab-warning").get_json()
check("proctoring.warning_counts", w1.get("warnings") == 1 and w2.get("warnings") == 2,
      f"{w1.get('warnings')},{w2.get('warnings')}")
check("proctoring.aborted_on_third", w3.get("aborted") is True and w3.get("warnings") == 3,
      f"warnings={w3.get('warnings')} aborted={w3.get('aborted')}")
state = client.get(f"/api/interview/{token}/state").get_json()
check("proctoring.state_aborted", state.get("phase") == "aborted", f"phase={state.get('phase')}")

# ---- 5. MCQ scoring (fresh interview) ----
with app.app_context():
    conn = database.get_db()
    conn.execute(
        "INSERT INTO candidates (role, cv_filename, cv_path, status, email, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
        (role, "smoke_test_cv2.pdf", "jobs/smoke/test2.pdf", "shortlisted", "smoke2@test.com", database.now_iso(), database.now_iso()),
    )
    conn.commit()
    cand2 = conn.execute(
        "SELECT id FROM candidates WHERE cv_filename='smoke_test_cv2.pdf' ORDER BY id DESC LIMIT 1"
    ).fetchone()["id"]
    token2 = secrets.token_urlsafe(24)
    conn.execute(
        "INSERT INTO interviews (candidate_id, token, role, status, current_index, created_at) "
        "VALUES (?,?,?,?,?,?)",
        (cand2, token2, role, "not_started", 0, database.now_iso()),
    )
    conn.execute("UPDATE candidates SET interview_token=? WHERE id=?", (token2, cand2))
    conn.execute(
        "UPDATE interviews SET question_set=? WHERE token=?",
        (json.dumps(qset), token2),
    )
    conn.commit()
    conn.close()

client.post(f"/api/interview/{token2}/verify/request")
with app.app_context():
    conn = database.get_db()
    vrow2 = conn.execute(
        "SELECT code FROM interview_verifications WHERE interview_id=(SELECT id FROM interviews WHERE token=?)",
        (token2,),
    ).fetchone()
    code2 = vrow2["code"] if vrow2 else None
    conn.close()
resp = client.post(f"/api/interview/{token2}/verify/confirm", json={"code": code2})
check("mcq.verified", resp.status_code == 200, f"status={resp.status_code}")
client.post(f"/api/interview/{token2}/details", json=details)
client.post(f"/api/interview/{token2}/guidelines")
state = client.get(f"/api/interview/{token2}/state").get_json()
check("mcq.interview_started", state.get("phase") == "interview", f"phase={state.get('phase')}")

# answer q1 (spoken) with transcript only
resp = client.post(f"/api/interview/{token2}/answer", data={
    "question_index": "0", "answer_text": "I am a Python developer with six years of experience.",
    "transcript": "I am a Python developer with six years of experience.",
})
check("mcq.spoken_answer_saved", resp.status_code == 200, f"status={resp.status_code}")

# answer q2 (mcq) - correct choice
state = client.get(f"/api/interview/{token2}/state").get_json()
check("mcq.second_question", (state.get("question") or {}).get("type") == "mcq",
      f"question_type={(state.get('question') or {}).get('type')}")
resp = client.post(f"/api/interview/{token2}/answer", data={
    "question_index": "1", "answer_text": "<class 'list'>",
})
check("mcq.answer_saved", resp.status_code == 200, f"status={resp.status_code}")

with app.app_context():
    conn = database.get_db()
    ans = conn.execute(
        "SELECT is_correct FROM answers WHERE interview_id=("
        "SELECT id FROM interviews WHERE token=?) AND question_id='q2'", (token2,)
    ).fetchone()
    check("mcq.scored_correct", ans is not None and ans["is_correct"] == 1,
          f"is_correct={ans['is_correct'] if ans else None}")
    conn.close()

# ---- 6. Admin deletion flows (regression) ----
# 6a. Candidate who filled the details form (candidate_details FK) must be
#     deletable - this regressed when FK enforcement exposed a missing
#     DELETE FROM candidate_details in the route.
with client.session_transaction() as s:
    s["user_id"] = 1  # seeded admin
resp = client.delete(f"/api/admin/candidate/{cand2}")
ok = resp.status_code == 200
with app.app_context():
    gone = database.one("SELECT id FROM candidates WHERE id=?", (cand2,)) is None
    details_gone = database.one(
        "SELECT id FROM candidate_details WHERE interview_id="
        "(SELECT id FROM interviews WHERE candidate_id=?)", (cand2,)
    ) is None
check("delete.candidate_with_details", ok and gone and details_gone,
      f"status={resp.status_code} gone={gone} details_gone={details_gone}")

# 6b. Deleting a JOB must keep its candidates (only the role definition goes).
with app.app_context():
    conn = database.get_db()
    conn.execute(
        "INSERT INTO jobs (role, title, source, jd_raw_text, jd_structured, jd_pdf_path, created_at) "
        "VALUES ('smoke_test_role_x', 'Smoke Test Role', 'test', '', '', '', ?)",
        (database.now_iso(),),
    )
    conn.execute(
        "INSERT INTO candidates (name, email, role, status, cv_path, cv_filename, cv_text, created_at, updated_at) "
        "VALUES ('Smoke Job Del', 'smokejobdel@test.com', 'smoke_test_role_x', 'ats_review', "
        "'jobs/smoke_test_role_x/x.pdf', 'smoke_test_cv_jobdel.pdf', 'x', ?, ?)",
        (database.now_iso(), database.now_iso()),
    )
    conn.commit()
    conn.close()
resp = client.delete("/api/admin/job/smoke_test_role_x")
body = resp.get_json() or {}
with app.app_context():
    job_gone = database.one("SELECT role FROM jobs WHERE role='smoke_test_role_x'") is None
    cand_kept = database.one(
        "SELECT id FROM candidates WHERE cv_filename='smoke_test_cv_jobdel.pdf'"
    ) is not None
check("delete.job_keeps_candidates",
      resp.status_code == 200 and job_gone and cand_kept and body.get("candidates_kept") == 1,
      f"status={resp.status_code} job_gone={job_gone} cand_kept={cand_kept}")

# ---- cleanup smoke-test data ----
with app.app_context():
    conn = database.get_db()
    conn.execute("DELETE FROM candidate_details WHERE interview_id IN "
                 "(SELECT id FROM interviews WHERE candidate_id IN "
                 "(SELECT id FROM candidates WHERE cv_filename LIKE 'smoke_test_cv%'))")
    conn.execute("DELETE FROM interview_verifications WHERE interview_id IN "
                 "(SELECT id FROM interviews WHERE candidate_id IN "
                 "(SELECT id FROM candidates WHERE cv_filename LIKE 'smoke_test_cv%'))")
    conn.execute("DELETE FROM answers WHERE interview_id IN "
                 "(SELECT id FROM interviews WHERE candidate_id IN "
                 "(SELECT id FROM candidates WHERE cv_filename LIKE 'smoke_test_cv%'))")
    conn.execute("DELETE FROM interviews WHERE candidate_id IN "
                 "(SELECT id FROM candidates WHERE cv_filename LIKE 'smoke_test_cv%')")
    conn.execute("DELETE FROM candidates WHERE cv_filename LIKE 'smoke_test_cv%'")
    conn.commit()
    conn.close()
print("\nCleanup done.")

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    sys.exit(1)
print("ALL CHECKS PASSED")
