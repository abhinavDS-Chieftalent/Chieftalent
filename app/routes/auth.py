"""Auth routes: session login/logout, current-user, forgot-password OTP stub."""

from flask import Blueprint, jsonify, request, session

from ..services import auth_service, email_service

bp = Blueprint("auth", __name__)


@bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400
    user = auth_service.verify(email, password)
    if not user:
        return jsonify({"error": "Invalid email or password."}), 401
    session.clear()
    session["user_id"] = user["id"]
    session.permanent = True
    return jsonify({"ok": True, "user": auth_service.public_user(user)})


@bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.route("/api/auth/me")
def me():
    user = auth_service.current_user()
    if not user:
        return jsonify({"error": "not authenticated"}), 401
    return jsonify({"user": auth_service.public_user(user)})


@bp.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Generate an OTP and deliver it by email. Verification + reset UI lands
    in a later phase - the login page already leaves space for the OTP step."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip()
    if not email:
        return jsonify({"error": "Email is required."}), 400
    # Always answer success (do not leak which emails exist), but only
    # generate + send when the account is real.
    user = auth_service.find_user(email)
    if user:
        code = auth_service.create_otp(email)
        subject = "Your password reset code"
        text = (
            f"Hello {user['name']},\n\n"
            f"Your verification code is: {code}\n\n"
            f"It expires in {auth_service.OTP_TTL_MINUTES} minutes.\n\n"
            "If you did not request this, ignore this email.\n"
        )
        html = (
            '<html><body style="font-family:Arial,sans-serif;line-height:1.5">'
            f"<p>Hello <strong>{user['name']}</strong>,</p>"
            "<p>Your verification code is:</p>"
            f'<p style="font-size:28px;font-weight:700;letter-spacing:6px">{code}</p>'
            f"<p>It expires in {auth_service.OTP_TTL_MINUTES} minutes. "
            "If you did not request this, ignore this email.</p>"
            "</body></html>"
        )
        email_service.send_email(email, subject, text, html)
    return jsonify({"ok": True, "message": "If that email is registered, a verification code is on its way."})
