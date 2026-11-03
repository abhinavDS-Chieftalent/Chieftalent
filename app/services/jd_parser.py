"""Deterministic JD parser: rule-based structuring, no AI.

Built against the real DotStark JD corpus. Real JDs arrive in a handful of
recurring shapes:

  ## Job Description: Senior .NET Full Stack Developer
  Position Overview We seek ...
  ## Key Responsibilities
  - Architect multi-tenant SaaS platforms ...
  Qualifications
  - 8+ years in enterprise technology sales ...
  Location: Jaipur, India (Rajasthan) | PAN India client travel required

The parser:
  1. normalizes markdown/HTML artifacts (##, **, <u>, mangled tables)
  2. detects the job title from "Job Description: X" patterns and header lines
  3. splits the body into sections using an alias table learned from the corpus
  4. extracts bullets, including ALL-CAPS run-in labels ("MANDATORY
     PROFICIENCY: ...") and prose paragraphs
  5. extracts metadata (location, experience range, salary, openings)
  6. scores its own confidence so the caller can decide whether an AI
     fallback is warranted

Everything here is deterministic: regex, keyword tables, and line-shape
heuristics. No model calls.
"""

import re
import unicodedata

# ---------------------------------------------------------------------------
# Section alias tables (learned from the real JD corpus)
# ---------------------------------------------------------------------------

SECTION_ALIASES = {
    "summary": [
        "position overview", "role overview", "job overview", "job summary",
        "about the role", "about the position", "overview", "the role",
        "position summary", "role summary", "introduction", "opportunity overview",
    ],
    "responsibilities": [
        "key responsibilities", "core responsibilities", "responsibilities",
        "job responsibilities", "role and responsibilities", "duties",
        "key duties", "what you will do", "what you'll do", "your role",
        "day to day", "day-to-day", "the work", "role description",
        "what youll do", "key responsibility",
    ],
    "requirements": [
        "qualifications", "required qualifications", "required skills & qualifications",
        "required skills and qualifications", "required skills", "skills required",
        "requirements", "core requirements", "job requirements",
        "required technical expertise", "technical expertise", "technical skills",
        "core technology stack", "technology stack", "essential experience",
        "required experience & qualifications", "required experience and qualifications",
        "required experience", "experience required", "minimum qualifications",
        "basic qualifications", "must have", "must-haves", "must-have",
        "mandatory proficiency", "mandatory production experience",
        "what we are looking for", "what we're looking for", "who you are",
        "you have", "you bring", "candidate profile", "eligibility",
        "the profile we seek", "profile we seek", "essential qualifications",
        "required leadership expertise", "key competencies", "competencies",
        "skills & competencies", "skills and competencies",
        "preferred skills & qualifications", "preferred qualifications & skills",
        "professional attributes", "required soft skills",
    ],
    "nice_to_have": [
        "nice to have", "nice-to-have", "preferred", "preferred qualifications",
        "preferred skills", "preferred skills (good to have)", "good to have",
        "good-to-have", "bonus points", "bonus", "plus points", "desirable",
        "additional skills", "would be a plus", "what will set you apart",
        "what sets you apart", "distinguishing excellence", "added advantage",
        "preferred profile", "preferred skills (good to have)",
    ],
}

# Sections whose content is NOT part of the hiring criteria.
IGNORED_SECTIONS = [
    "benefits", "what we offer", "perks", "why join", "why join us",
    "why work with us", "how to apply", "apply", "application process",
    "salary", "compensation", "location", "location & logistics",
    "location and logistics", "working hours", "equal opportunity", "diversity",
    "contact", "contact details", "about dotstark", "about us", "about the company",
    "who we are", "benefits & growth opportunities", "benefits and growth opportunities",
    "exceptional rewards package", "rewards package", "career level",
    "career acceleration", "professional growth", "professional development",
    "hiring context", "key performance indicators", "note", "company overview",
    "career architecture", "global exposure", "global growth opportunities",
    "lifestyle & growth benefits", "financial architecture",
]

# Inline metadata labels: "Location: Jaipur", "**Experience:** 3–7 Years".
META_LABELS = {
    "location": ["location", "work mode", "work schedule", "job location"],
    "experience": ["experience", "experience required", "experience range"],
    "salary": ["ctc", "ctc range", "salary", "salary range", "compensation"],
    "openings": ["openings", "positions", "no. of openings", "vacancies"],
    "employment_type": ["employment type", "job type", "hiring type"],
}

# A line that is ONLY a metadata label ("Location: Jaipur") must never be
# collected as a requirement/responsibility bullet; it belongs in the meta
# line of the PDF, not in the lists.
META_LINE_RE = re.compile(
    r"^\s*(?:"
    + "|".join(
        re.escape(l)
        for l in sorted({l for ls in META_LABELS.values() for l in ls}, key=len, reverse=True)
    )
    + r")\s*:",
    re.IGNORECASE,
)

TITLE_PATTERNS = [
    # "## Job Description: Senior .NET Full Stack Developer"
    re.compile(r"^#*\s*job\s*description\s*[:\-–—]\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    # "Job Description – Head of IT Sales"
    re.compile(r"^job\s*description\s*[:\-–—]\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
    # "Position: X" / "Job Title: X" / "Designation: X"
    re.compile(r"^(?:job\s*title|position|designation|role\s*title|title|vacancy|post|profile)\s*[:\-–—]\s*(.+?)\s*$", re.IGNORECASE | re.MULTILINE),
]

TITLE_ADJECTIVES = re.compile(
    r"^(?:skilled|experienced|talented|passionate|dynamic|proactive|detail-oriented|"
    r"results-driven|accomplished|proven|expert|creative|enthusiastic|motivated|"
    r"dedicated|innovative|strategic|senior-level)\s+",
    re.IGNORECASE,
)

TITLE_INLINE_PATTERNS = [
    re.compile(r"we (?:are|are currently|'re)\s+(?:looking|seeking|hiring)\s+for\s+(?:a|an|the)\s+(.+?)(?:\s+(?:with|who|to|at|in|for|having)\b|\s*[.,\n])", re.IGNORECASE),
    re.compile(r"we\s+seek\s+(?:a|an|the)\s+(.+?)(?:\s+(?:with|who|to|at|in|for|having)\b|\s*[.,\n])", re.IGNORECASE),
    re.compile(r"(?:hiring|opening)\s+for\s+(?:a|an)?\s*(.+?)(?:\s+(?:with|who|to|at|in|for)\b|\s*[.,\n])", re.IGNORECASE),
]

BULLET_RE = re.compile(r"^\s*(?:[-–—•*·▪●◦]|\d{1,2}[.)]|[a-z][.)])\s+", re.IGNORECASE)
MARKDOWN_HEADER_RE = re.compile(r"^\s*#{1,6}\s+")
HTML_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
EXPERIENCE_RE = re.compile(
    r"(\d{1,2})\s*(?:\+|plus)?\s*(?:[-–—to]+\s*(\d{1,2})\s*)?(?:\+\s*)?years?",
    re.IGNORECASE,
)
ALLCAPS_LABEL_RE = re.compile(r"^([A-Z][A-Z &/()+,.'-]{6,}?):\s*(.*)$")

NOISE_LINE_RE = re.compile(
    r"^(apply now|apply:|send your resume|share your cv|email\s*:|contact\s*:|phone\s*:|"
    r"website\s*:|hr@|www\.|https?://|immediate joiner|walk[- ]in|"
    r"kentico, microsoft dynamics|dotstark delivers|jd created by|"
    r"\*the (annual )?salary range)\b",
    re.IGNORECASE,
)


def _strip_markup(text):
    """Remove markdown headers, bold markers, HTML tags, mangled table pipes."""
    out_lines = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        s = MARKDOWN_HEADER_RE.sub("", line)
        s = HTML_TAG_RE.sub("", s)
        s = BOLD_RE.sub(r"\1", s)
        # Mangled PDF tables: "| cell | cell |" -> keep cell text.
        if s.strip().startswith("|") and s.strip().endswith("|"):
            cells = [c.strip() for c in s.strip().strip("|").split("|")]
            s = " ".join(c for c in cells if c and not re.fullmatch(r"[-:\s]+", c))
        s = re.sub(r"\s{2,}", " ", s).strip()
        out_lines.append(s)
    return "\n".join(out_lines)


def _normalize(text):
    text = unicodedata.normalize("NFKC", text or "")
    text = _strip_markup(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _alias_lookup(line):
    """Map a candidate header line to a section key, or None."""
    stripped = line.strip().rstrip(":").strip()
    if not stripped or len(stripped) > 70:
        return None
    low = stripped.lower().strip()
    if not re.fullmatch(r"[\w\s'&/(),.+-]+", low):
        return None
    for key, aliases in SECTION_ALIASES.items():
        if low in aliases:
            return key
    for ig in IGNORED_SECTIONS:
        if low == ig:
            return "ignored"
    return None


def _clean_item(line):
    s = BULLET_RE.sub("", line).strip()
    s = re.sub(r"\s*[,;.]$", "", s)
    s = re.sub(r"\s{2,}", " ", s)
    if s and s[0].islower():
        s = s[0].upper() + s[1:]
    return s


def _split_runin(text):
    """Split ALL-CAPS run-in labels from their content.

    'MANDATORY PROFICIENCY: Angular 14+ (3+ years hands-on) TypeScript 5+'
    -> ('MANDATORY PROFICIENCY', 'Angular 14+ (3+ years hands-on) TypeScript 5+')
    """
    m = ALLCAPS_LABEL_RE.match(text)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, text


def _extract_title(lines):
    head_lines = [l for l in lines[:15] if l]
    head = "\n".join(head_lines)
    for pattern in TITLE_PATTERNS:
        m = pattern.search(head)
        if m:
            title = _clean_item(m.group(1))
            # Strip trailing metadata glued to the title:
            # "Kentico Developer 3–8 Years Jaipur / Remote / Hybrid Full-Time"
            title = re.split(
                r"\s+(?:\d+\s*[-–—+]\s*\d*\s*years?|jaipur|remote|hybrid|full[- ]time|part[- ]time)\b",
                title, flags=re.IGNORECASE,
            )[0].strip(" -–—")
            if 3 <= len(title) <= 80:
                return title
    for pattern in TITLE_INLINE_PATTERNS:
        m = pattern.search(head)
        if m:
            title = _clean_item(m.group(1))
            title = TITLE_ADJECTIVES.sub("", title)
            if 3 <= len(title) <= 80:
                return title
    # Fallback: first short, title-shaped line.
    for line in head_lines[:6]:
        if 3 <= len(line) <= 70 and not BULLET_RE.match(line) \
                and not _alias_lookup(line) and not NOISE_LINE_RE.match(line) \
                and not re.match(r"^(we|our|the company|you|apply|please|dear|hi|hello)\b", line.lower()) \
                and re.fullmatch(r"[A-Za-z][A-Za-z0-9 .,/&()+-]*", line):
            return line
    return ""


def _extract_metadata(lines):
    """Extract Location/Experience/CTC/Openings. Handles several labels glued
    onto one line after bold-markup stripping:
    'Location: Jaipur CTC Range: ₹4–8 LPA Openings: 1'"""
    all_labels = sorted({l for labels in META_LABELS.values() for l in labels},
                        key=len, reverse=True)
    label_re = re.compile(
        r"\b(" + "|".join(re.escape(l) for l in all_labels) + r")\s*:",
        re.IGNORECASE,
    )
    meta = {}
    for line in lines[:30]:
        matches = list(label_re.finditer(line))
        for i, m in enumerate(matches):
            label = m.group(1).strip().lower()
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
            value = line[start:end].strip(" |,-–—")
            if not value or len(value) > 120:
                continue
            for key, labels in META_LABELS.items():
                if key not in meta and label in labels:
                    meta[key] = value
    return meta


def _sentences_to_items(text):
    """Split a prose paragraph into sentence-level items."""
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip())
    return [_clean_item(p) for p in parts if len(p.strip()) >= 12]


def parse_jd(raw_text):
    """Parse raw JD text into a structured dict. Returns (structured, confidence).

    structured = {
        title, summary, responsibilities[], requirements[], nice_to_have[],
        metadata: {location?, experience?, salary?, openings?, employment_type?},
        experience_mentions: [{min, max, source}],
        structured_by: "deterministic",
    }
    confidence in [0, 1]: how well the text fit the expected JD shape.
    """
    text = _normalize(raw_text)
    if len(text) < 40:
        return None, 0.0
    lines = [l for l in text.split("\n")]

    sections = {}
    current = "preamble"
    for line in lines:
        if not line:
            continue
        key = _alias_lookup(line)
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        if current == "ignored" or NOISE_LINE_RE.match(line):
            continue
        sections.setdefault(current, []).append(line)

    def items_of(key):
        out = []
        for line in sections.get(key, []):
            if META_LINE_RE.match(line):
                continue  # metadata ("Location: Jaipur"), not a bullet
            label, content = _split_runin(line)
            if label and content:
                # "MANDATORY PROFICIENCY: Angular 14+ ..." -> keep content only.
                line = content
            if BULLET_RE.match(line):
                item = _clean_item(line)
                if len(item) >= 8:
                    out.append(item)
            elif len(line) >= 20:
                # Prose line inside a list section: split into sentences.
                out.extend(i for i in _sentences_to_items(line) if len(i) >= 8)
            elif len(line) >= 8:
                out.append(_clean_item(line))
        # De-duplicate while preserving order.
        seen = set()
        deduped = []
        for item in out:
            k = item.lower()
            if k not in seen:
                seen.add(k)
                deduped.append(item)
        return deduped

    title = _extract_title(lines)
    metadata = _extract_metadata(lines)

    summary_lines = sections.get("summary") or sections.get("preamble", [])[:4]
    summary = " ".join(
        _clean_item(l) for l in summary_lines
        if l and not _alias_lookup(l) and l != title
    )
    summary = re.sub(r"\s{2,}", " ", summary).strip()
    if len(summary) > 700:
        summary = summary[:697].rsplit(" ", 1)[0] + "..."

    requirements = items_of("requirements")
    responsibilities = items_of("responsibilities")
    nice_to_have = items_of("nice_to_have")

    # Some JDs put everything under one header; if "responsibilities" is huge
    # and "requirements" is empty, split by content shape (years/skills lines
    # are requirements).
    if not requirements and len(responsibilities) > 8:
        reqs = [r for r in responsibilities
                if EXPERIENCE_RE.search(r) or re.search(r"\b(proficien|experience|knowledge of|familiarity|understanding of)\b", r, re.IGNORECASE)]
        if len(reqs) >= 3:
            requirements = reqs
            responsibilities = [r for r in responsibilities if r not in reqs]

    experience_mentions = []
    for item in requirements + nice_to_have:
        m = EXPERIENCE_RE.search(item)
        if m:
            lo = int(m.group(1))
            hi = int(m.group(2)) if m.group(2) else lo
            experience_mentions.append({"min": lo, "max": hi, "source": item})

    structured = {
        "title": title,
        "summary": summary,
        "responsibilities": responsibilities,
        "requirements": requirements,
        "nice_to_have": nice_to_have,
        "metadata": metadata,
        "experience_mentions": experience_mentions,
        "structured_by": "deterministic",
    }

    # Confidence scoring.
    score = 0.0
    if title:
        score += 0.30
    if len(requirements) >= 3:
        score += 0.30
    elif len(requirements) >= 1:
        score += 0.15
    if len(responsibilities) >= 2:
        score += 0.20
    if summary and len(summary) > 60:
        score += 0.15
    if metadata:
        score += 0.05
    return structured, round(min(score, 1.0), 2)
