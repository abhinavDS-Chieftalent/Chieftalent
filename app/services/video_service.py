"""Utilities for making browser-recorded WebM videos seekable."""

import logging
import os
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("chieftalent.video")


def _duration_seconds(path):
    """Return the container duration, or None if it is missing/unreadable."""
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return None
    try:
        result = subprocess.run(
            [ffprobe, "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True, timeout=20,
        )
        duration = float(result.stdout.strip())
        return duration if duration > 0 else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def repair_webm_seek(path):
    """Remux a WebM in place if it lacks duration/index metadata.

    Streams are copied without re-encoding. A sibling temp file is verified
    before atomically replacing the original, so a failed remux keeps the
    original recording intact. Returns True when a remux was performed.
    """
    source = Path(path)
    if source.suffix.lower() != ".webm":
        return False
    if _duration_seconds(source) is not None:
        return False

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        log.warning("ffmpeg unavailable; leaving WebM without seek metadata: %s", source)
        return False

    temp = source.with_name(f"{source.stem}.seekfix.tmp.webm")
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
             "-map", "0", "-c", "copy", "-f", "webm", str(temp)],
            check=True, capture_output=True, text=True, timeout=180,
        )
        duration = _duration_seconds(temp)
        if duration is None:
            log.warning("WebM remux produced no seek duration; retaining original: %s (%s)",
                        source, result.stderr[-500:])
            return False
        os.replace(temp, source)
        log.info("WebM seek metadata repaired: %s (%.2fs)", source.name, duration)
        return True
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip()[-500:]
        log.warning("WebM remux failed; retaining original %s: %s %s", source, exc, detail)
        return False
    except (OSError, subprocess.SubprocessError) as exc:
        log.warning("WebM remux failed; retaining original %s: %s", source, exc)
        return False
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass
