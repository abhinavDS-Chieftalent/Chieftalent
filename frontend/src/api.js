// Small fetch wrapper. All admin API calls go through here.
async function req(path, options = {}) {
  // Bounded request: a hung connection must surface as an error, not a
  // spinner that never ends (candidates on flaky networks).
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000)
  try {
    const res = await fetch(path, { ...options, signal: controller.signal })
    if (res.status === 401 && path.startsWith('/api/admin')) {
      // Session expired or not logged in - send the user to the login page.
      window.location.assign('/login')
      throw new Error('authentication required')
    }
    if (!res.ok) {
      let detail = `${res.status}`
      try {
        const body = await res.json()
        // New error shape: {error: {code, message}}; legacy shape: {error: "..."}.
        detail = body?.error?.message || body?.error || detail
      } catch { /* non-JSON */ }
      throw new Error(detail)
    }
    return res.json()
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('request timed out')
    throw e
  } finally {
    clearTimeout(timeout)
  }
}

export const api = {
  // auth
  login: (email, password) => req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }),
  logout: () => req('/api/auth/logout', { method: 'POST' }),
  me: () => req('/api/auth/me'),
  forgotPassword: (email) => req('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  }),

  // admin
  overview: () => req('/api/admin/overview'),
  candidate: (id) => req(`/api/admin/candidate/${id}`),
  processRole: (role) => req(`/api/admin/process/${role}`, { method: 'POST' }),
  uploadCvs: (role, files) => {
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    return req(`/api/admin/upload/${role}`, { method: 'POST', body: fd })
  },
  review: (id, decision, notes) => req(`/api/admin/candidate/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes }),
  }),
  deleteCandidate: (id) => req(`/api/admin/candidate/${id}`, { method: 'DELETE' }),
  shortlistCandidate: (id) => req(`/api/admin/candidate/${id}/shortlist`, { method: 'POST' }),
  retakeCandidate: (id) => req(`/api/admin/candidate/${id}/retake`, { method: 'POST' }),
  deleteJob: (role) => req(`/api/admin/job/${role}`, { method: 'DELETE' }),
  reevaluate: (id) => req(`/api/admin/candidate/${id}/reevaluate`, { method: 'POST' }),

  // job / JD management
  listJobs: () => req('/api/admin/jobs'),
  createJdFromText: (raw_text) => req('/api/admin/jd', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text }),
  }),
  uploadJdFile: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return req('/api/admin/jd/upload', { method: 'POST', body: fd })
  },
  jdPdfUrl: (role) => `/api/admin/jd/${role}/pdf`,

  // candidate-facing interview (token-based, public)
  interviewState: (token) => req(`/api/interview/${token}/state`),
  requestVerification: (token) => req(`/api/interview/${token}/verify/request`, {
    method: 'POST',
  }),
  confirmVerification: (token, code) => req(`/api/interview/${token}/verify/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }),
  submitDetails: (token, details) => req(`/api/interview/${token}/details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details),
  }),
  acceptGuidelines: (token) => req(`/api/interview/${token}/guidelines`, {
    method: 'POST',
    // In the rare case questions must be (re)generated at this click, the
    // server may take a couple of minutes - the button shows "Starting…".
    timeoutMs: 180000,
  }),
  reportTabWarning: (token) => req(`/api/interview/${token}/tab-warning`, { method: 'POST' }),
  submitAnswer: (token, formData) => req(`/api/interview/${token}/answer`, {
    method: 'POST',
    body: formData,
    timeoutMs: 180000, // background video uploads on slow connections
  }),
}
