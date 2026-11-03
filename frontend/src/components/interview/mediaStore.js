// Shared MediaStream holder: permissions are granted ONCE in the guidelines
// phase (with a live preview so the candidate can test camera + mic), and
// the interview runner reuses the same stream - the browser never re-prompts
// mid-interview (the old re-prompt stole focus and false-triggered the
// tab-switch warning).

let stream = null

export function setStream(s) {
  // Stop any previous stream before replacing it.
  if (stream && stream !== s) {
    stream.getTracks().forEach((t) => t.stop())
  }
  stream = s
}

export function getStream() {
  return stream
}

export function stopStream() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop())
    stream = null
  }
}
