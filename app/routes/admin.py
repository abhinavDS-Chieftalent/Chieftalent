"""HR admin: JSON API for the React SPA, file serving, and SPA page hosting.

Separated from candidate-facing interview routes. If ADMIN_KEY is configured,
every /admin and /api/admin request requires ?key=<ADMIN_KEY> or X-Admin-Key.
"""

import hashlib
import json
import threading
from pathlib import Path

from flask import Blueprint, abort, jsonify, request, send_file
from werkzeug.utils import secure_filename

from .. import db
from ..config import Config
from ..errors import NotFoundError, ValidationError
from ..pipeline import process_role
from ..services import email_service, evaluation_service, interview_service, jd_service
from ..services.auth_service import admin_required, login_required
from ..services.nim_client import NIMClient, public_error

bp = Blueprint("admin", __name__)

_PROCESSING = set()
_PROCESSING_LOCK = threading.Lock()


@bp.before_request
def _check_admin_key():
    if Config.ADMIN_KEY:
        key = request.args.get("key") or request.headers.get("X-Admin-Key", "")
        if key != Config.ADMIN_KEY:
            abort(403)


def _spa_index():
    path = Config.BASE_DIR / "app" / "static" / "spa" / "index.html"
    if not path.exists():
        return ("Frontend not built yet. Run: cd frontend && npm install && npm run build", 503)
    return send_file(path)


def _start_processing(role):
    """Run the pipeline for a role in the background; one run per role at a time."""
    with _PROCESSING_LOCK:
        if role in _PROCESSING:
            return False
        _PROCESSING.add(role)

    def run():
        try:
            process_role(role, verbose=True)
        finally:
            with _PROCESSING_LOCK:
                _PROCESSING.discard(role)

    threading.Thread(target=run, daemon=True).start()
    return True


# ---------- SPA pages ----------

@bp.route("/login")
@bp.route("/terms")
@bp.route("/privacy")
def public_spa():
    """Landing, login, legal pages - public."""
    return _spa_index()


@bp.route("/admin/")
@bp.route("/admin/candidate/<int:cid>")
def admin_spa(cid=None):
    return _spa_index()


# ---------- Job / JD management ----------

@bp.route("/api/admin/jobs")
@login_required
def list_jobs():
    """All roles, synchronized with the JD-created jobs."""
    jobs = jd_service.list_jobs()
    for j in jobs:
        j["has_pdf"] = bool(j.get("jd_pdf_path") and Path(j["jd_pdf_path"]).exists())
        j.pop("jd_raw_text", None)
        j.pop("jd_structured", None)
    return jsonify({"jobs": jobs})


@bp.route("/api/admin/jd", methods=["POST"])
@login_required
def create_jd_from_text():
    """Option A: paste raw JD text -> deterministic/AI structuring -> PDF + role."""
    data = request.get_json(silent=True) or {}
    raw_text = str(data.get("raw_text", "") or "").strip()
    if len(raw_text) < 40:
        raise ValidationError("paste the job description text first")
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    job = jd_service.create_job_from_raw_text(nim, raw_text)
    return jsonify({
        "ok": True,
        "job": {"role": job["role"], "title": job["title"], "source": job["source"]},
    }), 201


@bp.route("/api/admin/jd/upload", methods=["POST"])
@login_required
def create_jd_from_file():
    """Option B: upload an existing JD file (PDF/TXT) -> role."""
    f = request.files.get("file")
    if not f or not f.filename:
        raise ValidationError("no JD file received")
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    job = jd_service.create_job_from_file(nim, f)
    return jsonify({
        "ok": True,
        "job": {"role": job["role"], "title": job["title"], "source": job["source"]},
    }), 201


@bp.route("/api/admin/jd/<role>/pdf")
@login_required
def jd_pdf(role):
    """Download the JD PDF for a role.

    For legacy roles (created before the jobs registry) the PDF is generated
    on first download from the stored job-posting JSON.
    """
    job = db.one("SELECT * FROM jobs WHERE role=?", (role,))
    pdf_path = Path(job["jd_pdf_path"]) if job and job.get("jd_pdf_path") else (
        Config.DATA_DIR / "job_postings" / f"{role}.pdf"
    )
    if not pdf_path.exists():
        posting_path = Config.DATA_DIR / "job_postings" / f"{role}.json"
        if not posting_path.exists():
            abort(404)
        try:
            posting = json.loads(posting_path.read_text(encoding="utf-8"))
            jd_service.generate_jd_pdf(posting, role, pdf_path)
        except Exception:
            abort(404)
    return send_file(str(pdf_path), as_attachment=False)


@bp.route("/api/admin/job/<role>", methods=["DELETE"])
@admin_required
def delete_job(role):
    """Remove the role definition; candidates are kept (admin only)."""
    existing = jd_service.list_jobs()
    if role not in {j["role"] for j in existing}:
        raise NotFoundError(f"No job found for role '{role}'")
    counts = jd_service.delete_job(role)
    return jsonify({"ok": True, "role": role, **counts})


# ---------- Admin API ----------

@bp.route("/api/admin/overview")
@login_required
def overview():
    rows = db.all(
        """SELECT c.*, i.status AS interview_status,
                  e.overall_score AS interview_score, e.recommendation,
                  (SELECT COUNT(*) FROM interviews x WHERE x.candidate_id = c.id) - 1 AS retakes,
                  (SELECT name FROM candidates d WHERE d.id = c.duplicate_of) AS duplicate_name
           FROM candidates c
           LEFT JOIN interviews i ON i.candidate_id = c.id
                AND i.id = (SELECT MAX(id) FROM interviews WHERE candidate_id = c.id)
           LEFT JOIN evaluations e ON e.interview_id = i.id
           ORDER BY c.id DESC"""
    )
    for r in rows:
        r["interview_url"] = (
            f"{Config.BASE_URL}/interview/{r['interview_token']}" if r.get("interview_token") else None
        )
        r.pop("cv_text", None)  # large; not needed for the table
    # Roles for FILTERING (sidebar): registry jobs + any role that still has
    # candidates - a deleted role stays filterable while its history exists.
    # job_roles = registry only (what HR can upload CVs against).
    job_roles = sorted({j["role"] for j in jd_service.list_jobs()})
    candidate_roles = {
        r["role"] for r in db.all("SELECT DISTINCT role FROM candidates") if r["role"]
    }
    roles = sorted(set(job_roles) | candidate_roles)
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    health = nim.health()
    return jsonify({
        "candidates": rows,
        "roles": roles,
        "job_roles": job_roles,
        "ats_threshold": Config.ATS_THRESHOLD,
        "processing": sorted(_PROCESSING),
        "ai": {
            "ok": health["ok"],
            "error": public_error(health.get("error", "")),
        },
    })


@bp.route("/api/admin/candidate/<int:cid>")
@login_required
def candidate_detail(cid):
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)
    interview = db.one(
        "SELECT * FROM interviews WHERE candidate_id=? ORDER BY id DESC LIMIT 1", (cid,)
    )
    retakes = db.one(
        "SELECT COUNT(*) AS n FROM interviews WHERE candidate_id=?", (cid,)
    )["n"] - 1
    answers = interview_service.list_answers(interview["id"]) if interview else []
    for a in answers:
        a["audio_url"] = f"/admin/recording/{a['id']}/audio" if a["audio_path"] else None
        a["video_url"] = f"/admin/recording/{a['id']}/video" if a["video_path"] else None
    evaluation = db.one("SELECT * FROM evaluations WHERE interview_id=?", (interview["id"],)) if interview else None
    # Pre-interview form (phase 1): personal/compensation data the candidate
    # submitted before the interview. Lives in its own table keyed by interview.
    details = (
        db.one("SELECT * FROM candidate_details WHERE interview_id=?", (interview["id"],))
        if interview else None
    )
    # Support: while the candidate is still unverified, HR can read the
    # active code (candidate on the phone: "the email never arrived").
    verification_code = (
        interview_service.current_verification_code(interview["id"]) if interview else None
    )
    return jsonify({
        "candidate": candidate,
        "ats": json.loads(candidate["ats_result"]) if candidate["ats_result"] else None,
        "interview": interview,
        "answers": answers,
        "evaluation": json.loads(evaluation["result_json"]) if evaluation else None,
        "details": details,
        "verification_code": verification_code,
        "retakes": retakes,
        "interview_url": (
            f"{Config.BASE_URL}/interview/{candidate['interview_token']}"
            if candidate.get("interview_token") else None
        ),
    })


@bp.route("/api/admin/candidate/<int:cid>/review", methods=["POST"])
@login_required
def review(cid):
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)
    data = request.get_json(silent=True) or {}
    decision = data.get("decision", "")
    notes = data.get("notes", "")
    if decision not in ("selected", "rejected", "manual_review"):
        return jsonify({"error": "invalid decision"}), 400
    db.execute(
        """UPDATE candidates SET status=?, review_decision=?, review_notes=?,
           reviewed_at=?, updated_at=? WHERE id=?""",
        (decision, decision, notes, db.now_iso(), db.now_iso(), cid),
    )

    # "Selected" must not strand the candidate: if they have no interview
    # yet (e.g. ATS-rejected earlier, or previously marked rejected), a bare
    # status flip leaves them with no link and no way to get one - the
    # shortlist button only shows for rejected/ats_error. Generate the
    # interview here, same as the manual-shortlist override.
    extra = {}
    if decision == "selected" and not candidate.get("interview_token"):
        token, email_detail = _generate_interview_for(candidate)
        extra = {
            "interview_url": f"{Config.BASE_URL}/interview/{token}",
            "email_status": email_detail,
        }
    return jsonify({"ok": True, **extra})


def _generate_interview_for(candidate):
    """Create the interview row + token and send the invite email.
    Shared by the manual-shortlist override and review='selected'.
    Returns (token, email_status_detail)."""
    token = interview_service.create_interview(
        candidate["id"], candidate["role"], defer_questions=True
    )
    db.execute(
        "UPDATE candidates SET status='shortlisted', updated_at=? WHERE id=?",
        (db.now_iso(), candidate["id"]),
    )
    email_detail = "no email address in CV"
    if candidate.get("email"):
        try:
            posting = interview_service.load_job_posting(candidate["role"])
            title = posting.get("title", candidate["role"])
        except FileNotFoundError:
            title = candidate["role"].replace("_", " ").title()
        _, email_detail = email_service.send_interview_email(
            candidate["email"], candidate.get("name") or "Candidate",
            title,
            f"{Config.BASE_URL}/interview/{token}",
        )
    db.execute(
        "UPDATE candidates SET status='interview_sent', email_sent_at=?, email_status=?, updated_at=? WHERE id=?",
        (db.now_iso(), email_detail, db.now_iso(), candidate["id"]),
    )
    return token, email_detail


@bp.route("/api/admin/candidate/<int:cid>/retake", methods=["POST"])
@login_required
def retake_interview(cid):
    """HR reset: the candidate made a mistake, so issue a FRESH interview.

    The previous attempt is closed (its link shows a reset notice, answers
    and evaluation stay on record), a new interview row is created with a
    new link and a newly generated question set, and the invite email goes
    out again. The candidate is flagged as retaken everywhere.
    """
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)

    latest = db.one(
        "SELECT * FROM interviews WHERE candidate_id=? ORDER BY id DESC LIMIT 1", (cid,)
    )
    if not latest:
        return jsonify({"error": "this candidate has no interview to retake"}), 400
    if latest["status"] in ("not_started", "in_progress"):
        return jsonify({
            "error": "the current interview is still live. Wait until it ends, "
                     "or it was never started",
        }), 400

    # Close the old attempt: its link must show a clear reset notice instead
    # of serving questions. History (answers/evaluation) is kept.
    db.execute(
        "UPDATE interviews SET aborted=1, status='aborted', abort_reason=?, completed_at=? WHERE id=?",
        ("This interview was reset by the hiring team. A new interview link has "
         "been sent to your email.", db.now_iso(), latest["id"]),
    )

    # Fresh interview: new token, new question set (generated in the
    # background), invite email out - same path as the first shortlist.
    token, email_detail = _generate_interview_for(candidate)
    db.execute(
        "UPDATE candidates SET review_notes=review_notes || ?, updated_at=? WHERE id=?",
        ("\nInterview retake issued by HR.", db.now_iso(), cid),
    )
    return jsonify({
        "ok": True,
        "retake": True,
        "interview_url": f"{Config.BASE_URL}/interview/{token}",
        "email_status": email_detail,
    })


@bp.route("/api/admin/candidate/<int:cid>", methods=["DELETE"])
@admin_required
def delete_candidate(cid):
    """Permanently remove a candidate and everything linked to them:
    evaluation, interview answers + recording files, interview, and the CV file
    (so the pipeline does not re-screen it on the next run)."""
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)

    # A retaken candidate has several interview rows - clean up ALL of them.
    for interview in db.all("SELECT * FROM interviews WHERE candidate_id=?", (cid,)):
        answers = db.all("SELECT * FROM answers WHERE interview_id=?", (interview["id"],))
        for a in answers:
            for col in ("audio_path", "video_path"):
                path = a.get(col)
                if path:
                    try:
                        Path(path).unlink(missing_ok=True)
                    except OSError:
                        pass  # e.g. OneDrive lock; rows are still removed below
        db.execute("DELETE FROM answers WHERE interview_id=?", (interview["id"],))
        db.execute("DELETE FROM evaluations WHERE interview_id=?", (interview["id"],))
        # Pre-interview details (FK -> interviews.id); without this the
        # interview DELETE below fails with an FK violation for every
        # candidate who reached the details form.
        db.execute("DELETE FROM candidate_details WHERE interview_id=?", (interview["id"],))
        db.execute("DELETE FROM interview_verifications WHERE interview_id=?", (interview["id"],))
        db.execute("DELETE FROM interviews WHERE id=?", (interview["id"],))

    if candidate.get("cv_path"):
        try:
            Path(candidate["cv_path"]).unlink(missing_ok=True)
        except OSError:
            pass

    db.execute("DELETE FROM candidates WHERE id=?", (cid,))
    return jsonify({"ok": True})


@bp.route("/api/admin/candidate/<int:cid>/shortlist", methods=["POST"])
@login_required
def manual_shortlist(cid):
    """HR override: manually shortlist a rejected candidate and generate
    their interview link.

    The interview score/recommendation stays independent of the ATS score
    (it is computed from interview performance alone), so a manually
    shortlisted candidate is judged purely on the interview merits.
    """
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)

    # Already has an interview? Just hand back the existing link.
    if candidate.get("interview_token"):
        return jsonify({
            "ok": True,
            "already_shortlisted": True,
            "interview_url": f"{Config.BASE_URL}/interview/{candidate['interview_token']}",
            "email_status": candidate.get("email_status") or "",
        })

    if candidate["status"] not in ("rejected", "ats_error", "shortlisted"):
        return jsonify({
            "error": f"candidate is '{candidate['status']}'. Only rejected "
                     "candidates or held duplicates can be manually shortlisted",
        }), 400

    # Create the interview row + token instantly; the per-candidate question
    # set generates in the background (same 3-layer fallback as the pipeline).
    token, email_detail = _generate_interview_for(candidate)
    if candidate.get("duplicate_of"):
        note = (f"Interview sent after HR reviewed the duplicate flag "
                f"(possible duplicate of candidate #{candidate['duplicate_of']}).")
    else:
        note = (f"Manually shortlisted by HR. ATS score {candidate.get('ats_score')} "
                f"was below the {Config.ATS_THRESHOLD} threshold.")
    db.execute(
        "UPDATE candidates SET review_notes=?, duplicate_of=NULL, updated_at=? WHERE id=?",
        (note, db.now_iso(), cid),
    )
    return jsonify({
        "ok": True,
        "interview_url": f"{Config.BASE_URL}/interview/{token}",
        "email_status": email_detail,
        "note": note,
    })


@bp.route("/api/admin/candidate/<int:cid>/reevaluate", methods=["POST"])
@admin_required
def reevaluate(cid):
    interview = db.one(
        "SELECT * FROM interviews WHERE candidate_id=? ORDER BY id DESC LIMIT 1", (cid,)
    )
    if not interview or interview["status"] not in ("completed", "evaluation_completed", "evaluation_pending"):
        return jsonify({"error": "interview is not in an evaluable state"}), 400
    db.execute("UPDATE interviews SET status='completed' WHERE id=?", (interview["id"],))

    def run():
        evaluation_service.evaluate_interview(interview["id"])

    threading.Thread(target=run, daemon=True).start()
    return jsonify({"ok": True})


@bp.route("/api/admin/process/<role>", methods=["POST"])
@admin_required
def process(role):
    started = _start_processing(role)
    return jsonify({"ok": True, "started": started})


@bp.route("/api/admin/upload/<role>", methods=["POST"])
@login_required
def upload(role):
    """HR uploads one or more CV PDFs; they are screened sequentially."""
    if not (Config.DATA_DIR / "job_postings" / f"{role}.json").exists():
        return jsonify({"error": f"unknown role '{role}'"}), 400
    files = request.files.getlist("files")
    role_dir = Config.JOBS_DIR / role
    role_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    skipped = []
    for f in files:
        if not (f and f.filename and f.filename.lower().endswith(".pdf")):
            continue
        name = secure_filename(f.filename)
        data = f.read()
        cv_hash = hashlib.sha256(data).hexdigest()
        # Identical file already processed for this role? Skip it even if the
        # candidate renamed the PDF. Report it so HR knows it was not missed.
        dupe = db.one(
            "SELECT id, name FROM candidates WHERE role=? AND cv_hash=?",
            (role, cv_hash),
        )
        dupe_name = dupe["name"] if dupe else None
        # Also catch a file sitting in the role folder that has not been
        # processed yet (rapid successive or same-batch duplicate uploads).
        if not dupe:
            for ep in role_dir.glob("*.pdf"):
                if ep.name == name:
                    continue
                try:
                    if hashlib.sha256(ep.read_bytes()).hexdigest() == cv_hash:
                        dupe_name = ep.name
                        break
                except OSError:
                    continue
        if dupe or dupe_name:
            skipped.append({
                "file": name,
                "existing_id": dupe["id"] if dupe else None,
                "existing_name": dupe_name,
                "reason": "identical file already uploaded for this role",
            })
            continue
        (role_dir / name).write_bytes(data)
        saved.append(name)
    if not saved and not skipped:
        return jsonify({"error": "no PDF files received"}), 400
    if saved:
        _start_processing(role)
    return jsonify({"ok": True, "saved": saved, "skipped": skipped, "processing": bool(saved)})


# ---------- File serving (CV + original recordings) ----------

@bp.route("/admin/candidate/<int:cid>/cv")
@login_required
def candidate_cv(cid):
    candidate = db.one("SELECT * FROM candidates WHERE id=?", (cid,))
    if not candidate:
        abort(404)
    return send_file(candidate["cv_path"], as_attachment=False)


@bp.route("/admin/recording/<int:answer_id>/<kind>")
@login_required
def recording(answer_id, kind):
    if kind not in ("audio", "video"):
        abort(404)
    answer = db.one("SELECT * FROM answers WHERE id=?", (answer_id,))
    if not answer:
        abort(404)
    path = answer["audio_path"] if kind == "audio" else answer["video_path"]
    if not path:
        abort(404)
    return send_file(path, as_attachment=False)


@bp.route("/admin/recording/<int:answer_id>/video/download")
@login_required
def download_recording_video(answer_id):
    """Download a candidate's recorded video answer (typically question 1)."""
    answer = db.one("SELECT * FROM answers WHERE id=?", (answer_id,))
    if not answer or not answer.get("video_path"):
        abort(404)
    return send_file(
        answer["video_path"],
        as_attachment=True,
        download_name=f"question-{answer['question_index'] + 1}-video{Path(answer['video_path']).suffix or '.webm'}",
    )
