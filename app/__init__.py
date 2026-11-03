import logging
import sys
from datetime import timedelta

from flask import Flask, request

from .config import Config, ensure_dirs
from .db import init_db
from .errors import register_error_handlers
from .services import auth_service


def _configure_logging():
    """Structured logging to stdout (captured by Docker/gunicorn)."""
    root = logging.getLogger()
    if root.handlers:
        return  # gunicorn already configured handlers
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s: %(message)s"
    ))
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def create_app():
    _configure_logging()
    ensure_dirs()
    init_db()
    auth_service.seed_users()

    app = Flask(__name__)
    app.config["SECRET_KEY"] = Config.SECRET_KEY
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=12)
    # Interview recordings can be large (video).
    app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024

    register_error_handlers(app)

    from .routes.admin import bp as admin_bp
    from .routes.auth import bp as auth_bp
    from .routes.interview import bp as interview_bp

    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(interview_bp)

    # Serve prerendered landing page for root (crawler accessible)
    @app.route("/")
    def landing():
        from flask import send_from_directory
        return send_from_directory(app.root_path + "/static/spa", "index.html")

    @app.route("/robots.txt")
    def robots():
        from flask import send_from_directory
        return send_from_directory(app.root_path + "/../frontend/public", "robots.txt", mimetype="text/plain")

    @app.route("/api/health")
    def health():
        return {"ok": True, "service": "chieftalent"}

    # Cross-origin isolation for the exam page only. MediaPipe's multi-threaded
    # WASM (2-3x faster on CPU-only candidate machines) requires
    # SharedArrayBuffer, which browsers only grant under COOP/COEP.
    # credentialless (not require-corp) so the Google Fonts <link> in
    # index.html keeps loading without CORP headers. Scoped to /interview/
    # so the landing and admin pages keep their normal embedding behavior.
    @app.after_request
    def cross_origin_isolation(response):
        if request.path.startswith("/interview"):
            response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
            response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
        return response

    return app
