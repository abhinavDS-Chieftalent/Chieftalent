"""Build a scratch copy of ChiefTalent with FAKE data for UI/regression tests.

    python scripts/ui_scratch.py --seed-only     build + seed, print fixtures JSON
    python scripts/ui_scratch.py --serve         build + seed + run Flask on :5055

Safety: nothing here reads or writes the real data/ directory. The scratch copy has
its own empty database, SMTP switched off (emails go to the scratch outbox), and an
unreachable AI endpoint (so no real model call can happen).
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
SCRATCH = Path(os.environ.get("TEMP", "/tmp")) / "chieftalent-scratch"
PORT = 5055
ROLE = "net_development_intern"
LONG = "Maximiliano" + "x" * 59  # 70 chars, no spaces


def build():
    assert "chieftalent-scratch" in str(SCRATCH)
    if SCRATCH.exists():
        shutil.rmtree(SCRATCH)
    SCRATCH.mkdir(parents=True)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
    shutil.copytree(PROJECT / "app", SCRATCH / "app", ignore=ignore)
    shutil.copytree(PROJECT / "scripts", SCRATCH / "scripts", ignore=ignore)
    for f in ("run.py", "requirements.txt"):
        shutil.copy2(PROJECT / f, SCRATCH / f)
    (SCRATCH / "data" / "job_postings").mkdir(parents=True)
    (SCRATCH / "jobs" / ROLE).mkdir(parents=True)
    shutil.copy2(PROJECT / "data" / "job_postings" / f"{ROLE}.json",
                 SCRATCH / "data" / "job_postings" / f"{ROLE}.json")
    (SCRATCH / ".env").write_text(
        "\n".join([
            "NIM_BASE_URL=http://127.0.0.1:9/v1", "NIM_API_KEY=", "NIM_MODEL=scratch-model",
            "ATS_THRESHOLD=70", "SMTP_HOST=", "SMTP_PORT=587", "SMTP_USERNAME=", "SMTP_PASSWORD=",
            "SMTP_FROM=", "SMTP_USE_TLS=true", "HOST=127.0.0.1", f"PORT={PORT}",
            f"BASE_URL=http://localhost:{PORT}", "SECRET_KEY=scratch-secret", "ADMIN_KEY=",
            "HR_TIME_GRACE_SECONDS=15", "OBJECTIVE_WEIGHT=0.4", "SPOKEN_WEIGHT=0.6",
            "PASS_THRESHOLD=70", "BORDERLINE_THRESHOLD=50", "",
        ]),
        encoding="utf-8",
    )


QSET = {
    "title": ".NET Development Intern - Screening Interview",
    "experience_level": "student",
    "questions": [
        {"id": "intro_self", "type": "spoken", "text": "Tell me about yourself in brief.",
         "time_limit": 300, "require_camera": True, "require_mic": True,
         "guidance": "Introduce your background, education, work experience and key skills."},
        {"id": "mcq1", "type": "mcq", "source": "jd", "text": "Which HTTP method is normally used to create a resource in a REST API?",
         "choices": ["GET", "POST", "DELETE", "HEAD"], "correct_answer": "POST",
         "time_limit": 45, "require_camera": False, "require_mic": False},
        {"id": "mcq2", "type": "mcq", "source": "jd", "text": "What does SQL JOIN do?",
         "choices": ["Combines rows from two tables", "Deletes a table", "Encrypts a column", "Starts a transaction"],
         "correct_answer": "Combines rows from two tables",
         "time_limit": 45, "require_camera": False, "require_mic": False},
        {"id": "mcq3", "type": "mcq", "source": "resume", "text": "In your Library API project, why use dependency injection in ASP.NET Core?",
         "choices": ["To loosen coupling between services", "To compress responses", "To rename routes", "To skip testing"],
         "correct_answer": "To loosen coupling between services",
         "time_limit": 45, "require_camera": False, "require_mic": False},
    ],
}


def seed():
    sys.path.insert(0, str(SCRATCH))
    os.chdir(SCRATCH)
    from app import create_app, db  # noqa: E402  (scratch copy, not the project)
    from app.config import Config  # noqa: E402
    from app.services import jd_service  # noqa: E402
    assert Path(Config.DB_PATH).is_relative_to(SCRATCH), "scratch must not use the real DB"

    create_app()  # init_db + seed demo users
    posting = json.loads((SCRATCH / "data" / "job_postings" / f"{ROLE}.json").read_text(encoding="utf-8"))
    pdf = SCRATCH / "data" / "job_postings" / f"{ROLE}.pdf"
    jd_service.generate_jd_pdf(posting, ROLE, pdf)
    db.execute(
        "INSERT INTO jobs (role,title,source,jd_raw_text,jd_structured,jd_pdf_path,created_at) VALUES (?,?,?,?,?,?,?)",
        (ROLE, posting["title"], "raw_text", "", json.dumps(posting), str(pdf), db.now_iso()),
    )

    def cv_file(name):
        from reportlab.pdfgen import canvas
        p = SCRATCH / "jobs" / ROLE / f"{name}.pdf"
        c = canvas.Canvas(str(p)); c.drawString(72, 750, f"Sample CV for {name[:40]}"); c.save()
        return str(p)

    ats = lambda score, matched, missing: json.dumps({  # noqa: E731
        "candidate_name": "", "email": "", "overall_score": score,
        "matched_requirements": matched, "missing_requirements": missing,
        "relevant_experience": ["Final-year project: REST API in ASP.NET Core"],
        "reasoning": "Solid junior profile with evidenced C# and SQL work; limited deployment experience.",
    })

    def candidate(key, name, email, status, score, token=None):
        fname = f"{key}.pdf"
        cid = db.execute(
            """INSERT INTO candidates (name,email,role,cv_path,cv_filename,cv_text,ats_score,ats_result,status,
               interview_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (name, email, ROLE, cv_file(key), fname, "Sample CV text. C#, SQL, REST APIs.", score,
             ats(score, ["C# and OOP", "SQL and relational databases", "REST APIs"], ["Docker or deployment exposure"]),
             status, token, db.now_iso(), db.now_iso()),
        )
        return cid

    def interview(cid, token, status="not_started", details=0, guidelines=0, verified=False,
                  code=None, index=0, aborted=0):
        iid = db.execute(
            """INSERT INTO interviews (candidate_id,token,role,status,current_index,question_set,
               details_done,guidelines_done,aborted,abort_reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (cid, token, ROLE, status, index, json.dumps(QSET), details, guidelines, aborted,
             "Interview terminated: browser tab was switched too many times." if aborted else "", db.now_iso()),
        )
        if verified or code:
            db.execute(
                "INSERT INTO interview_verifications (interview_id,code,expires_at,verified_at,last_sent_at,created_at) VALUES (?,?,?,?,?,?)",
                # last_sent_at is far in the past so the 55-second resend cooldown never blocks a test
                (iid, code or "000000", "2099-01-01T00:00:00+00:00", db.now_iso() if verified else None, "2020-01-01T00:00:00+00:00", db.now_iso()),
            )
        return iid

    def details_row(iid):
        db.execute(
            """INSERT INTO candidate_details (interview_id,first_name,last_name,current_city,hometown,current_company,
               total_experience,notice_period,current_ctc,expected_ctc,family_members,earning_members,skills_description,submitted_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (iid, "Isha", "Verma", "Jaipur", "Kota", "", "0", "0", "0", "300000", "4", "1",
             "Sample skills description. " * 14, db.now_iso()),
        )

    fx = {"tokens": {}, "candidate_ids": {}, "creds": {
        "admin": ["yash@dotstark.com", "Yash@1234"], "recruiter": ["recruiter@dotstark.com", "Recruit@1234"]}}

    # ATS-rejected, no interview
    fx["candidate_ids"]["rejected"] = candidate("rejected_cv", "Kabir Anand", "kabir.anand@example.com", "rejected", 41.0)
    # shortlisted with link, not opened
    t = "tok_shortlisted"; cid = candidate("shortlisted_cv", "Meera Iyer", "meera.iyer@example.com", "interview_sent", 78.0, t)
    interview(cid, t); fx["tokens"]["shortlisted"] = t; fx["candidate_ids"]["shortlisted"] = cid
    # phases
    t = "tok_verify"; cid = candidate("verify_cv", "Isha Verma", "isha.verma@example.com", "interview_sent", 74.0, t)
    interview(cid, t, code="123456"); fx["tokens"]["verify"] = t; fx["candidate_ids"]["verify"] = cid
    t = "tok_details"; cid = candidate("details_cv", "Rohan Sethi", "rohan.sethi@example.com", "interview_sent", 72.0, t)
    interview(cid, t, verified=True); fx["tokens"]["details"] = t
    t = "tok_guidelines"; cid = candidate("guidelines_cv", "Tanvi Joshi", "tanvi.joshi@example.com", "interview_sent", 76.0, t)
    iid = interview(cid, t, details=1, verified=True); details_row(iid); fx["tokens"]["guidelines"] = t
    t = "tok_interview"; cid = candidate("interview_cv", "Arjun Rawat", "arjun.rawat@example.com", "interview_sent", 80.0, t)
    iid = interview(cid, t, details=1, guidelines=1, verified=True); details_row(iid); fx["tokens"]["interview"] = t
    fx["candidate_ids"]["interview"] = cid
    t = "tok_aborted"; cid = candidate("aborted_cv", "Nisha Bhatt", "nisha.bhatt@example.com", "interview_aborted", 73.0, t)
    iid = interview(cid, t, status="aborted", details=1, guidelines=1, verified=True, aborted=1); details_row(iid)
    fx["tokens"]["aborted"] = t; fx["candidate_ids"]["aborted"] = cid
    # long name + email edge case
    t = "tok_long"; cid = candidate("long_cv", LONG, f"{LONG}@example-company-with-a-long-domain.com", "interview_sent", 71.0, t)
    interview(cid, t); fx["tokens"]["long"] = t; fx["candidate_ids"]["long"] = cid
    # evaluated, with answers + evaluation
    t = "tok_completed"; cid = candidate("evaluated_cv", "Aarav Mehta", "aarav.mehta@example.com", "evaluation_completed", 78.0, t)
    iid = interview(cid, t, status="evaluation_completed", details=1, guidelines=1, verified=True, index=4); details_row(iid)
    rec = SCRATCH / "data" / "recordings" / t; rec.mkdir(parents=True)
    vid = rec / "q1_video.webm"; vid.write_bytes(b"\x1a\x45\xdf\xa3" + b"\x00" * 512)
    rows = [
        ("intro_self", 0, QSET["questions"][0]["text"], "spoken", 300, 212.0, "I built a REST API in ASP.NET Core with SQL Server for my final-year project.", "", None, str(vid)),
        ("mcq1", 1, QSET["questions"][1]["text"], "mcq", 45, 12.0, "POST", "POST", 1, ""),
        ("mcq2", 2, QSET["questions"][2]["text"], "mcq", 45, 20.0, "Deletes a table", "Combines rows from two tables", 0, ""),
        ("mcq3", 3, QSET["questions"][3]["text"], "mcq", 45, 18.0, "To loosen coupling between services", "To loosen coupling between services", 1, ""),
    ]
    for qid, idx, text, qtype, limit, used, ans, corr, ok, video in rows:
        db.execute(
            """INSERT INTO answers (interview_id,question_id,question_index,question_text,question_type,time_limit,
               question_started_at,time_used,answer_text,correct_answer,is_correct,transcript,video_path,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (iid, qid, idx, text, qtype, limit, db.now_iso(), used, ans, corr, ok,
             ans if qtype == "spoken" else "", video, db.now_iso()),
        )
    result = {
        "objective_questions": {"total": 3, "correct": 2, "accuracy": 66.7},
        "spoken_questions": {"count": 1, "average_score": 7.5},
        "overall_interview_score": 71.0, "recommendation": "recommend_progress",
        "summary": "Clear, relevant introduction with concrete project evidence. One SQL gap.",
        "strengths": ["Concrete project evidence", "Clear structure"], "weaknesses": ["SQL JOIN basics"],
        "question_analysis": [{"question_id": "intro_self", "content_score": 7, "relevance_score": 8,
                               "communication_score": 8, "completeness_score": 7, "overall_score": 7.5,
                               "feedback": "Relevant and concise."}],
        "final_status": "review_required",
    }
    db.execute(
        """INSERT INTO evaluations (interview_id,result_json,objective_total,objective_correct,objective_accuracy,
           spoken_avg,overall_score,recommendation,created_at) VALUES (?,?,?,?,?,?,?,?,?)""",
        (iid, json.dumps(result), 3, 2, 66.7, 7.5, 71.0, "recommend_progress", db.now_iso()),
    )
    fx["tokens"]["completed"] = t; fx["candidate_ids"]["evaluated"] = cid

    (SCRATCH / "fixtures.json").write_text(json.dumps(fx, indent=2), encoding="utf-8")
    return fx


if __name__ == "__main__":
    build()
    fixtures = seed()
    print(json.dumps(fixtures, indent=2))
    if "--serve" in sys.argv:
        subprocess.run([sys.executable, "run.py"], cwd=SCRATCH)
