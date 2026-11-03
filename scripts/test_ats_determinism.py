"""Verify ATS determinism: same CV + same posting screened twice must
return the identical score (second run served from ats_cache)."""
import json

from app import create_app
from app import db
from app.config import Config
from app.services import ats_reviewer
from app.services.nim_client import NIMClient

app = create_app()

with app.app_context():
    c = db.one(
        "SELECT cv_text, role FROM candidates WHERE name LIKE 'Ajay%' ORDER BY id DESC LIMIT 1"
    )
    posting = json.load(open(f"/app/data/job_postings/{c['role']}.json"))
    cv_text = c["cv_text"]
    print(f"candidate role: {c['role']}, cv chars: {len(cv_text)}")

    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)

    print("run 1 (LLM, temperature 0)...")
    r1 = ats_reviewer.review_cv(nim, posting, cv_text)
    print("  score:", r1["overall_score"], "| cached:", r1.get("cached"))

    print("run 2 (same input)...")
    r2 = ats_reviewer.review_cv(nim, posting, cv_text)
    print("  score:", r2["overall_score"], "| cached:", r2.get("cached"))

    print("run 3 (same input again)...")
    r3 = ats_reviewer.review_cv(nim, posting, cv_text)
    print("  score:", r3["overall_score"], "| cached:", r3.get("cached"))

    same = r1["overall_score"] == r2["overall_score"] == r3["overall_score"]
    print("DETERMINISTIC:", same)
    assert same, "scores diverged!"
    assert r2.get("cached") and r3.get("cached"), "cache not used!"
    print("PASS")
