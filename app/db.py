import hashlib
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .config import Config

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'raw_text',
    jd_raw_text TEXT NOT NULL DEFAULT '',
    jd_structured TEXT NOT NULL DEFAULT '',
    jd_pdf_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    cv_path TEXT NOT NULL,
    cv_filename TEXT NOT NULL,
    cv_text TEXT NOT NULL DEFAULT '',
    ats_score REAL,
    ats_result TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'cv_processing',
    interview_token TEXT UNIQUE,
    email_sent_at TEXT,
    email_status TEXT NOT NULL DEFAULT '',
    review_decision TEXT NOT NULL DEFAULT '',
    review_notes TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(role, cv_filename)
);

CREATE TABLE IF NOT EXISTS interviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id),
    token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    current_index INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL UNIQUE REFERENCES interviews(id),
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    current_city TEXT NOT NULL DEFAULT '',
    hometown TEXT NOT NULL DEFAULT '',
    current_company TEXT NOT NULL DEFAULT '',
    total_experience TEXT NOT NULL DEFAULT '',
    notice_period TEXT NOT NULL DEFAULT '',
    current_ctc TEXT NOT NULL DEFAULT '',
    expected_ctc TEXT NOT NULL DEFAULT '',
    family_members TEXT NOT NULL DEFAULT '',
    earning_members TEXT NOT NULL DEFAULT '',
    skills_description TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL REFERENCES interviews(id),
    question_id TEXT NOT NULL,
    question_index INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL,
    time_limit INTEGER NOT NULL,
    question_started_at TEXT,
    time_used REAL,
    overtime INTEGER NOT NULL DEFAULT 0,
    answer_text TEXT NOT NULL DEFAULT '',
    correct_answer TEXT NOT NULL DEFAULT '',
    is_correct INTEGER,
    transcript TEXT NOT NULL DEFAULT '',
    audio_path TEXT NOT NULL DEFAULT '',
    video_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE(interview_id, question_index)
);

CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL UNIQUE REFERENCES interviews(id),
    result_json TEXT NOT NULL DEFAULT '',
    objective_total INTEGER NOT NULL DEFAULT 0,
    objective_correct INTEGER NOT NULL DEFAULT 0,
    objective_accuracy REAL NOT NULL DEFAULT 0,
    spoken_avg REAL NOT NULL DEFAULT 0,
    overall_score REAL NOT NULL DEFAULT 0,
    recommendation TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'recruiter',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ats_cache (
    cache_key TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interview_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    interview_id INTEGER NOT NULL UNIQUE,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    last_sent_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

"""

# Columns added after the first release; applied to existing databases.
MIGRATIONS = {
    "candidates": [
        ("cv_hash", "TEXT"),
        ("duplicate_of", "INTEGER"),
    ],
    "interviews": [
        ("question_set", "TEXT NOT NULL DEFAULT ''"),
        ("deadline_at", "TEXT"),
        ("details_done", "INTEGER NOT NULL DEFAULT 0"),
        ("guidelines_done", "INTEGER NOT NULL DEFAULT 0"),
        ("tab_warnings", "INTEGER NOT NULL DEFAULT 0"),
        ("aborted", "INTEGER NOT NULL DEFAULT 0"),
        ("abort_reason", "TEXT NOT NULL DEFAULT ''"),
    ],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db():
    conn = sqlite3.connect(Config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


INDICES = [
    "CREATE INDEX IF NOT EXISTS idx_candidates_role ON candidates(role)",
    "CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status)",
    "CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews(candidate_id)",
    "CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews(status)",
    "CREATE INDEX IF NOT EXISTS idx_answers_interview ON answers(interview_id)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_role ON jobs(role)",
]


def _table_columns(conn, table):
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def _apply_migrations(conn):
    for table, columns in MIGRATIONS.items():
        existing = _table_columns(conn, table)
        for name, decl in columns:
            if name not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")


def _backfill_cv_hashes(conn):
    """Give pre-dedup candidates a content hash so the upload-time duplicate
    check also catches renames of files uploaded before this column existed.
    Best-effort: a missing or locked file just stays NULL (filename and email
    checks still cover those)."""
    rows = conn.execute(
        "SELECT id, cv_path FROM candidates WHERE cv_hash IS NULL"
    ).fetchall()
    for r in rows:
        try:
            h = hashlib.sha256(Path(r["cv_path"]).read_bytes()).hexdigest()
        except (OSError, TypeError):
            continue
        conn.execute("UPDATE candidates SET cv_hash=? WHERE id=?", (h, r["id"]))


def init_db():
    Config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        _apply_migrations(conn)
        _backfill_cv_hashes(conn)
        for idx in INDICES:
            conn.execute(idx)
        conn.commit()
    finally:
        conn.close()


def one(query, args=()):
    conn = get_db()
    try:
        row = conn.execute(query, args).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def all(query, args=()):
    conn = get_db()
    try:
        rows = conn.execute(query, args).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def execute(query, args=()):
    conn = get_db()
    try:
        cur = conn.execute(query, args)
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()
