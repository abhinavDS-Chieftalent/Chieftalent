// Display helpers for the candidate review page.

// The evaluator (app/services/evaluation_service.py) emits these per-answer keys. The page used to
// look for `relevance`, `correctness`, ... so only "overall" ever showed.
export const SCORE_KEYS = [
  ['content_score', 'content'],
  ['relevance_score', 'relevance'],
  ['communication_score', 'communication'],
  ['completeness_score', 'completeness'],
  ['overall_score', 'overall'],
]

const OBJECTIVE_TYPES = ['mcq', 'yes_no']

/** Tally of objective answers (multiple choice and yes/no): { total, correct }. */
export function objectiveCounts(answers) {
  const objective = (answers || []).filter((a) => OBJECTIVE_TYPES.includes(a.question_type))
  return { total: objective.length, correct: objective.filter((a) => a.is_correct).length }
}

// Model drift guard: the evaluator occasionally returns strengths/weaknesses (or ATS matched/missing)
// as one long string instead of a list. Rendering .map on it would crash the page, so coerce.
export function asList(v) {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x.trim())
  if (typeof v === 'string' && v.trim()) {
    const parts = v.split(/\n+|\s*•\s+/).map((p) => p.trim()).filter(Boolean)
    return parts.length ? parts : [v.trim()]
  }
  return []
}

export function initials(name) {
  return (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

export function fmtDate(iso) {
  if (!iso) return '-'
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  } catch {
    return iso
  }
}
