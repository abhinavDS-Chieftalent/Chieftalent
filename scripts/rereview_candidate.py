"""Re-run the ATS review for one candidate (fixes names after prompt changes).

    docker compose cp scripts/rereview_candidate.py app:/tmp/r.py
    docker compose exec app sh -c "PYTHONPATH=/app python /tmp/r.py <candidate_id>"
"""
import json
import sys

from app import create_app
from app import db
from app.config import Config
from app.services import ats_reviewer
from app.services.nim_client import NIMClient

app = create_app()
cid = int(sys.argv[1])

with app.app_context():
    c = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not c:
        sys.exit(f"candidate {cid} not found")
    if not c["cv_text"]:
        sys.exit("candidate has no stored cv_text")

    posting_path = Config.DATA_DIR / "job_postings" / f"{c['role']}.json"
    posting = json.loads(posting_path.read_text(encoding="utf-8"))

    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    review = ats_reviewer.review_cv(nim, posting, c["cv_text"])

    old_name = c["name"]
    new_name = review["candidate_name"] or old_name
    db.execute(
        "UPDATE candidates SET name=?, email=?, ats_score=?, ats_result=?, updated_at=? WHERE id=?",
        (new_name, review["email"] or c["email"], review["overall_score"],
         json.dumps(review), db.now_iso(), cid),
    )
    print(f"old name: {old_name!r}")
    print(f"new name: {new_name!r}")
    print(f"email:    {review['email']!r}")
    print(f"score:    {review['overall_score']}")
