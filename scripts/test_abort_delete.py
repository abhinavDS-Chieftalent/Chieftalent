"""Reproduce: can a candidate with an ABORTED interview be deleted?"""
from app import create_app
from app import db

app = create_app()
app.config["TESTING"] = True

with app.app_context():
    cols = [r["name"] for r in db.all("PRAGMA table_info(candidates)")]
    print("candidate cols:", cols)
    import time
    fname = f"abort_cv_{int(time.time())}.pdf"
    cid = db.execute(
        """INSERT INTO candidates
           (name, email, role, status, cv_path, cv_filename, cv_text, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        ("Abort Test", "abort@test.com", "business_analyst", "interview_aborted",
         f"jobs/business_analyst/{fname}", fname, "text",
         db.now_iso(), db.now_iso()),
    )
    iid = db.execute(
        """INSERT INTO interviews
           (candidate_id, role, token, status, deadline_at, started_at, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (cid, "business_analyst", f"abort_tok_{int(time.time())}", "aborted",
         db.now_iso(), db.now_iso(), db.now_iso()),
    )
    db.execute(
        """INSERT INTO answers
           (interview_id, question_id, question_index, question_text, question_type,
            time_limit, question_started_at, time_used, answer_text, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (iid, "intro_self", 0, "Tell me about yourself.", "spoken",
         300, db.now_iso(), 10, "hello", db.now_iso()),
    )
    print(f"created candidate {cid} with aborted interview {iid}")

client = app.test_client()
with client.session_transaction() as s:
    s["user_id"] = 1
r = client.delete(f"/api/admin/candidate/{cid}")
print("DELETE status:", r.status_code, "body:", r.get_json())
with app.app_context():
    print("candidate gone:", db.one("SELECT * FROM candidates WHERE id=?", (cid,)) is None)
    print("interview gone:", db.one("SELECT * FROM interviews WHERE id=?", (iid,)) is None)
