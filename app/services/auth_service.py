"""Authentication: users, password hashing, session helpers, OTP stubs.

Roles:
  admin     - full control: delete candidates, re-evaluate, trigger processing,
              plus everything a recruiter can do.
  recruiter - upload CVs, view everything, submit final review decisions.

The demo admin is seeded on first run (yash@dotstark.com / Yash@1234).
A demo recruiter is seeded too so role restrictions are testable.
"""

import functools
import secrets
from datetime import datetime, timedelta, timezone

from flask import jsonify, session
from werkzeug.security import check_password_hash, generate_password_hash

from .. import db

OTP_TTL_MINUTES = 10

SEED_USERS = [
    {"email": "yash@dotstark.com", "name": "Yash", "password": "Yash@1234", "role": "admin"},
    {"email": "recruiter@dotstark.com", "name": "Recruiter", "password": "Recruit@1234", "role": "recruiter"},
]


def seed_users():
    """Create the demo accounts if the users table is empty."""
    if db.one("SELECT id FROM users LIMIT 1"):
        return
    for u in SEED_USERS:
        db.execute(
            "INSERT INTO users (email, name, password_hash, role, created_at) VALUES (?,?,?,?,?)",
            (u["email"], u["name"], generate_password_hash(u["password"]), u["role"], db.now_iso()),
        )


def find_user(email):
    return db.one("SELECT * FROM users WHERE email=?", (email.strip().lower(),))


def verify(email, password):
    user = find_user(email)
    if user and check_password_hash(user["password_hash"], password):
        return user
    return None


def public_user(user):
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return db.one("SELECT * FROM users WHERE id=?", (uid,))


def login_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify({"error": "authentication required"}), 401
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "authentication required"}), 401
        if user["role"] != "admin":
            return jsonify({"error": "admin role required"}), 403
        return fn(*args, **kwargs)

    return wrapper


def create_otp(email):
    """Generate a 6-digit OTP for a password-reset request.

    The plaintext code is returned so the caller can deliver it (outbox email
    in demo mode). Only the hash is stored. Verification/reset lands in a
    later phase - the UI already leaves space for it.
    """
    code = f"{secrets.randbelow(1000000):06d}"
    expires = (datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)).isoformat(timespec="seconds")
    db.execute(
        "INSERT INTO otp_codes (email, code_hash, expires_at, created_at) VALUES (?,?,?,?)",
        (email.strip().lower(), generate_password_hash(code), expires, db.now_iso()),
    )
    return code
