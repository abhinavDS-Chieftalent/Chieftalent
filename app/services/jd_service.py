"""JD (job description) service: raw text/file -> structured JD -> PDF -> role.

Structuring strategy (deterministic first, AI only as fallback):
  1. jd_parser.parse_jd() - rule-based section detection, bullet extraction,
     title/metadata extraction. Handles the standard DotStark JD shapes with
     no model call at all.
  2. Only when the deterministic confidence is low (messy, freeform text)
     does the system make one AI call to structure the text.

Both entry points produce:
  1. data/job_postings/<role>.json  (the structured JD used by the ATS)
  2. data/job_postings/<role>.pdf   (downloadable JD document)
  3. jobs/<role>/                   (CV folder for the new role)
  4. a row in the `jobs` table      (role registry)
"""

import json
import logging
import re
import unicodedata
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

from .. import db
from ..config import Config
from ..errors import UpstreamError, ValidationError
from . import jd_parser
from .cv_parser import extract_text_from_pdf

log = logging.getLogger("chieftalent.jd")

MIN_JD_TEXT_LENGTH = 40
# Below this deterministic confidence, try the AI fallback.
AI_FALLBACK_THRESHOLD = 0.55

JD_SYSTEM = (
    "You are a professional technical recruiter who structures job descriptions. "
    "You convert raw, unstructured job description text into a clean, professional "
    "JD format. You preserve the ACTUAL requirements from the source text exactly - "
    "you never invent, add, or exaggerate requirements that are not present. "
    "You always respond with a single valid JSON object and nothing else."
)

JD_USER_TEMPLATE = """Structure the following raw job description text.

RAW JOB DESCRIPTION
-------------------
{raw_text}

INSTRUCTIONS
------------
1. Extract the actual information: job title, summary, responsibilities,
   requirements, and nice-to-have items.
2. Preserve the real requirements. Do NOT invent requirements, technologies,
   experience numbers, or qualifications that are not in the source.
3. If a section is missing in the source, use an empty list - do not guess.
4. Rewrite each item as a clear, professional, single-sentence bullet.
5. The summary is 2-4 sentences describing the role based only on the source.

Respond with ONLY this JSON object (no markdown, no commentary):
{{
  "title": "<job title, e.g. Software Engineer>",
  "summary": "<2-4 sentence role summary>",
  "responsibilities": ["<responsibility bullet>", "..."],
  "requirements": ["<core requirement bullet>", "..."],
  "nice_to_have": ["<nice-to-have bullet>", "..."]
}}"""


def slugify(title):
    """'Software Engineer (Senior)' -> 'software_engineer'"""
    t = unicodedata.normalize("NFKD", str(title or ""))
    t = t.encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^a-zA-Z0-9]+", "_", t).strip("_").lower()
    return re.sub(r"_+", "_", t) or f"role_{db.now_iso().replace(':', '').replace('-', '')}"


def unique_role(base_slug):
    """Return a role slug that does not collide with an existing job."""
    slug = base_slug
    suffix = 2
    while db.one("SELECT id FROM jobs WHERE role=?", (slug,)) or (
        Config.DATA_DIR / "job_postings" / f"{slug}.json"
    ).exists():
        slug = f"{base_slug}_{suffix}"
        suffix += 1
    return slug


def _structure_with_ai(nim, raw_text):
    """AI fallback for JDs the deterministic parser cannot handle."""
    messages = [
        {"role": "system", "content": JD_SYSTEM},
        {"role": "user", "content": JD_USER_TEMPLATE.format(raw_text=raw_text[:15000])},
    ]
    try:
        result = nim.chat_json(messages, temperature=0.3, max_tokens=8000)
    except Exception as e:  # noqa: BLE001 - normalized below
        raise UpstreamError(f"AI structuring failed: {e}") from e

    def as_list(v):
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        if v:
            return [str(v).strip()]
        return []

    structured = {
        "title": str(result.get("title", "") or "").strip() or "Untitled Role",
        "summary": str(result.get("summary", "") or "").strip(),
        "responsibilities": as_list(result.get("responsibilities")),
        "requirements": as_list(result.get("requirements")),
        "nice_to_have": as_list(result.get("nice_to_have")),
        "metadata": {},
        "experience_mentions": [],
        "structured_by": "ai",
    }
    if not structured["requirements"] and not structured["responsibilities"]:
        raise ValidationError("could not extract any requirements from the JD text")
    return structured


def structure_jd(nim, raw_text):
    """Deterministic first; AI only when the rule-based parse is too weak."""
    structured, confidence = jd_parser.parse_jd(raw_text)
    if structured and confidence >= AI_FALLBACK_THRESHOLD:
        log.info("JD structured deterministically (confidence=%.2f, title=%r)",
                 confidence, structured["title"])
        return structured

    log.info("deterministic parse weak (confidence=%.2f) - trying AI fallback", confidence)
    try:
        ai_structured = _structure_with_ai(nim, raw_text)
        det_content = len((structured or {}).get("requirements", [])) + len(
            (structured or {}).get("responsibilities", []))
        ai_content = len(ai_structured["requirements"]) + len(ai_structured["responsibilities"])
        # Keep whichever parse produced more usable content; prefer the
        # deterministic title if the AI missed it.
        if structured and structured.get("title") and not ai_structured.get("title"):
            ai_structured["title"] = structured["title"]
        if ai_content >= det_content:
            return ai_structured
    except UpstreamError:
        raise
    except Exception as e:  # noqa: BLE001 - fall back to deterministic result
        log.warning("AI structuring failed, using deterministic result: %s", e)

    if structured and structured.get("title") and (
        structured["requirements"] or structured["responsibilities"]
    ):
        return structured
    raise ValidationError(
        "Could not structure this job description. It has no recognizable "
        "title, requirements, or responsibilities sections."
    )


def generate_jd_pdf(structured, role, out_path):
    """Render the structured JD as a clean, professional PDF document."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "JDTitle", parent=styles["Title"], fontSize=20, leading=24,
        alignment=TA_LEFT, spaceAfter=6, textColor=colors.HexColor("#171717"),
    )
    meta_style = ParagraphStyle(
        "JDMeta", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#777777"),
        spaceAfter=18,
    )
    section_style = ParagraphStyle(
        "JDSection", parent=styles["Heading2"], fontSize=12.5, leading=16,
        spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#D85B3B"),
    )
    body_style = ParagraphStyle(
        "JDBody", parent=styles["Normal"], fontSize=10, leading=14.5,
        textColor=colors.HexColor("#252525"),
    )
    bullet_style = ParagraphStyle(
        "JDBullet", parent=body_style, leftIndent=12, bulletIndent=2, spaceAfter=3,
    )

    meta = structured.get("metadata") or {}
    meta_bits = [meta.get(k) for k in ("location", "experience", "salary", "employment_type") if meta.get(k)]
    meta_line = " · ".join(meta_bits) if meta_bits else f"ChiefTalent · {role}"

    story = [
        Paragraph(structured["title"], title_style),
        Paragraph(meta_line, meta_style),
    ]
    if structured.get("summary"):
        story += [Paragraph("About the role", section_style),
                  Paragraph(structured["summary"], body_style)]
    for heading, key in (
        ("Key responsibilities", "responsibilities"),
        ("Core requirements", "requirements"),
        ("Nice to have", "nice_to_have"),
    ):
        items = structured.get(key) or []
        if not items:
            continue
        story.append(Paragraph(heading, section_style))
        for item in items:
            story.append(Paragraph(item, bullet_style, bulletText="•"))
        story.append(Spacer(1, 4))

    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=18 * mm,
        title=f"{structured['title']} - Job Description",
    )
    doc.build(story)


def _persist_job(structured, raw_text, source):
    """Shared tail of both creation paths. Returns the created job dict."""
    role = unique_role(slugify(structured["title"]))

    # 1. Structured JD JSON (the format the existing ATS already consumes).
    postings_dir = Config.DATA_DIR / "job_postings"
    postings_dir.mkdir(parents=True, exist_ok=True)
    posting = {
        "role": role,
        "title": structured["title"],
        "summary": structured["summary"],
        "responsibilities": structured["responsibilities"],
        "requirements": structured["requirements"],
        "nice_to_have": structured["nice_to_have"],
        "metadata": structured.get("metadata", {}),
        "structured_by": structured.get("structured_by", ""),
        "experience_mentions": structured.get("experience_mentions", []),
    }
    json_path = postings_dir / f"{role}.json"
    json_path.write_text(json.dumps(posting, indent=2, ensure_ascii=False), encoding="utf-8")

    # 2. Downloadable PDF.
    pdf_path = postings_dir / f"{role}.pdf"
    generate_jd_pdf(structured, role, pdf_path)

    # 3. CV folder for the new role.
    (Config.JOBS_DIR / role).mkdir(parents=True, exist_ok=True)

    # 4. Registry row.
    db.execute(
        """INSERT INTO jobs (role, title, source, jd_raw_text, jd_structured, jd_pdf_path, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (role, structured["title"], source, raw_text or "",
         json.dumps(posting, ensure_ascii=False), str(pdf_path), db.now_iso()),
    )
    log.info("created job role=%r title=%r source=%s structured_by=%s",
             role, structured["title"], source, structured.get("structured_by"))
    return db.one("SELECT * FROM jobs WHERE role=?", (role,))


def create_job_from_raw_text(nim, raw_text):
    """Option A: paste raw JD text -> deterministic/AI structuring -> PDF + role."""
    raw_text = (raw_text or "").strip()
    if len(raw_text) < MIN_JD_TEXT_LENGTH:
        raise ValidationError("JD text is too short to process (need at least a few sentences)")
    structured = structure_jd(nim, raw_text)
    return _persist_job(structured, raw_text, source="raw_text")


def create_job_from_file(nim, file_storage):
    """Option B: upload an existing JD file (PDF/TXT) -> normalize -> PDF + role."""
    filename = (file_storage.filename or "").lower()
    if filename.endswith(".pdf"):
        raw_text = extract_text_from_pdf(file_storage)
    elif filename.endswith(".txt"):
        raw_text = file_storage.read().decode("utf-8", errors="replace")
    else:
        raise ValidationError("Unsupported JD file type. Upload a PDF or TXT file.")
    raw_text = (raw_text or "").strip()
    if len(raw_text) < MIN_JD_TEXT_LENGTH:
        raise ValidationError("Could not extract enough text from the uploaded JD file")

    structured = structure_jd(nim, raw_text)
    return _persist_job(structured, raw_text, source="file")


def list_jobs():
    """All known roles: jobs table first, then any legacy folder-only roles."""
    jobs = db.all("SELECT * FROM jobs ORDER BY created_at DESC, id DESC")
    known = {j["role"] for j in jobs}
    postings_dir = Config.DATA_DIR / "job_postings"
    if postings_dir.exists():
        for path in sorted(postings_dir.glob("*.json")):
            role = path.stem
            if role in known:
                continue
            try:
                posting = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            jobs.append({
                "role": role,
                "title": posting.get("title", role.replace("_", " ").title()),
                "source": "legacy",
                "jd_raw_text": "",
                "jd_structured": "",
                "jd_pdf_path": str(postings_dir / f"{role}.pdf"),
                "created_at": "",
            })
    return jobs


def delete_job(role):
    """Remove a job/role definition from the system, KEEPING all candidates.

    Deleted: the jobs registry row, the job-posting JSON + generated PDF and
    the legacy question-set file. Kept on purpose: every candidate of the
    role with their interviews, answers, recordings, evaluations and CV
    files - HR history must survive a role closing. The role disappears from
    the upload selector but stays filterable in the sidebar while candidates
    exist. Returns a summary dict.
    """
    counts = {"candidates_kept": 0}

    # 1. Registry row + posting files (the role definition).
    db.execute("DELETE FROM jobs WHERE role=?", (role,))
    for f in (Config.DATA_DIR / "job_postings" / f"{role}.json",
              Config.DATA_DIR / "job_postings" / f"{role}.pdf",
              Config.DATA_DIR / "interviews" / f"{role}.json"):
        try:
            f.unlink(missing_ok=True)
        except OSError:
            pass

    # 2. Candidates stay; just report how many.
    counts["candidates_kept"] = db.one(
        "SELECT COUNT(*) AS n FROM candidates WHERE role=?", (role,)
    )["n"]

    log.info("deleted job role=%r candidates_kept=%d", role, counts["candidates_kept"])
    return counts
