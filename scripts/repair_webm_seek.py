"""Repair seek metadata on existing interview WebM recordings.

Run inside the app container:
    docker compose exec app python scripts/repair_webm_seek.py
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config
from app.services.video_service import _duration_seconds, repair_webm_seek


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report files without changing them")
    args = parser.parse_args()

    files = sorted(Config.RECORDINGS_DIR.rglob("*_video.webm")) if Config.RECORDINGS_DIR.exists() else []
    repaired = already_seekable = failed = 0
    for path in files:
        if _duration_seconds(path) is not None:
            already_seekable += 1
            continue
        if args.dry_run:
            print(f"needs repair: {path}")
            continue
        if repair_webm_seek(path):
            repaired += 1
        else:
            failed += 1
            print(f"could not repair: {path}")

    if args.dry_run:
        print(f"checked {len(files)} video files; {sum(1 for p in files if _duration_seconds(p) is None)} need repair")
    else:
        print(f"checked {len(files)} video files; repaired={repaired}, already_seekable={already_seekable}, failed={failed}")


if __name__ == "__main__":
    main()
