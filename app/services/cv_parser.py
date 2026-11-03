"""CV parsing: plain file/text processing, no AI involved."""

import re

from pypdf import PdfReader

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+?\d[\d\s().-]{7,}\d)")


def extract_text_from_pdf(path):
    """Extract the text layer of a PDF CV.

    pdfplumber (MIT, pdfminer-based) reconstructs word spacing far better
    than pypdf - pypdf's kerning artifacts broke names ("DEVANG" came out
    as "DEV ANG"). pypdf stays as the fallback so a pdfplumber failure
    never blocks an upload.
    """
    try:
        import pdfplumber

        with pdfplumber.open(str(path)) as pdf:
            parts = [(page.extract_text() or "") for page in pdf.pages]
        text = "\n".join(parts).strip()
        if text:
            return text
    except Exception:  # noqa: BLE001 - fall back to pypdf below
        pass

    reader = PdfReader(str(path))
    parts = [(page.extract_text() or "") for page in reader.pages]
    return "\n".join(parts).strip()


def extract_email(text):
    m = EMAIL_RE.search(text or "")
    return m.group(0) if m else ""


def extract_phone(text):
    m = PHONE_RE.search(text or "")
    return m.group(1).strip() if m else ""


def guess_name(text):
    """Heuristic fallback: first short, non-email line of the CV."""
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or EMAIL_RE.search(line):
            continue
        words = line.split()
        if 1 < len(words) <= 4 and all(w.replace(".", "").isalpha() for w in words):
            return line
    return ""
