"""Per-candidate interview question generation.

Each shortlisted candidate gets their own question set, generated from:
  - the structured JD for the role (requirements, technologies)
  - the candidate's resume
  - the candidate's demonstrated experience level

The set is:
  Q1:  "Tell me about yourself in brief." - spoken, camera on, 5-minute target.
  Q2+: 20 multiple-choice questions split evenly:
       - 10 job-based: the skills and technologies the JD requires.
       - 10 resume-based: the skills and experience this candidate states.
         At least one uses an explicitly evidenced project/skill from the CV,
         when the CV contains that evidence.

The final situation-based camera question is intentionally NOT generated yet
(it will be added when its exact specification is provided).
"""

import json
import re
import threading
from datetime import datetime, timezone

from .. import db
from ..config import Config
from .nim_client import NIMClient, NIMError

# Hard budget for the guidelines-click safety net: a candidate never waits
# longer than this for AI question generation before the default set is used.
QUESTION_BUDGET_S = 90

GEN_SYSTEM = (
    "You are a technical interviewer who writes screening interview questions. "
    "You write clear, fair, job-relevant multiple-choice questions with exactly "
    "one correct option. You always respond with a single valid JSON object "
    "and nothing else."
)

INTRO_QUESTION = {
    "id": "intro_self",
    "type": "spoken",
    "text": "Tell me about yourself in brief.",
    "time_limit": 300,
    "require_camera": True,
    "require_mic": True,
    "guidance": (
        "Introduce your background, education, work experience and key skills. "
        "Be concise and relevant - a complete introduction within about 5 minutes "
        "is expected. Quality and relevance matter more than using the full time."
    ),
}


def _mcq(i, text, choices, correct):
    return {
        "id": f"mcq{i}",
        "type": "mcq",
        "text": text,
        "choices": choices,
        "correct_answer": correct,
        "time_limit": 45,
        "require_camera": False,
        "require_mic": False,
    }


# Last-resort fallback: role-independent professional MCQs. Used only when
# per-candidate generation failed BOTH at shortlist time AND at the
# guidelines-confirm retry - the interview must never break for the candidate.
DEFAULT_QUESTIONS = {
    "title": "Screening Interview",
    "experience_level": "",
    "questions": [dict(INTRO_QUESTION)] + [
        _mcq(1, "A stakeholder changes requirements mid-project. What is the most professional first step?",
             ["Document the change and assess its impact", "Ignore it until the deadline", "Tell them it is impossible", "Start rebuilding immediately"],
             "Document the change and assess its impact"),
        _mcq(2, "You disagree with a decision made by your team lead. What is the best approach?",
             ["Discuss your concerns privately with data to support your view", "Complain to other teammates", "Follow it silently while resenting it", "Refuse to do the work"],
             "Discuss your concerns privately with data to support your view"),
        _mcq(3, "A customer reports a bug you cannot reproduce. What should you do first?",
             ["Gather exact steps, environment details and logs from the customer", "Close it as 'not reproducible'", "Blame the customer's device", "Wait for it to happen again"],
             "Gather exact steps, environment details and logs from the customer"),
        _mcq(4, "What does prioritizing tasks by 'impact and effort' mean?",
             ["Doing high-impact, lower-effort items first", "Doing the easiest tasks first", "Doing whatever the loudest person wants", "Doing tasks in the order they arrived"],
             "Doing high-impact, lower-effort items first"),
        _mcq(5, "You missed a deadline. What is the professional response?",
             ["Inform stakeholders early, explain, and propose a revised plan", "Go silent until it is done", "Blame other teams", "Deliver untested work to appear on time"],
             "Inform stakeholders early, explain, and propose a revised plan"),
        _mcq(6, "In a report, which of these is the clearest way to present quarterly sales figures?",
             ["A labeled chart with a one-line takeaway", "A paragraph of every number", "A screenshot of a spreadsheet", "A verbal summary only"],
             "A labeled chart with a one-line takeaway"),
        _mcq(7, "A teammate takes credit for your work in a meeting. What is the best action?",
             ["Address it calmly with them one-on-one afterwards", "Interrupt and confront them publicly", "Report them to HR immediately", "Stop contributing to team work"],
             "Address it calmly with them one-on-one afterwards"),
        _mcq(8, "What is the main purpose of a daily stand-up meeting?",
             ["A short sync on progress, plans and blockers", "A status report to management", "A problem-solving session", "A planning session for the sprint"],
             "A short sync on progress, plans and blockers"),
        _mcq(9, "If 8 people each complete 5 tasks in a day, and the team must finish 240 tasks in 6 days, how many people are needed?",
             ["8", "10", "12", "6"],
             "8"),
        _mcq(10, "What best describes 'constructive feedback'?",
             ["Specific, actionable, and focused on the work rather than the person", "Only positive comments", "Harsh but honest criticism", "Feedback given publicly so everyone learns"],
             "Specific, actionable, and focused on the work rather than the person"),
        _mcq(11, "You find a mistake in a colleague's published report. What do you do?",
             ["Tell them privately so they can correct it", "Point it out in the next big meeting", "Fix it yourself without telling them", "Ignore it"],
             "Tell them privately so they can correct it"),
        _mcq(12, "Which is the most effective way to learn a new tool quickly?",
             ["Follow a small hands-on project end to end", "Read the entire documentation first", "Wait for formal training", "Avoid it until forced to use it"],
             "Follow a small hands-on project end to end"),
        _mcq(13, "A process you follow daily turns out to be inefficient. What is the best response?",
             ["Propose a measured improvement to your manager with pros and cons", "Quietly stop following it", "Criticize the process in team chats", "Keep following it without question"],
             "Propose a measured improvement to your manager with pros and cons"),
        _mcq(14, "What is the first thing to clarify when you receive a vague task?",
             ["The expected outcome and deadline", "Who created the task", "How others avoided this task", "Nothing, just start working"],
             "The expected outcome and deadline"),
        _mcq(15, "During a video call the client's audio keeps breaking. What is the most professional action?",
             ["Offer to continue by phone or resend a written summary", "Keep asking 'can you hear me?'", "End the call abruptly", "Speak louder"],
             "Offer to continue by phone or resend a written summary"),
        _mcq(16, "Which of these is the strongest sign of good written communication at work?",
             ["Clear structure, no jargon, and an obvious action or conclusion", "Long paragraphs showing full knowledge", "Impressive vocabulary", "Copying the style of senior managers"],
             "Clear structure, no jargon, and an obvious action or conclusion"),
        _mcq(17, "You are given two urgent tasks by two managers. What is the best move?",
             ["Ask both managers to agree on the priority order", "Do the easier one first", "Do the one from the senior manager", "Do both badly at the same time"],
             "Ask both managers to agree on the priority order"),
        _mcq(18, "What does 'ownership' mean in a work context?",
             ["Taking responsibility for outcomes, not just completing assigned steps", "Working alone without help", "Owning shares of the company", "Never admitting mistakes"],
             "Taking responsibility for outcomes, not just completing assigned steps"),
        _mcq(19, "A deadline is at risk a week out. When should you raise it?",
             ["As soon as the risk is identified", "On the deadline day", "After it is missed", "Never, just try harder"],
             "As soon as the risk is identified"),
        _mcq(20, "Which approach best builds long-term client trust?",
             ["Setting realistic expectations and consistently meeting them", "Promising everything the client asks", "Avoiding difficult conversations", "Frequent discounting"],
             "Setting realistic expectations and consistently meeting them"),
    ],
}

GEN_USER_TEMPLATE = """Create a screening interview for this candidate.

JOB (from the job description)
------------------------------
Title: {job_title}
Summary: {job_summary}

Core requirements:
{job_requirements}

CANDIDATE RESUME (the only source for resume-based questions and project claims)
-------------------------------------------------------------------------------
{cv_text}

CANDIDATE EXPERIENCE ASSESSMENT (counted from their resume)
------------------------------------------------------------
Band: {experience_band}
Evidence: {experience_evidence}

INSTRUCTIONS
------------
Write exactly 20 multiple-choice questions in two separate groups:
- jd_questions: exactly 10 questions based on the job description's core requirements.
- resume_questions: exactly 10 questions based on skills, tools, technologies, or
  experience explicitly present in this candidate's resume.

The total must remain 50% JD-based and 50% resume-based. Do not move questions
between groups to fill gaps. Give every question a source matching its group.

1. JD questions must test the technologies, concepts, and practices from the
   CORE requirements. Resume questions must test claims actually present in
   the resume; do not invent skills, projects, employers, or responsibilities.
2. At least one resume question must be a PROJECT-ANCHOR MCQ if the resume
   explicitly connects a named project with a skill/tool/technology. Make the
   connection explicit using this candidate's exact facts, but phrase the
   question naturally and vary its opening. For example:
   "In the <project> project, how would you use <skill> to <solve a relevant
   scenario>?"
   Include a project_reference object with project_name, skill, and evidence.
   evidence must be a short exact quote copied from the resume that contains
   BOTH the project name and the skill. The question text must name the same
   project and skill. Never infer a project/skill connection from separate
   resume sections. If no such explicit evidence exists, do not fabricate a
   project reference; still return 10 resume questions based on other claims.
3. Give the 10 resume questions 10 distinct, natural openings. Do not start
   every question with "Your resume mentions", "Your resume states", or other
   repeated resume-attribution boilerplate. Vary the entry point according to
   the evidence: a named project, a tool or skill, a role or task, a stated
   result, or a relevant scenario. Use different first four words in every
   resume question. At most one may begin with "Your resume". Keep project and
   skill references explicit where needed, without forcing the same sentence
   template onto each question.
4. Calibrate difficulty STRICTLY to the band above:
   - "student" (still in college or a fresh graduate with no work
     experience): BASIC questions that test UNDERSTANDING - what the core
     technologies are, why they are used, how they work conceptually, and
     small everyday scenarios. NOT trivia (never "what does X stand for"),
     NOT internals, NOT system design. Aim for about 14 basic and
     6 intermediate questions.
   - "early" (has an internship or at least 1 year of total experience in
     this field): PRACTICAL questions - using the tools day to day, small
     realistic tasks, reading small code snippets, simple debugging
     scenarios. Not dumbed down, not deep internals. Aim for about
     6 basic, 11 intermediate, and at most 3 advanced questions.
   - "mid": a mix of intermediate and scenario questions.
   - "senior": mostly scenario, design, and trade-off questions.
   The evidence may include experience outside this job's field - only
   experience relevant to this job's core requirements counts toward
   the band.
5. Each question must have exactly 4 options with exactly ONE correct answer.
   Distractors must be plausible, not absurd.
6. Keep each question under 45 words. Options under 12 words each.
7. Do not repeat the same concept more than twice across the 20 questions.
8. Do not ask about the candidate personally (no "tell me about a time" -
   those are asked separately). These are knowledge/applied-judgement MCQs.

Respond with ONLY this JSON object (no markdown, no commentary):
{{
  "experience_level": "<one line describing the level you inferred>",
  "jd_questions": [
    {{
      "id": "mcq1",
      "source": "jd",
      "text": "<question text>",
      "choices": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correct_answer": "<exact text of the correct option, copied character-for-character from choices>",
      "difficulty": "basic|intermediate|advanced",
      "tests": "<short: which JD skill/technology this question tests>",
      "project_reference": null
    }}
  ],
  "resume_questions": [
    {{
      "id": "mcq11",
      "source": "resume",
      "text": "<question text>",
      "choices": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "correct_answer": "<exact text of the correct option>",
      "difficulty": "basic|intermediate|advanced",
      "tests": "<short: which resume claim this question tests>",
      "project_reference": null
    }}
  ]
}}"""


# Context words that mark a line as education, so "2022 - present" under a
# degree never gets counted as work experience.
_EDU_WORDS = ("b.tech", "btech", "b.e", "bca", "mca", "m.tech", "bachelor",
              "master", "degree", "college", "university", "school", "education",
              "pursuing", "studying", "academic", "10th", "12th")

_STUDENT_MARKERS = (
    "pursuing", "final year", "final-year", "third year", "3rd year",
    "fourth year", "4th year", "second year", "2nd year", "currently studying",
    "expected graduation", "graduate in", "undergraduate", "student",
)


def _stated_total_months(text):
    """Largest total of experience stated in the resume, in months.

    Resumes state totals like "2 years of experience", "3+ yrs",
    "2 years 6 months", "18 months experience". We take the LARGEST stated
    total (the headline claim) rather than summing every mention.
    """
    best = 0
    for m in re.finditer(
        r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)[\s,]*(?:(?:and|&)?\s*(\d{1,2})\s*[\s-]*(?:months?|mos?))?",
        text,
    ):
        best = max(best, int(m.group(1)) * 12 + int(m.group(2) or 0))
    for m in re.finditer(r"(\d{1,3})\s*[\s-]\s*(?:months?|mos?)", text):
        best = max(best, int(m.group(1)))
    return best


def _ongoing_since_months(text):
    """Months for an ongoing role: "since 2021" / "Mar 2023 - Present".

    Only counted when the surrounding text does not look like education
    (a "pursuing B.Tech 2022 - present" line must not read as work).
    """
    now = datetime.now(timezone.utc)
    best = 0
    for m in re.finditer(r"(?:since|from)\s+(20\d{2})", text):
        ctx = text[max(0, m.start() - 80):m.end() + 20]
        if any(w in ctx for w in _EDU_WORDS):
            continue
        y = int(m.group(1))
        if 2000 <= y <= now.year:
            best = max(best, (now.year - y) * 12 + now.month)
    for m in re.finditer(r"(20\d{2})\s*[-\u2013to]+\s*(?:present|current|now)", text):
        ctx = text[max(0, m.start() - 80):m.end() + 20]
        if any(w in ctx for w in _EDU_WORDS):
            continue
        y = int(m.group(1))
        if 2000 <= y <= now.year:
            best = max(best, (now.year - y) * 12 + now.month)
    return best


def _assess_experience(cv_text):
    """Pick the difficulty band by COUNTING experience in the resume.

    Bands (product spec):
      "student"  - still in college / final year, no work experience:
                   basic questions that test understanding (not trivia).
      "early"    - internship, or 1+ year of total experience in the field:
                   practical questions, not dumbed down.
      "mid"      - 4+ years: mix of intermediate and scenario questions.
      "senior"   - 8+ years: scenario, design, and trade-off questions.

    When nothing is detectable we default LOW (student): a senior still passes
    a basic set, but a fresher unfairly fails a deep one.
    """
    text = (cv_text or "").lower()
    if not text.strip():
        return "student", "empty resume - defaulting to student-level questions"

    total = max(_stated_total_months(text), _ongoing_since_months(text))
    # "Seeking internship opportunities" is a student WISHING for one, not
    # having one - strip those phrases before the internship check.
    cleaned = re.sub(
        r"(seeking|looking for|in search of|searching for|open to)\s+"
        r"(an?\s+)?internships?(?:\s+opportunit(?:y|ies))?",
        " ",
        text,
    )
    has_internship = bool(re.search(r"\bintern(ship)?\b|\btrainee\b", cleaned))
    is_student = any(m in text for m in _STUDENT_MARKERS)

    if total >= 96:
        return "senior", f"resume states roughly {total} months (~{total // 12} years) of experience"
    if total >= 48:
        return "mid", f"resume states roughly {total} months (~{total // 12} years) of experience"
    if total >= 12:
        return "early", f"resume states roughly {total} months (~{total // 12} years) of experience"
    if has_internship:
        return "early", "internship or trainee experience mentioned in the resume"
    if is_student:
        return "student", "still in college or a fresh graduate (no work experience found)"
    return "student", "no work experience stated in the resume - defaulting to student level"


def build_messages(job_posting, cv_text):
    """Exact production prompt for question generation."""
    band, evidence = _assess_experience(cv_text)
    user = GEN_USER_TEMPLATE.format(
        job_title=job_posting.get("title", ""),
        job_summary=job_posting.get("summary", ""),
        job_requirements="\n".join(f"- {r}" for r in job_posting.get("requirements", [])) or "- (none)",
        cv_text=(cv_text or "")[:9000],
        experience_band=band,
        experience_evidence=evidence,
    )
    return [
        {"role": "system", "content": GEN_SYSTEM},
        {"role": "user", "content": user},
    ]


def _fold_text(value):
    """Normalize whitespace/case for matching quoted resume evidence."""
    return " ".join(str(value or "").casefold().split())


def _validated_project_reference(question, cv_text):
    """Keep a project anchor only when all claims are supported by one CV quote."""
    ref = question.get("project_reference")
    if not isinstance(ref, dict):
        return None
    project = str(ref.get("project_name", "") or "").strip()
    skill = str(ref.get("skill", "") or "").strip()
    evidence = str(ref.get("evidence", "") or "").strip()
    qtext = str(question.get("text", "") or "")
    if not project or not skill or not evidence:
        return None
    folded_evidence = _fold_text(evidence)
    folded_resume = _fold_text(cv_text)
    folded_question = _fold_text(qtext)
    if (folded_evidence not in folded_resume
            or _fold_text(project) not in folded_evidence
            or _fold_text(skill) not in folded_evidence
            or _fold_text(project) not in folded_question
            or _fold_text(skill) not in folded_question):
        return None
    return {"project_name": project, "skill": skill, "evidence": evidence}


def generate_question_set(nim, job_posting, cv_text):
    """Generate the intro plus 10 JD MCQs and 10 resume MCQs."""
    messages = build_messages(job_posting, cv_text)
    result = nim.chat_json(messages, temperature=0.4, max_tokens=16000)

    jd_questions = result.get("jd_questions") or []
    resume_questions = result.get("resume_questions") or []
    if len(jd_questions) != 10 or len(resume_questions) != 10:
        raise NIMError(
            "question generation must return exactly 10 JD questions and 10 resume questions "
            f"(got {len(jd_questions)} and {len(resume_questions)})"
        )

    mcqs = []
    for group, source, start_i in (
        (jd_questions, "jd", 1),
        (resume_questions, "resume", 11),
    ):
      for i, q in enumerate(group):
        if not isinstance(q, dict):
            raise NIMError(f"question generation returned an invalid {source} question")
        choices = [str(c) for c in (q.get("choices") or []) if str(c).strip()]
        text = str(q.get("text", "") or "").strip()
        if len(choices) != 4 or not text:
            raise NIMError(f"{source} question {i + 1} must have text and exactly 4 choices")
        # Models are sloppy about correct_answer: the prompt asks for the
        # exact choice text, but small models sometimes return a 0-based
        # index, a 1-based index, or a near-miss paraphrase. Dropping the
        # question on a strict text match is what made interview lengths
        # drift (18 / 19 / 20 questions). Accept every sane encoding; only
        # drop a question whose correct answer cannot be resolved at all.
        raw_correct = q.get("correct_answer")
        correct = ""
        if isinstance(raw_correct, int) and not isinstance(raw_correct, bool):
            if 0 <= raw_correct < len(choices):
                correct = choices[raw_correct]
        elif raw_correct is not None:
            s = str(raw_correct).strip()
            if s in choices:
                correct = s
            elif s.isdigit():
                idx = int(s)
                if idx < len(choices):
                    correct = choices[idx]
                elif 1 <= idx <= len(choices):
                    correct = choices[idx - 1]
            else:
                folded = {c.casefold(): c for c in choices}
                correct = folded.get(s.casefold(), "")
        if not correct:
            raise NIMError(f"{source} question {i + 1} has an unresolvable correct answer")
        project_reference = (
            _validated_project_reference(q, cv_text) if source == "resume" else None
        )
        if source == "resume" and q.get("project_reference") and not project_reference:
            raise NIMError(
                f"resume question {i + 1} has a project claim that does not match its quoted CV evidence"
            )
        mcqs.append({
            "id": f"mcq{start_i + i}",
            "type": "mcq",
            "source": source,
            "text": text,
            "choices": choices,
            "correct_answer": correct,
            "time_limit": 45,
            "require_camera": False,
            "require_mic": False,
            "difficulty": str(q.get("difficulty", "")),
            "tests": str(q.get("tests", "")),
            "project_reference": project_reference,
        })
    if len([q for q in mcqs if q["source"] == "jd"]) != 10 or len(
        [q for q in mcqs if q["source"] == "resume"]
    ) != 10:
        raise NIMError("question generation failed the 50/50 JD/resume balance check")

    project_questions = [q for q in mcqs if q["project_reference"]]
    if not project_questions:
        # Do not invent a project claim. The prompt requests one every time;
        # this warning flags CVs/models where no verifiable anchor was returned.
        print("[questions] no verifiable project/skill pair found in the resume; "
              "kept all 10 resume-based questions without fabricating project context")

    # Difficulty audit: the band rules in the prompt set a target mix. If the
    # model drifts (e.g. hands "advanced" questions to a student), log it so
    # drift is visible in logs without failing the candidate's interview.
    band, _ = _assess_experience(cv_text)
    diffs = [str(q.get("difficulty", "")).lower() for q in mcqs]
    n_basic = sum(1 for d in diffs if d == "basic")
    n_inter = sum(1 for d in diffs if d == "intermediate")
    n_adv = sum(1 for d in diffs if d == "advanced")
    if band == "student" and (n_adv > 0 or n_basic < 10):
        print(f"[questions] AUDIT drift: student band got basic={n_basic} "
              f"intermediate={n_inter} advanced={n_adv}")
    if band == "early" and n_adv > 4:
        print(f"[questions] AUDIT drift: early band got advanced={n_adv} "
              f"(basic={n_basic} intermediate={n_inter})")

    return {
        "title": f"{job_posting.get('title', 'Role')} - Screening Interview",
        "experience_level": str(result.get("experience_level", "") or ""),
        "questions": [dict(INTRO_QUESTION)] + mcqs,
    }


# Tracks in-flight generation per interview so a guidelines-click never starts
# a duplicate AI call, and a background kick (at OTP-confirm) plus a click-time
# wait share the same single generation.
_gen_threads = {}
_gen_lock = threading.Lock()


def _run_generation(interview_id, result):
    """Do the AI call and store the set on success. Never stores defaults."""
    try:
        interview = db.one("SELECT * FROM interviews WHERE id=?", (interview_id,))
        if not interview:
            return
        candidate = db.one("SELECT * FROM candidates WHERE id=?", (interview["candidate_id"],))
        posting_path = Config.DATA_DIR / "job_postings" / f"{interview['role']}.json"
        if posting_path.exists() and candidate and candidate["cv_text"]:
            posting = json.loads(posting_path.read_text(encoding="utf-8"))
            nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
            qset = generate_question_set(nim, posting, candidate["cv_text"])
            db.execute(
                "UPDATE interviews SET question_set=? WHERE id=?",
                (json.dumps(qset, ensure_ascii=False), interview_id),
            )
            result["qset"] = qset
    except Exception as e:  # noqa: BLE001 - caller retries; never store defaults
        print(f"[questions] generation failed for interview {interview_id}: {e}")


def ensure_question_set(interview_id, wait_s=None):
    """Return the interview's AI question set, generating it if missing.

    Generation runs in a single background thread per interview. It is kicked
    off early (at OTP-confirm) so the set is ready by the continue-to-interview
    click. With wait_s=None this only ensures generation is running and returns
    immediately. With a wait budget (the guidelines-click) it waits for the
    in-flight generation and returns the set if ready, else None.

    It NEVER stores or returns the pre-coded DEFAULT_QUESTIONS: the candidate
    must always get AI-generated questions, so a not-ready state is reported
    (and retried) rather than silently swapped for generic questions.
    """
    interview = db.one("SELECT * FROM interviews WHERE id=?", (interview_id,))
    if not interview:
        raise ValueError(f"interview {interview_id} not found")
    if interview.get("question_set"):
        return json.loads(interview["question_set"])

    with _gen_lock:
        entry = _gen_threads.get(interview_id)
        if entry and entry[0].is_alive():
            t, result = entry
        else:
            result = {}
            t = threading.Thread(target=_run_generation, args=(interview_id, result), daemon=True)
            _gen_threads[interview_id] = (t, result)
            t.start()

    if wait_s is None:
        return None  # background kick: do not block the caller

    t.join(wait_s)
    if t.is_alive():
        return None  # still generating; the caller retries shortly
    interview = db.one("SELECT question_set FROM interviews WHERE id=?", (interview_id,))
    if interview and interview.get("question_set"):
        return json.loads(interview["question_set"])
    return result.get("qset")  # None if generation failed
