import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


class Config:
    BASE_DIR = BASE_DIR
    DATA_DIR = BASE_DIR / "data"
    JOBS_DIR = BASE_DIR / "jobs"
    RECORDINGS_DIR = DATA_DIR / "recordings"
    OUTBOX_DIR = DATA_DIR / "outbox"
    DB_PATH = DATA_DIR / "hr_mvp.db"

    # NVIDIA NIM (OpenAI-compatible)
    NIM_BASE_URL = os.getenv("NIM_BASE_URL", "http://localhost:8100/v1").rstrip("/")
    NIM_API_KEY = os.getenv("NIM_API_KEY", "")
    NIM_MODEL = os.getenv("NIM_MODEL", "")

    # ATS
    ATS_THRESHOLD = float(os.getenv("ATS_THRESHOLD", "70"))

    # SMTP
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "")
    SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

    # App
    BASE_URL = os.getenv("BASE_URL", "http://localhost:5000").rstrip("/")
    HOST = os.getenv("HOST", "127.0.0.1")
    PORT = int(os.getenv("PORT", "5000"))
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    ADMIN_KEY = os.getenv("ADMIN_KEY", "")

    # Interview timing
    TIME_GRACE_SECONDS = int(os.getenv("HR_TIME_GRACE_SECONDS", "15"))

    # Final score blend
    OBJECTIVE_WEIGHT = float(os.getenv("OBJECTIVE_WEIGHT", "0.4"))
    SPOKEN_WEIGHT = float(os.getenv("SPOKEN_WEIGHT", "0.6"))
    PASS_THRESHOLD = float(os.getenv("PASS_THRESHOLD", "70"))
    BORDERLINE_THRESHOLD = float(os.getenv("BORDERLINE_THRESHOLD", "50"))


def ensure_dirs():
    for d in (Config.DATA_DIR, Config.JOBS_DIR, Config.RECORDINGS_DIR, Config.OUTBOX_DIR):
        d.mkdir(parents=True, exist_ok=True)
