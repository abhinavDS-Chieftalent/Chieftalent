"""A/B test the calibrated ATS prompt against stored CV texts before committing.

    python scripts/test_ats_calibration.py
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Config
from app.services.interview_service import load_job_posting
from app.services.nim_client import NIMClient

CALIBRATED_SYSTEM = (
    "You are an expert ATS (Applicant Tracking System) screening engine. "
    "You evaluate how well a candidate's CV matches a specific job posting. "
    "You are evidence-based and fair: strict about relevance, but calibrated "
    "for the seniority of the candidate. You always respond with a single "
    "valid JSON object and nothing else."
)

CALIBRATED_USER = """Evaluate the following CV against the job posting.

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

CANDIDATE CV
------------
{cv_text}

EVALUATION RULES
----------------
1. Base the score on the candidate's DEMONSTRATED background: actual job
   titles, responsibilities held, projects, and achievements relevant to the
   CORE requirements.
2. A keyword that appears only in a skills list, without supporting work
   experience, counts very little.
3. Nice-to-have items (e.g. certifications, specific tools such as BPMN or
   Jira) add a few points when present, but their absence must NOT pull an
   otherwise qualified candidate out of the passing band. Never list them as
   missing requirements.
4. Calibrate for seniority: this is a screening decision (is the candidate
   worth interviewing?), not a final hire decision. A junior candidate
   (under ~2 years of experience) who demonstrates real business-analysis
   work - requirements, stakeholder communication, analysis, agile teams -
   belongs in the passing band even without senior-level breadth, tools, or
   certifications.
5. Score guide (overall_score, 0-100):
   85-100 = strong demonstrated match; most core requirements clearly evidenced
   70-84  = solid match; real demonstrated experience in several core
            requirements, even at junior level
   55-69  = partial match; some relevant experience but significant core gaps
   40-54  = weak match; mostly adjacent experience
   0-39   = background essentially unrelated to the role, regardless of
            scattered keyword mentions

Respond with ONLY this JSON object (no markdown, no commentary):
{{
  "candidate_name": "<full name as written in the CV>",
  "email": "<email address from the CV, or empty string>",
  "overall_score": <integer 0-100>,
  "matched_requirements": ["<core requirement the candidate demonstrably meets>"],
  "missing_requirements": ["<important CORE requirement with no evidence in the CV>"],
  "relevant_experience": ["<short evidence statement from the CV>"],
  "reasoning": "<2-4 sentences explaining the score>"
}}"""


def fmt(items):
    return "\n".join(f"- {i}" for i in items) or "- (none)"


def main():
    conn = sqlite3.connect(Config.DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT name, cv_text FROM candidates WHERE cv_text != '' ORDER BY id"
    ).fetchall()
    job = load_job_posting("business_analyst")
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)

    user_template_vars = dict(
        job_title=job["title"], job_summary=job["summary"],
        job_responsibilities=fmt(job["responsibilities"]),
        job_requirements=fmt(job["requirements"]),
        job_nice_to_have=fmt(job["nice_to_have"]),
    )

    for r in rows:
        user = CALIBRATED_USER.format(**user_template_vars, cv_text=r["cv_text"][:12000])
        result = nim.chat_json(
            [{"role": "system", "content": CALIBRATED_SYSTEM},
             {"role": "user", "content": user}],
            temperature=0.3, max_tokens=2000,
        )
        print(f"{r['name']:<16} -> {result.get('overall_score')}")
        print(f"  reasoning: {str(result.get('reasoning'))[:220]}")
        print(f"  missing: {result.get('missing_requirements')}")
        print(flush=True)
    conn.close()


if __name__ == "__main__":
    main()
