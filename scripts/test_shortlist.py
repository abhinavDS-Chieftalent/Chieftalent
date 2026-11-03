"""Test the manual-shortlist endpoint end to end (container only)."""
import re

from app import create_app
from app import db

app = create_app()
app.config["TESTING"] = True

with app.app_context():
    import time
    fname = f"shortlist_test_{int(time.time())}.pdf"
    cid = db.execute(
        """INSERT INTO candidates
           (name, email, role, status, ats_score, cv_path, cv_filename, cv_text,
            created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        ("Shortlist Test", "shortlist@test.com", "business_analyst", "rejected", 42.0,
         f"jobs/business_analyst/{fname}", fname, "Business analyst with SQL and Excel skills.",
         db.now_iso(), db.now_iso()),
    )
    print(f"created rejected candidate {cid}")

client = app.test_client()
with client.session_transaction() as s:
    s["user_id"] = 1

r = client.post(f"/api/admin/candidate/{cid}/shortlist")
body = r.get_json() or {}
print("status:", r.status_code)
print("body keys:", sorted(body.keys()))
print("interview_url:", body.get("interview_url", "")[:60])
print("email_status:", body.get("email_status"))

with app.app_context():
    c = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    print("candidate status:", c["status"])
    print("has token:", bool(c["interview_token"]))
    print("review note:", c["review_notes"])
    # the interview state endpoint must serve the details phase for this token
    st = client.get(f"/api/interview/{c['interview_token']}/state")
    print("interview state:", st.status_code, (st.get_json() or {}).get("phase"))

    # idempotence: calling again returns the same link, no duplicate interview
    r2 = client.post(f"/api/admin/candidate/{cid}/shortlist")
    b2 = r2.get_json() or {}
    print("second call:", r2.status_code, "already:", b2.get("already_shortlisted"),
          "same url:", b2.get("interview_url") == body.get("interview_url"))

    # cleanup test candidate
    db.execute("DELETE FROM candidate_details WHERE interview_id IN "
               "(SELECT id FROM interviews WHERE candidate_id=?)", (cid,))
    db.execute("DELETE FROM answers WHERE interview_id IN "
               "(SELECT id FROM interviews WHERE candidate_id=?)", (cid,))
    db.execute("DELETE FROM evaluations WHERE interview_id IN "
               "(SELECT id FROM interviews WHERE candidate_id=?)", (cid,))
    db.execute("DELETE FROM interviews WHERE candidate_id=?", (cid,))
    db.execute("DELETE FROM candidates WHERE id=?", (cid,))
    print("cleaned up test candidate")
