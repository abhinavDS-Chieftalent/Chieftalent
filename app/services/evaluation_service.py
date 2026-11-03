"""Interview evaluation service.

Objective (Yes/No) answers are scored deterministically in Python against the
configured correct answers - the AI never invents them. Spoken answers are
evaluated by the NIM LLM against the question and a rubric. The final score
blends both categories with configurable weights. The AI recommends; the
human HR reviewer decides.
"""

import json

from .. import db
from ..config import Config
from . import interview_service
from .nim_client import NIMClient, NIMError

EVAL_SYSTEM = (
    "You are an experienced, fair-minded interview evaluator for hiring. You evaluate "
    "a candidate's real spoken-answer transcripts against the questions asked. You are "
    "evidence-based: you evaluate only what the candidate actually said, never invent "
    "or assume answers. You always respond with a single valid JSON object and nothing "
    "else."
)

EVAL_USER_TEMPLATE = """Evaluate these spoken interview answers for the role of {role_title}.

Each item contains the question, the candidate's transcript, the time limit,
and how long the candidate actually used.

{answers_block}

Score with real-world fairness, not textbook harshness:
- These transcripts come from automatic speech recognition in a live, timed,
  camera-on interview. Ignore transcription artifacts (missing punctuation,
  broken words, run-on text) - judge what the candidate meant to say, not the
  transcript formatting.
- Candidates are often nervous in real interviews. Minor hesitation, filler
  words, or a lost train of thought should NOT cost significant marks if the
  substance of the answer is there.
- Judge like a senior interviewer who has hired real people: would this
  answer satisfy a working professional in a real interview? Small gaps in
  wording or structure that a normal person would fix in conversation are
  not weaknesses.
- Deduct meaningfully only for: not addressing the question at all, factually
  wrong substance, or an answer so disorganized that no point comes across.
- Never score 0 unless the candidate said nothing of relevance.

For EACH question score 0-10:
- content_score: correctness and depth of the answer's substance
- relevance_score: does it actually address the question asked
- communication_score: clarity, structure, articulation
- completeness_score: did they cover what the question needed within the time
- overall_score: your overall judgement for that answer (0-10)
Also give one line of feedback per answer, a short overall summary,
and lists of strengths and weaknesses.

Special case - the self-introduction question ("Tell me about yourself"):
- The target is a concise, complete introduction in about 5 minutes.
- Judge RELEVANCE, CLARITY, COMPLETENESS and COMMUNICATION - whether they
  actually described their background, education, experience and key skills.
- Do NOT reward length: a candidate who uses the full 5 minutes while saying
  very little scores LOWER than one who gives a concise, relevant, complete
  introduction in less time. Equally, do not penalize a candidate merely for
  finishing early if the introduction was complete and relevant.

Respond with ONLY this JSON object (no markdown, no commentary):
{{
  "question_scores": [
    {{"question_id": "<id>", "content_score": <0-10>, "relevance_score": <0-10>,
      "communication_score": <0-10>, "completeness_score": <0-10>,
      "overall_score": <0-10>, "feedback": "<one line>"}}
  ],
  "summary": "<2-4 sentences>",
  "strengths": ["..."],
  "weaknesses": ["..."]
}}"""


def _as_str_list(v):
    """Model drift guard: strengths/weaknesses must be lists of strings. The
    LLM occasionally returns a single string, which crashes the HR detail
    page's list rendering. Coerce to a list before storing."""
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str) and v.strip():
        return [v.strip()]
    return []


def evaluate_interview(interview_id):
    """Run the full evaluation for a completed interview. Returns the result dict."""
    interview = db.one("SELECT * FROM interviews WHERE id=?", (interview_id,))
    if not interview:
        raise ValueError(f"interview {interview_id} not found")
    if interview["status"] != "completed":
        raise ValueError(f"interview {interview_id} is not completed (status={interview['status']})")

    db.execute("UPDATE interviews SET status='evaluation_pending' WHERE id=?", (interview_id,))
    db.execute(
        "UPDATE candidates SET status='evaluation_pending', updated_at=? WHERE id=?",
        (db.now_iso(), interview["candidate_id"]),
    )

    answers = interview_service.list_answers(interview_id)
    objective = [a for a in answers if a["question_type"] in ("yes_no", "mcq")]
    spoken = [a for a in answers if a["question_type"] == "spoken"]

    # Category A: deterministic objective scoring.
    obj_total = len(objective)
    obj_correct = sum(1 for a in objective if a["is_correct"] == 1)
    obj_accuracy = round(100.0 * obj_correct / obj_total, 1) if obj_total else 0.0

    # Category B: AI evaluation of spoken answers.
    ai_result = {"question_scores": [], "summary": "", "strengths": [], "weaknesses": []}
    if spoken:
        ai_result = _evaluate_spoken(interview, spoken)

    qscores = ai_result.get("question_scores") or []
    spoken_scores = []
    for s in qscores:
        try:
            spoken_scores.append(float(s.get("overall_score", 0)))
        except (TypeError, ValueError):
            pass
    spoken_avg = round(sum(spoken_scores) / len(spoken_scores), 2) if spoken_scores else 0.0

    # Final blend (configurable weights).
    if obj_total and spoken:
        overall = Config.OBJECTIVE_WEIGHT * obj_accuracy + Config.SPOKEN_WEIGHT * (spoken_avg * 10)
    elif obj_total:
        overall = obj_accuracy
    else:
        overall = spoken_avg * 10
    overall = round(overall, 1)

    if overall >= Config.PASS_THRESHOLD:
        recommendation = "recommend_progress"
    elif overall >= Config.BORDERLINE_THRESHOLD:
        recommendation = "review_required"
    else:
        recommendation = "recommend_reject"

    result = {
        "objective_questions": {
            "total": obj_total,
            "correct": obj_correct,
            "accuracy": obj_accuracy,
        },
        "spoken_questions": {"count": len(spoken), "average_score": spoken_avg},
        "overall_interview_score": overall,
        "recommendation": recommendation,
        "summary": str(ai_result.get("summary", "") or ""),
        "strengths": _as_str_list(ai_result.get("strengths")),
        "weaknesses": _as_str_list(ai_result.get("weaknesses")),
        "question_analysis": qscores,
        "final_status": "review_required",
    }

    db.execute(
        """INSERT INTO evaluations
           (interview_id, result_json, objective_total, objective_correct, objective_accuracy,
            spoken_avg, overall_score, recommendation, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(interview_id) DO UPDATE SET
             result_json=excluded.result_json, objective_total=excluded.objective_total,
             objective_correct=excluded.objective_correct,
             objective_accuracy=excluded.objective_accuracy, spoken_avg=excluded.spoken_avg,
             overall_score=excluded.overall_score, recommendation=excluded.recommendation,
             created_at=excluded.created_at""",
        (interview_id, json.dumps(result), obj_total, obj_correct, obj_accuracy,
         spoken_avg, overall, recommendation, db.now_iso()),
    )
    db.execute("UPDATE interviews SET status='evaluation_completed' WHERE id=?", (interview_id,))
    db.execute(
        "UPDATE candidates SET status='evaluation_completed', updated_at=? WHERE id=?",
        (db.now_iso(), interview["candidate_id"]),
    )
    return result


def build_messages(role_title, spoken):
    """Exact production prompt for the spoken-answer evaluation."""
    blocks = []
    for a in spoken:
        transcript = a["transcript"] or a["answer_text"] or "(no transcript provided)"
        blocks.append(
            f"Question ID: {a['question_id']}\n"
            f"Question: {a['question_text']}\n"
            f"Time limit: {a['time_limit']}s | Time used: {a['time_used']}s"
            f"{' | OVERTIME' if a['overtime'] else ''}\n"
            f"Transcript: {transcript}"
        )
    return [
        {"role": "system", "content": EVAL_SYSTEM},
        {"role": "user", "content": EVAL_USER_TEMPLATE.format(
            role_title=role_title, answers_block="\n\n---\n\n".join(blocks))},
    ]


def _evaluate_spoken(interview, spoken):
    role_title = interview["role"].replace("_", " ").title()
    # Prefer the real job title from the posting (JD-created roles).
    try:
        posting_path = Config.DATA_DIR / "job_postings" / f"{interview['role']}.json"
        if posting_path.exists():
            posting = json.loads(posting_path.read_text(encoding="utf-8"))
            role_title = posting.get("title") or role_title
    except Exception:  # noqa: BLE001 - title is cosmetic, never fail on it
        pass
    messages = build_messages(role_title, spoken)
    nim = NIMClient(Config.NIM_BASE_URL, Config.NIM_API_KEY, Config.NIM_MODEL)
    try:
        return nim.chat_json(messages, temperature=0.0, max_tokens=8000)
    except NIMError as e:
        return {"question_scores": [], "summary": f"AI evaluation failed: {e}",
                "strengths": [], "weaknesses": []}
