import { api } from '@/api.js'

/**
 * Background answer-upload queue (module-level, survives question
 * transitions and the completion screen).
 *
 * The interview moves to the next question the instant the candidate
 * clicks continue - exactly like a Google Form. The answer (text +
 * video blob) is uploaded here in the background, strictly in FIFO
 * order because the server validates question_index sequentially.
 *
 * Failures retry 3x with backoff, then surface as a non-blocking
 * "not saved - retry" chip. The candidate keeps answering regardless.
 */

let queue = []
let running = false

const listeners = new Set()
let status = { uploading: false, pending: 0, failed: [] }

function publish() {
  status = {
    uploading: running,
    pending: queue.length + (running ? 1 : 0),
    failed: [...failedJobs],
  }
  listeners.forEach((fn) => {
    try { fn(status) } catch { /* listener error must not break the queue */ }
  })
}

const failedJobs = [] // {label, retry}

function alreadyLanded(message) {
  // The server rejects an answer whose index has moved on - that means
  // a previous attempt already saved it. Treat as success.
  return /unexpected question index|already closed/i.test(String(message))
}

async function processQueue() {
  if (running) return
  running = true
  publish()
  while (queue.length) {
    const job = queue.shift()
    let attempt = 0
    for (;;) {
      try {
        await api.submitAnswer(job.token, job.form)
        // The answer has landed on the server - tell the caller so it can
        // refresh the interview state. This closes the race where the
        // optimistic refresh fired before the POST completed and the state
        // endpoint still served the same question.
        if (job.onUploaded) {
          try { job.onUploaded() } catch { /* never break the queue */ }
        }
        break
      } catch (e) {
        if (alreadyLanded(e.message)) {
          if (job.onUploaded) {
            try { job.onUploaded() } catch { /* never break the queue */ }
          }
          break
        }
        attempt += 1
        if (attempt >= 3) {
          failedJobs.push({
            label: job.label,
            retry: () => {
              const i = failedJobs.findIndex((f) => f.label === job.label)
              if (i >= 0) failedJobs.splice(i, 1)
              queue.push(job)
              publish()
              processQueue()
            },
          })
          publish()
          break
        }
        await new Promise((r) => setTimeout(r, 1500 * attempt))
      }
    }
    publish()
  }
  running = false
  publish()
}

export function enqueueAnswer(token, form, label, onUploaded) {
  queue.push({ token, form, label: label || 'answer', onUploaded })
  publish()
  processQueue()
}

export function subscribeUploadStatus(fn) {
  listeners.add(fn)
  fn(status)
  return () => listeners.delete(fn)
}

export function getUploadStatus() {
  return status
}
