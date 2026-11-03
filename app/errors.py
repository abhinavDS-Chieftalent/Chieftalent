"""Consistent API error types and handlers.

Every route either returns a success payload or raises ApiError; the
registered handler turns it into a uniform JSON shape:

    {"error": {"code": "validation_failed", "message": "..."}}

Unexpected exceptions become 500s with a generic message (the real error is
logged server-side, never leaked to the client).
"""

import logging

log = logging.getLogger("chieftalent")


class ApiError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message, *, status=None, code=None):
        super().__init__(message)
        self.message = message
        if status is not None:
            self.status = status
        if code is not None:
            self.code = code


class ValidationError(ApiError):
    status = 400
    code = "validation_failed"


class NotFoundError(ApiError):
    status = 404
    code = "not_found"


class ConflictError(ApiError):
    status = 409
    code = "conflict"


class UpstreamError(ApiError):
    """A dependency (the AI endpoint, the filesystem) failed."""
    status = 502
    code = "upstream_error"


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _api_error(err):
        return {"error": {"code": err.code, "message": err.message}}, err.status

    @app.errorhandler(404)
    def _not_found(err):
        # API clients get JSON; a human typing a wrong URL gets the SPA
        # (its router redirects unknown paths to the landing page) instead
        # of raw JSON.
        from flask import request, send_file

        if not request.path.startswith("/api/") and request.method == "GET":
            from .config import Config

            spa = Config.BASE_DIR / "app" / "static" / "spa" / "index.html"
            if spa.exists():
                return send_file(spa)
        return {"error": {"code": "not_found", "message": "resource not found"}}, 404

    @app.errorhandler(413)
    def _too_large(err):
        return {"error": {"code": "payload_too_large",
                          "message": "uploaded file is too large"}}, 413

    @app.errorhandler(Exception)
    def _unexpected(err):
        log.exception("unhandled error: %s", err)
        return {"error": {"code": "internal_error",
                          "message": "an unexpected error occurred"}}, 500
