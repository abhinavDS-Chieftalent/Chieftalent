// Pure filtering and sorting for the candidates table. State lives in the URL (?status=&ats=&iv=&sort=)
// so a filtered view can be bookmarked and shared. The role filter (?role=) and the tabs are applied before this.

export const ANY = 'any'
export const FILTER_KEYS = ['status', 'ats', 'iv', 'sort']
export const DEFAULTS = { status: ANY, ats: ANY, iv: ANY, sort: 'newest' }

export const atsOptions = (threshold = 70) => [
  [ANY, 'Any ATS score'],
  ['pass', `At or above the threshold (${threshold})`],
  ['fail', `Below the threshold (${threshold})`],
  ['80+', '80 and above'],
  ['none', 'Not scored'],
]

export const IV_OPTIONS = [
  [ANY, 'Any interview score'],
  ['80+', '80 and above'],
  ['60-79', '60 to 79'],
  ['below-60', 'Below 60'],
  ['none', 'Not interviewed'],
]

export const SORT_OPTIONS = [
  ['newest', 'Newest first'],
  ['ats-desc', 'ATS score, high to low'],
  ['ats-asc', 'ATS score, low to high'],
  ['iv-desc', 'Interview score, high to low'],
  ['name', 'Name, A to Z'],
]

const score = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v))

const ATS_TESTS = {
  pass: (s, t) => s != null && s >= t,
  fail: (s, t) => s != null && s < t,
  '80+': (s) => s != null && s >= 80,
  none: (s) => s == null,
}
const IV_TESTS = {
  '80+': (s) => s != null && s >= 80,
  '60-79': (s) => s != null && s >= 60 && s < 80,
  'below-60': (s) => s != null && s < 60,
  none: (s) => s == null,
}

// Missing scores always sort last, whichever direction is chosen.
const byNumber = (get, dir) => (a, b) => {
  const x = get(a)
  const y = get(b)
  if (x == null && y == null) return 0
  if (x == null) return 1
  if (y == null) return -1
  return dir === 'asc' ? x - y : y - x
}

const COMPARATORS = {
  'ats-desc': byNumber((c) => score(c.ats_score), 'desc'),
  'ats-asc': byNumber((c) => score(c.ats_score), 'asc'),
  'iv-desc': byNumber((c) => score(c.interview_score), 'desc'),
  name: (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
}

/** rows: candidates already narrowed by role and tab. Returns a new array. */
export function applyFilters(rows, filters, threshold = 70) {
  let out = rows
  if (filters.status && filters.status !== ANY) out = out.filter((c) => c.status === filters.status)
  if (ATS_TESTS[filters.ats]) out = out.filter((c) => ATS_TESTS[filters.ats](score(c.ats_score), threshold))
  if (IV_TESTS[filters.iv]) out = out.filter((c) => IV_TESTS[filters.iv](score(c.interview_score)))
  const cmp = COMPARATORS[filters.sort]
  return cmp ? [...out].sort(cmp) : out // "newest" keeps the order the API sends (newest first)
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)

/** Statuses present in rows, as [value, "Interview sent (6)"], most common first. */
export function statusOptions(rows) {
  const counts = new Map()
  for (const c of rows) counts.set(c.status, (counts.get(c.status) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([status, n]) => [status, `${capitalise(String(status).replace(/_/g, ' '))} (${n})`])
}

export function readFilters(params) {
  const pick = (key, allowed) => {
    const v = params.get(key)
    return v && (allowed === null || allowed.includes(v)) ? v : DEFAULTS[key]
  }
  return {
    status: pick('status', null), // validated against the live options by the page
    ats: pick('ats', atsOptions().map(([v]) => v)),
    iv: pick('iv', IV_OPTIONS.map(([v]) => v)),
    sort: pick('sort', SORT_OPTIONS.map(([v]) => v)),
  }
}

export const isFiltered = (f) => FILTER_KEYS.some((k) => f[k] !== DEFAULTS[k])
