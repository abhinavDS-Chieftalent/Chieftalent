"""Candidate-facing interview routes: token-gated SPA pages + interview API."""

import threading

from flask import Blueprint, abort, jsonify, request, send_file

from ..config import Config
from ..services import evaluation_service, interview_service

bp = Blueprint("interview", __name__)


def _spa_index():
    path = Config.BASE_DIR / "app" / "static" / "spa" / "index.html"
    if not path.exists():
        return ("Frontend not built yet. Run: cd frontend && npm install && npm run build", 503)
    return send_file(path)


def _valid_interview(token):
    interview = interview_service.get_interview_by_token(token)
    if not interview:
        abort(404)
    return interview


@bp.route("/interview/<token>")
def interview_page(token):
    _valid_interview(token)
    return _spa_index()


@bp.route("/interview/<token>/done")
def interview_done(token):
    _valid_interview(token)
    return _spa_index()


@bp.route("/api/interview/<token>/state")
def api_state(token):
    _valid_interview(token)
    return jsonify(interview_service.get_state(token))


@bp.route("/api/interview/<token>/verify/request", methods=["POST"])
def api_verify_request(token):
    """Email a 6-digit code to the resume address (link ownership check)."""
    _valid_interview(token)
    result, status = interview_service.request_verification(token)
    return jsonify(result), status


@bp.route("/api/interview/<token>/verify/confirm", methods=["POST"])
def api_verify_confirm(token):
    """Check the 6-digit code; marks the interview email-verified."""
    _valid_interview(token)
    if not request.is_json:
        return jsonify({"error": "request body must be JSON"}), 400
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "invalid JSON payload"}), 400
    result, status = interview_service.confirm_verification(token, body.get("code"))
    return jsonify(result), status


@bp.route("/api/interview/<token>/details", methods=["POST"])
def api_details(token):
    """Phase 1: pre-interview information form (data collection only)."""
    _valid_interview(token)
    if not request.is_json:
        return jsonify({"error": "request body must be JSON"}), 400
    details = request.get_json(silent=True)
    if not isinstance(details, dict):
        return jsonify({"error": "invalid JSON payload"}), 400
    result, status = interview_service.save_details(token, details)
    return jsonify(result), status


@bp.route("/api/interview/<token>/guidelines", methods=["POST"])
def api_guidelines(token):
    """Phase 2: candidate confirmed the interview guidelines."""
    _valid_interview(token)
    result, status = interview_service.accept_guidelines(token)
    return jsonify(result), status


@bp.route("/api/interview/<token>/tab-warning", methods=["POST"])
def api_tab_warning(token):
    """Tab-switch warning. The 3rd warning aborts the interview."""
    _valid_interview(token)
    result, status = interview_service.record_tab_warning(token)
    return jsonify(result), status


@bp.route("/api/interview/<token>/answer", methods=["POST"])
def api_answer(token):
    interview = _valid_interview(token)
    try:
        question_index = int(request.form.get("question_index", "-1"))
    except ValueError:
        return jsonify({"error": "invalid question_index"}), 400

    result, status = interview_service.save_answer(
        token=token,
        question_index=question_index,
        answer_text=request.form.get("answer_text", ""),
        transcript=request.form.get("transcript", ""),
        audio_file=request.files.get("audio"),
        video_file=request.files.get("video"),
    )
    if status == 200 and result.get("completed"):
        # Evaluate asynchronously; the dashboard shows evaluation_pending meanwhile.
        def run():
            evaluation_service.evaluate_interview(interview["id"])

        threading.Thread(target=run, daemon=True).start()
    return jsonify(result), status
