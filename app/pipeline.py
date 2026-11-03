"""Pipeline: CV folder -> ATS review -> threshold -> reject or shortlist+email.

Usage:
    python -m app.pipeline --role business_analyst
"""

import argparse
import hashlib
import json

from . import db
from .config import Config, ensure_dirs
from .services import ats_reviewer, cv_parser, email_service, interview_service
from .services.nim_client import NIMClient, NIMError


def process_role(role, nim=None, verbose=True):
    """Process every unprocessed CV in jobs/<role>/. Returns per-CV results."""
    ensure_dirs()
    db.init_db()
    nim = nim or NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    job_posting = interview_service.load_job_posting(role)
    role_dir = Config.JOBS_DIR / role
    role_dir.mkdir(parents=True, exist_ok=True)

    pdfs = sorted(role_dir.glob("*.pdf"))
    results = []
    for pdf in pdfs:
        existing = db.one(
            "SELECT id, status FROM candidates WHERE role=? AND cv_filename=?",
            (role, pdf.name),
        )
        if existing:
            if verbose:
                print(f"[skip] {pdf.name} already processed (status={existing['status']})")
            continue

        if verbose:
            print(f"[cv]   {pdf.name}: parsing...")
        cv_hash = hashlib.sha256(pdf.read_bytes()).hexdigest()
        # Identical content already processed under a different filename?
        # The filename check above only catches same-name re-uploads. This is
        # the authoritative guard against the same resume sneaking in renamed.
        dupe = db.one(
            "SELECT id FROM candidates WHERE role=? AND cv_hash=?",
            (role, cv_hash),
        )
        if dupe:
            if verbose:
                print(f"[skip] {pdf.name} identical to candidate #{dupe['id']}; removing duplicate file")
            try:
                pdf.unlink()  # keep the role folder clean; the original stays
            except OSError:
                pass
            continue
        cv_text = cv_parser.extract_text_from_pdf(pdf)
        candidate_id = db.execute(
            """INSERT INTO candidates (role, cv_path, cv_filename, cv_text, cv_hash, status, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (role, str(pdf), pdf.name, cv_text, cv_hash, "ats_review", db.now_iso(), db.now_iso()),
        )

        try:
            review = ats_reviewer.review_cv(nim, job_posting, cv_text)
        except NIMError as e:
            db.execute(
                "UPDATE candidates SET status='ats_error', ats_result=?, updated_at=? WHERE id=?",
                (json.dumps({"error": str(e)}), db.now_iso(), candidate_id),
            )
            results.append({"cv": pdf.name, "status": "ats_error", "error": str(e)})
            if verbose:
                print(f"[err]  {pdf.name}: ATS review failed: {e}")
            continue

        name = review["candidate_name"] or cv_parser.guess_name(cv_text) or pdf.stem
        email = review["email"] or cv_parser.extract_email(cv_text)
        score = review["overall_score"]
        passed = score >= Config.ATS_THRESHOLD
        status = "shortlisted" if passed else "rejected"

        # Same person, different or edited file: the email already belongs to
        # another candidate for this role. Flag it and hold the interview so HR
        # reviews instead of the candidate getting two links.
        duplicate_of = None
        if email:
            dupe = db.one(
                "SELECT id, name FROM candidates WHERE role=? AND email=? AND id<>? AND email<>''",
                (role, email, candidate_id),
            )
            if dupe:
                duplicate_of = dupe["id"]

        db.execute(
            """UPDATE candidates SET name=?, email=?, ats_score=?, ats_result=?, status=?, duplicate_of=?, updated_at=?
               WHERE id=?""",
            (name, email, score, json.dumps(review), status, duplicate_of, db.now_iso(), candidate_id),
        )
        if verbose:
            print(f"[ats]  {pdf.name}: {name} <{email or 'no-email'}> score={score} -> {status}")

        entry = {"cv": pdf.name, "name": name, "email": email,
                 "score": score, "status": status}
        if duplicate_of:
            entry["duplicate_of"] = duplicate_of
            if verbose:
                print(f"[dupe] {pdf.name}: possible duplicate of candidate #{duplicate_of}; interview held")

        if passed and not duplicate_of:
            # defer_questions: the invite email must go out IMMEDIATELY when
            # the ATS shortlists. Question generation runs in the background
            # (it is re-kicked at OTP-verify and details-submit anyway, and
            # accept_guidelines waits for an in-flight set) - making the
            # candidate wait for a slow AI call before even receiving the
            # link was why interview mails arrived minutes after the OTP.
            token = interview_service.create_interview(candidate_id, role, defer_questions=True)
            interview_url = f"{Config.BASE_URL}/interview/{token}"
            email_ok, email_detail = (False, "no email address in CV")
            if email:
                email_ok, email_detail = email_service.send_interview_email(
                    email, name, job_posting.get("title", role), interview_url)
            db.execute(
                """UPDATE candidates SET status='interview_sent', email_sent_at=?,
                   email_status=?, updated_at=? WHERE id=?""",
                (db.now_iso(), email_detail, db.now_iso(), candidate_id),
            )
            entry.update({"interview_url": interview_url, "email_status": email_detail})
            if verbose:
                print(f"[mail] {pdf.name}: {email_detail} -> {interview_url}")
        # Rejected candidates: workflow stops here. No email, no token, no interview.

        results.append(entry)
    return results


def main():
    parser = argparse.ArgumentParser(description="Process CVs for a job role")
    parser.add_argument("--role", required=True, help="job role folder, e.g. business_analyst")
    args = parser.parse_args()
    results = process_role(args.role)
    print("\n=== Summary ===")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
