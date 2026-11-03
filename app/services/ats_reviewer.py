"""ATS CV review: compares a CV against a job posting using the NIM LLM.

The prompt explicitly instructs the model to weigh *demonstrated experience*
over keyword occurrences, and to score experience PROPORTIONALLY: a candidate
who exceeds the required experience scores higher, a candidate below it still
earns a reasonable score when the rest of the profile is relevant. Only clearly
unrelated backgrounds are rejected.
"""

import json

ATS_SYSTEM = (
    "You are an expert ATS (Applicant Tracking System) screening engine. "
    "You evaluate how well a candidate's CV matches a specific job posting. "
    "You are evidence-based and fair: strict about relevance, but calibrated "
    "for the seniority of the candidate. You always respond with a single "
    "valid JSON object and nothing else."
)

ATS_USER_TEMPLATE = """Evaluate the following CV against the job posting.

JOB POSTING
-----------
Title: {job_title}
Summary: {job_summary}

Key responsibilities:
{job_responsibilities}

CORE requirements (these decide the score):
{job_requirements}

Nice to have (bonus only - never penalize a candidate for missing these):
{job_nice_to_have}

CANDIDATE - DETERMINISTICALLY PARSED FACTS (from the CV, rule-based parser)
--------------------------------------------------------------------------
{parsed_profile}

CANDIDATE CV (raw text)
-----------------------
{cv_text}

EVALUATION RULES
----------------
1. Base the score on the candidate's DEMONSTRATED background: actual job
   titles, responsibilities held, projects, and achievements relevant to the
   CORE requirements. The parsed facts above are reliable for experience
   years and skills presence; the raw text is the evidence for depth.
2. A keyword that appears only in a skills list, without supporting work
   experience, counts very little. For example, "SQL" appearing once in a CV
   whose career is unrelated to this role must NOT be treated as equivalent
   to work history that demonstrates using SQL for this kind of role.
3. Nice-to-have items add a few points when present, but their absence must
   NOT pull an otherwise qualified candidate out of the passing band. Never
   list them as missing requirements.
4. EXPERIENCE IS SCORED PROPORTIONALLY, never as a pass/fail gate. If the JD
   asks for N years:
   - clearly exceeding N (e.g. N+2 or more)          -> strongest weight
   - meeting N (within about 1 year of N)            -> strong weight
   - moderately below N (about 60-85% of N)          -> reasonable score,
       reduced proportionally, NOT a rejection by itself
   - well below N (under about half of N)            -> noticeably lower score
   - no relevant experience at all                   -> counts against
   A single missing requirement (including years of experience) must NEVER
   by itself push an otherwise relevant candidate below the passing band.
5. REJECT ONLY CLEAR UNRELATEDNESS. A candidate whose whole career is in an
   unrelated field (e.g. an accountant, graphic designer, or sales executive
   applying to a software engineering role, with no meaningful overlap) scores
   in the 0-39 band regardless of scattered keyword mentions. But a candidate
   in an ADJACENT field with real, evidenced overlap in the core skills is a
   partial match, not a rejection.
6. Consider, in order of importance: required experience, relevant experience,
   technical skills, required technologies, similar technologies, job
   responsibilities, education (only where the JD asks), industry/domain
   experience (only where the JD asks), and overall relevance of the background.
7. Score guide (overall_score, 0-100):
   85-100 = strong demonstrated match; most core requirements clearly evidenced,
            or required experience clearly exceeded
   70-84  = solid match; real demonstrated experience in several core
            requirements, even at junior level or slightly below the
            requested years
   55-69  = partial match; some relevant experience but significant core gaps
   40-54  = weak match; mostly adjacent experience
   0-39   = background essentially unrelated to the role, regardless of
            scattered keyword mentions

Respond with ONLY this JSON object (no markdown, no commentary):
{{
  "candidate_name": "<the candidate's correct full name>",
  "email": "<email address from the CV, or empty string>",
  "overall_score": <integer 0-100>,
  "matched_requirements": ["<core requirement the candidate demonstrably meets>"],
  "missing_requirements": ["<important CORE requirement with no evidence in the CV>"],
  "relevant_experience": ["<short evidence statement from the CV>"],
  "reasoning": "<2-4 sentences explaining the score, including how experience was weighed>"
}}

IMPORTANT - about candidate_name: the CV text was extracted from a PDF and
may contain BROKEN WORD SPACING (for example "DEV ANG" instead of
"DEVANG", or "BHARDW AJ" instead of "BHARDWAJ"). Do NOT copy broken
fragments. Reconstruct the person's real name:
- Use the email address, LinkedIn handle or GitHub handle in the CV as
  evidence of the correct spelling (e.g. "devangbhardwaj" in the email or
  profile URL proves the name is "Devang Bhardwaj").
- Use your knowledge of real names to fix spacing artifacts.
- Return the name in normal Title Case (e.g. "Devang Bhardwaj"), not
  ALL CAPS, exactly as a person would write it."""


def _fmt_list(items):
    return "\n".join(f"- {i}" for i in items) or "- (none)"


def build_messages(job_posting, cv_text):
    """Exact production prompt for the ATS review (shared with the token
    measurement script so costs are measured on the real thing)."""
    from .resume_parser import format_profile_for_prompt, parse_resume
    profile = parse_resume(cv_text)
    user = ATS_USER_TEMPLATE.format(
        job_title=job_posting.get("title", ""),
        job_summary=job_posting.get("summary", ""),
        job_responsibilities=_fmt_list(job_posting.get("responsibilities", [])),
        job_requirements=_fmt_list(job_posting.get("requirements", [])),
        job_nice_to_have=_fmt_list(job_posting.get("nice_to_have", [])),
        parsed_profile=format_profile_for_prompt(profile),
        cv_text=cv_text[:12000],
    )
    return [
        {"role": "system", "content": ATS_SYSTEM},
        {"role": "user", "content": user},
    ], profile


def _cache_key(job_posting, cv_text):
    """Same role posting + same CV text => same key => same stored score.
    If the JD changes, the key changes and the CV is re-reviewed."""
    import hashlib
    posting_blob = json.dumps(job_posting, sort_keys=True, ensure_ascii=False)
    h = hashlib.sha256()
    h.update(posting_blob.encode("utf-8"))
    h.update(b"\x00")
    h.update(cv_text.strip().encode("utf-8"))
    return h.hexdigest()


def review_cv(nim, job_posting, cv_text):
    """Run the ATS review. Returns a normalized result dict.

    Scoring is deterministic by construction:
    - the LLM runs at temperature 0
    - an identical (posting, CV) pair returns the previously stored
      result instead of re-rolling a new score
    """
    from .. import db as dbm

    key = _cache_key(job_posting, cv_text)
    row = dbm.one("SELECT result_json FROM ats_cache WHERE cache_key=?", (key,))
    if row:
        cached = json.loads(row["result_json"])
        cached["cached"] = True
        return cached

    messages, profile = build_messages(job_posting, cv_text)
    result = nim.chat_json(messages, temperature=0.0, max_tokens=8000)
    normalized = normalize_result(result)
    # Attach the deterministic facts so the dashboard can show them.
    normalized["parsed_profile"] = {
        "skills": profile["skills"],
        "experience_years": profile["experience_years"],
        "titles": profile["titles"],
        "education": profile["education"],
    }
    normalized["cached"] = False
    try:
        dbm.execute(
            "INSERT OR REPLACE INTO ats_cache (cache_key, result_json, created_at) "
            "VALUES (?,?,?)",
            (key, json.dumps(normalized, ensure_ascii=False), dbm.now_iso()),
        )
    except Exception:
        pass  # cache write failure must never break a screening
    return normalized


def normalize_result(result):
    def as_list(v):
        if isinstance(v, list):
            return [str(x) for x in v]
        if v:
            return [str(v)]
        return []

    try:
        score = float(result.get("overall_score", 0))
    except (TypeError, ValueError):
        score = 0.0
    score = max(0.0, min(100.0, score))

    return {
        "candidate_name": str(result.get("candidate_name", "") or ""),
        "email": str(result.get("email", "") or ""),
        "overall_score": score,
        "matched_requirements": as_list(result.get("matched_requirements")),
        "missing_requirements": as_list(result.get("missing_requirements")),
        "relevant_experience": as_list(result.get("relevant_experience")),
        "reasoning": str(result.get("reasoning", "") or ""),
    }
