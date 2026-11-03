import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleNotch, Warning, ArrowsClockwise, CaretLeft } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useProctoring } from './useProctoring'
import { triggerFullscreen } from '@/vendor/react-proctoring'
import { getStream } from './mediaStore'
import { enqueueAnswer, subscribeUploadStatus } from './uploadQueue'

function fmt(s) {
  s = Math.max(0, Math.floor(s))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function InterviewRunner({ token, state, onDone, onAborted }) {
  // Local navigation: viewIndex null = follow the server's current question;
  // a number = the candidate navigated back / clicked a navigator box to
  // review or change an earlier answer. Answers for earlier questions are
  // upserted server-side without advancing the interview.
  const [viewIndex, setViewIndex] = useState(null)
  const viewedIdx = viewIndex ?? state.index
  const isRevisit = viewedIdx < state.index
  const q = isRevisit ? (state.questions?.[viewedIdx] ?? state.question) : state.question
  const [answer, setAnswer] = useState('')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [deadlineLeft, setDeadlineLeft] = useState(state.deadline_seconds ?? 1800)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [recording, setRecording] = useState(false)
  const [upload, setUpload] = useState({ uploading: false, pending: 0, failed: [] })
  const [sttFailed, setSttFailed] = useState(false)
  // Indices answered in THIS session - the server's answered list lags
  // while uploads are in the background queue, so the navigator colors
  // boxes from both.
  const [localAnswered, setLocalAnswered] = useState(() => new Set())
  const answeredSet = useMemo(
    () => new Set([...(state.answered || []), ...localAnswered]),
    [state.answered, localAnswered]
  )

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recogRef = useRef(null)
  const pipRef = useRef(null)
  const bigRef = useRef(null)
  const autoSubmittedRef = useRef(false)
  const submittedRef = useRef(false)
  const lastQIdRef = useRef('')
  const answerRef = useRef('')
  const transcriptRef = useRef('')

  answerRef.current = answer
  transcriptRef.current = transcript

  // Background upload status (queue lives outside the component)
  useEffect(() => subscribeUploadStatus(setUpload), [])

  const { warnings, violation, dismissViolation, aborted } = useProctoring(token, true)

  // Fullscreen gate. The proctoring's "left fullscreen" detector only arms
  // after it has SEEN fullscreen once, so a mid-interview refresh (which drops
  // fullscreen and resets that memory) would otherwise run unproctored in a
  // normal window. Block with a gate until the candidate re-enters fullscreen.
  // requestFullscreen needs a user gesture, hence the button.
  const fsActive = () =>
    !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    )
  const [isFs, setIsFs] = useState(fsActive())
  const [gateReady, setGateReady] = useState(false)
  useEffect(() => {
    // Grace period so the guidelines -> interview auto-fullscreen transition
    // doesn't flash the gate before fullscreen engages.
    const t = setTimeout(() => setGateReady(true), 1600)
    const onFs = () => setIsFs(fsActive())
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => {
      clearTimeout(t)
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs)
    }
  }, [])
  const needsFullscreen = gateReady && !isFs && !violation && !aborted

  useEffect(() => {
    if (aborted) onAborted()
  }, [aborted, onAborted])

  // ---- Media: reuse the stream granted in the guidelines phase ----
  // (no re-prompt mid-interview; the old re-prompt stole focus and
  // false-triggered the tab warning). Fallback: mid-interview refresh.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const existing = getStream()
      if (existing) {
        streamRef.current = existing
        setMediaReady(true)
        if (pipRef.current) pipRef.current.srcObject = existing
        if (bigRef.current) bigRef.current.srcObject = existing
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 1280, height: 720 },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        setMediaReady(true)
        if (pipRef.current) pipRef.current.srcObject = stream
        if (bigRef.current) bigRef.current.srcObject = stream
      } catch {
        setMediaError(
          'Camera and microphone access is required for this interview. ' +
          'Please allow access in your browser and reload the page.'
        )
      }
    })()
    return () => {
      cancelled = true
      // Do NOT stop the stream here - it is owned by mediaStore and may be
      // reused by the next question / the completion screen cleanup.
      streamRef.current = null
    }
  }, [])

  // Attach the shared camera stream to a video element at MOUNT time only.
  // Reassigning srcObject on every question transition made the PiP flash
  // black for a moment on each question - the stream never changes, so it
  // must be attached exactly once per element.
  const attachPip = (el) => {
    pipRef.current = el
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current
    }
  }
  const attachBig = (el) => {
    bigRef.current = el
    if (el && streamRef.current && el.srcObject !== streamRef.current) {
      el.srcObject = streamRef.current
    }
  }

  // ---- Per-question state reset ----
  // The selected option and the spoken transcript must NEVER leak into the
  // next question: a stale selection makes canSubmit true immediately and
  // can be submitted as the next question's answer (real scoring bug seen
  // in production data - three consecutive MCQs with the same answer_text).
  useEffect(() => {
    setAnswer('')
    setTranscript('')
    setInterim('')
    // Revisiting an answered question: prefill their saved answer so they
    // can review it (and change it) instead of starting from blank.
    if (isRevisit) {
      const saved = state.answers?.[viewedIdx] || ''
      if (q.type === 'spoken') setTranscript(saved)
      else setAnswer(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  // ---- Recording + STT for spoken questions ----
  useEffect(() => {
    if (q.type !== 'spoken' || !streamRef.current) return
    let cancelled = false

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'
    // 500 kbps video is plenty for proctoring review and keeps a 2-minute
    // answer around ~8 MB instead of 30+ MB, so background uploads are fast.
    const rec = new MediaRecorder(streamRef.current, {
      mimeType: mime,
      videoBitsPerSecond: 500000,
      audioBitsPerSecond: 48000,
    })
    chunksRef.current = []
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
    rec.start(500)
    recorderRef.current = rec
    setRecording(true)

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      const recog = new SR()
      recog.continuous = true
      recog.interimResults = true
      // Indian English model: dramatically better recognition of Indian
      // accents and Indian names than the US locale.
      recog.lang = 'en-IN'
      // High-water mark fix: e.results accumulates ALL results and is re-sent
      // on every event. Only process from e.resultIndex onward and track the
      // last finalized index, so a final chunk can never be appended twice
      // (the old bug looped the first words spoken).
      let lastFinal = -1
      let consecutiveErrors = 0
      let fatalError = false
      recog.onresult = (e) => {
        // A real result proves recognition is working - clear any failure state.
        consecutiveErrors = 0
        setSttFailed(false)
        let final = ''
        let live = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            if (i > lastFinal) {
              final += e.results[i][0].transcript + ' '
              lastFinal = i
            }
          } else {
            live += e.results[i][0].transcript
          }
        }
        if (final) {
          setTranscript((t) => (t ? t + ' ' : '') + final.trim())
          setInterim('')
        } else if (live) {
          setInterim(live)
        }
      }
      // Speech recognition can die silently (mic shared with the recorder,
      // a network-dependent speech service, or a no-speech timeout). Without
      // an onerror handler the candidate speaks and nothing appears - the
      // "first question takes no voice input" bug. Recover from transient
      // errors; only show the typed-answer fallback on a fatal error or when
      // errors keep coming with no successful result. Silent pauses (onend
      // with no error) are normal and must NOT flash the warning.
      recog.onerror = (e) => {
        const err = e && e.error
        if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
          fatalError = true
          setSttFailed(true)
          return // do not restart a fatal error; the candidate types instead
        }
        // transient (no-speech, network, aborted): restart after a short pause,
        // but if they stack up with no successful result the service is
        // effectively down - offer the typed-answer path.
        consecutiveErrors += 1
        if (consecutiveErrors >= 3) setSttFailed(true)
        setTimeout(() => {
          if (cancelled || recogRef.current !== recog) return
          lastFinal = -1
          try { recog.start() } catch {}
        }, 400)
      }
      recog.onend = () => {
        if (cancelled || recogRef.current !== recog || fatalError) return
        setTimeout(() => {
          if (cancelled || recogRef.current !== recog) return
          lastFinal = -1 // new session -> result indices restart at 0
          try { recog.start() } catch {}
        }, 200)
      }
      try {
        recog.start()
        recogRef.current = recog
      } catch {
        setSttFailed(true)
      }
    } else {
      // Browser has no SpeechRecognition at all (e.g. Firefox): the candidate
      // must still be able to answer, so offer the typed-answer path.
      setSttFailed(true)
    }

    return () => {
      cancelled = true
      try { recogRef.current?.stop() } catch {}
      recogRef.current = null
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop() } catch {}
      }
      recorderRef.current = null
      setRecording(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id])

  // ---- Submit: instant transition, background upload ----
  // Google-Forms model: the answer is snapshotted and uploaded by the
  // background queue; the next question appears immediately. Nothing
  // blocks on the network.
  const submit = useCallback(() => {
    // One in-flight submit per question: the optimistic refresh below can
    // race the upload and re-serve the same question; a second click must
    // not enqueue a duplicate job for it.
    if (submittedRef.current) return
    submittedRef.current = true

    const form = new FormData()
    form.append('question_index', String(viewedIdx))
    form.append('answer_text', q.type === 'spoken' ? transcriptRef.current : answerRef.current)
    // Only spoken questions have a transcript. Sending the previous
    // question's transcript here smeared the intro answer across every
    // MCQ row in the HR review page.
    if (q.type === 'spoken') form.append('transcript', transcriptRef.current)
    const label = `Q${viewedIdx + 1}`
    setLocalAnswered((prev) => new Set(prev).add(viewedIdx))

    // When the upload lands, refresh the state again - the optimistic
    // refresh below may have run before the POST completed, in which case
    // the server still served this same question.
    const refresh = () => onDone()

    const rec = recorderRef.current
    if (q.type === 'spoken' && rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
        if (blob.size) form.append('video', blob, 'answer.webm')
        enqueueAnswer(token, form, label, refresh)
      }
      try { rec.stop() } catch { enqueueAnswer(token, form, label, refresh) }
    } else {
      enqueueAnswer(token, form, label, refresh)
    }

    // Move on immediately - the upload continues in the background.
    // Snap back to the server's current question (for revisits this returns
    // the candidate to where they were; for the current question it is a
    // no-op that keeps following the server).
    setViewIndex(null)
    onDone()
  }, [viewedIdx, q.type, token, onDone])

  // Server-side aborts/deadline must reach an already-open page: poll the
  // interview state periodically (cheap DB read) so a terminated interview
  // flips to the terminated screen instead of letting the candidate type
  // into a dead interview.
  useEffect(() => {
    if (aborted) return
    const id = setInterval(() => { onDone() }, 30000)
    return () => clearInterval(id)
  }, [aborted, onDone])

  const submitRef = useRef(submit)
  submitRef.current = submit

  // ---- Single countdown: the 30-minute interview deadline ----
  // Per-question timers are gone by design - only the overall deadline
  // exists. At 0 it auto-submits the in-progress answer; the server then
  // completes the interview and the candidate sees the time-up screen.
  useEffect(() => {
    if (q.id !== lastQIdRef.current) {
      lastQIdRef.current = q.id
      autoSubmittedRef.current = false
      submittedRef.current = false
    }
  }, [q.id])

  useEffect(() => {
    if (deadlineLeft <= 0) {
      if (!autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        submitRef.current()
      }
      return
    }
    const t = setTimeout(() => setDeadlineLeft((d) => Math.max(0, d - 1)), 1000)
    return () => clearTimeout(t)
  }, [deadlineLeft])

  const isObjective = q.type === 'mcq' || q.type === 'yes_no'
  const choices = q.choices?.length ? q.choices : ['Yes', 'No']
  const canSubmit = isObjective ? !!answer : true

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Deadline bar */}
      <div className="mb-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Question {viewedIdx + 1} of {state.total}
          {isRevisit && <span className="text-pass"> (review)</span>}
        </span>
        <div className="flex items-center gap-3">
          {(upload.uploading || upload.pending > 0) && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleNotch size={12} className="animate-spin" />
              Saving answer in background…
            </span>
          )}
          {upload.failed.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.retry}
              className="flex items-center gap-1.5 rounded-md border border-[#e8cf9b] bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn transition-colors hover:bg-[#ffe7b8]"
            >
              <ArrowsClockwise size={12} /> {f.label} not saved. Retry
            </button>
          ))}
          <span className={`num font-medium ${deadlineLeft <= 120 ? 'text-fail' : ''}`}>
            Interview time left: {fmt(deadlineLeft)}
          </span>
        </div>
      </div>

      {/* Progress segments */}
      <div className="mb-6 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: state.total }).map((_, i) => (
          <div
            key={i}
            className={`seg ${i < state.index ? 'done' : ''} ${i === state.index ? 'current' : ''}`}
          />
        ))}
      </div>

      {/* Question navigator (desktop): emerald = answered, ring = the
          question on screen, dimmed = not served yet. Clicking an answered
          box navigates back so the candidate can review or change that
          answer; the change is saved without advancing the interview. */}
      {state.questions?.length > 1 && (
        <nav
          aria-label="Question navigator"
          className="fixed right-5 top-1/2 z-30 hidden -translate-y-1/2 flex-col rounded-lg border border-border bg-card p-3 xl:flex"
        >
          <span className="mb-2 text-center text-xs font-semibold text-muted-foreground">Questions</span>
          <div className="grid grid-cols-5 gap-1.5">
            {state.questions.map((_, i) => {
              const done = answeredSet.has(i)
              const current = i === viewedIdx
              const future = i > state.index
              return (
                <button
                  key={i}
                  type="button"
                  disabled={future}
                  onClick={() => setViewIndex(i)}
                  aria-label={`Go to question ${i + 1}${done ? ' (answered)' : ''}`}
                  className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium transition-colors ${
                    current ? 'ring-2 ring-primary' : ''
                  } ${
                    future
                      ? 'cursor-not-allowed border-border/60 text-muted-foreground/40'
                      : done
                        ? 'border-pass/40 bg-pass-bg text-pass hover:bg-[#d6e6dc]'
                        : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <span className="mt-2 text-center text-[10px] text-muted-foreground">
            green = answered
          </span>
        </nav>
      )}

      {/* Camera PiP: small corner window for objective questions */}
      {!q.require_camera && mediaReady && (
        <div className="fixed bottom-5 right-5 z-40 w-44 overflow-hidden rounded-lg border border-border bg-ink shadow-[0_8px_24px_-12px_rgba(19,17,15,0.5)]">
          <video
            ref={attachPip}
            autoPlay
            muted
            playsInline
            style={{ transform: 'scaleX(-1)' }}
            className="h-full w-full"
          />
          <span className="absolute left-2 top-2 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Camera on
          </span>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              {q.type === 'spoken' ? 'Video answer' : 'Multiple choice'}
            </span>
          </div>

          <h1 className="mb-5 text-lg font-medium leading-snug">{q.text}</h1>

          {q.guidance && (
            <p className="mb-5 text-sm text-muted-foreground">{q.guidance}</p>
          )}

          {mediaError && (
            <div className="mb-5 rounded-lg border border-destructive/30 bg-fail-bg p-3.5 text-sm text-fail">
              {mediaError}
            </div>
          )}

          {/* Camera question: expanded centered window */}
          {q.type === 'spoken' && (
            <div className="space-y-3">
              <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-lg border border-border bg-ink">
                <video
                  ref={attachBig}
                  autoPlay
                  muted
                  playsInline
                  style={{ transform: 'scaleX(-1)' }}
                  className="aspect-video w-full"
                />
                <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-ink/70 px-2 py-1 text-[11px] font-medium text-white">
                  {recording && <span className="status-dot bg-red-500" />}
                  {recording ? 'REC' : 'Camera'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {recording && (
                  <Badge variant="destructive" className="gap-1.5">
                    <span className="status-dot bg-white" />
                    REC
                  </Badge>
                )}
                {mediaReady && (
                  <span className="text-xs text-muted-foreground">
                    Speak your answer. It is transcribed below. You can edit it before
                    submitting.
                  </span>
                )}
              </div>
              {sttFailed && (
                <div className="flex items-start gap-1.5 rounded-lg border border-[#e8cf9b] bg-warn-bg p-3 text-xs text-warn">
                  <Warning size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Voice recognition is not working in your browser right now.
                    Please type your answer in the box below instead. Your video is
                    still being recorded.
                  </span>
                </div>
              )}
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={5}
                placeholder="Your spoken answer appears here as you speak…"
                aria-label="Answer transcript"
              />
              {interim && (
                <p className="-mt-1.5 text-xs italic text-muted-foreground" aria-live="polite">
                  hearing: {interim}…
                </p>
              )}
            </div>
          )}

          {/* MCQ / yes-no */}
          {isObjective && (
            <div className="space-y-2.5">
              {choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`option-row w-full text-left ${answer === choice ? 'selected' : ''}`}
                  onClick={() => setAnswer(choice)}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      answer === choice ? 'border-primary bg-primary' : 'border-input'
                    }`}
                  >
                    {answer === choice && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </span>
                  {choice}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {viewedIdx > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewIndex(viewedIdx - 1)}
                >
                  <CaretLeft size={14} className="mr-0.5" /> Previous
                </Button>
              )}
              {isRevisit && (
                <Button variant="ghost" size="sm" onClick={() => setViewIndex(null)}>
                  Back to current question
                </Button>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:block">
                {isObjective && !canSubmit
                  ? 'Select an option to continue.'
                  : 'Answers save in the background as you go.'}
              </span>
              <Button onClick={submit} disabled={!canSubmit} className="shrink-0">
                {isRevisit
                  ? 'Save changes'
                  : state.index + 1 === state.total
                    ? 'Submit interview'
                    : 'Save & continue'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen gate: a mid-interview refresh drops fullscreen, and the
          proctoring's exit-detector only arms after it has seen fullscreen
          once - so without this gate a refreshed interview would run
          unproctored in a normal window. Block until fullscreen is re-entered
          (the click is the user gesture requestFullscreen requires). */}
      {needsFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fs-gate-title"
            className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-[0_24px_48px_-20px_rgba(19,17,15,0.5)]"
          >
            <Warning size={32} className="mx-auto text-orange-deep" aria-hidden="true" />
            <h2 id="fs-gate-title" className="mt-3 text-lg font-semibold">
              Continue in full screen
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This interview runs in full-screen mode. Your answers so far are saved.
            </p>
            <Button className="mt-5 w-full" onClick={triggerFullscreen} autoFocus>
              Enter full screen to continue
            </Button>
          </div>
        </div>
      )}

      {/* Violation overlay: tab switch / fullscreen exit / devtools */}
      {violation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="violation-title"
            className="w-full max-w-md rounded-lg bg-card p-6 text-center shadow-[0_24px_48px_-20px_rgba(19,17,15,0.5)]"
          >
            <Warning size={32} className="mx-auto text-fail" aria-hidden="true" />
            <h2 id="violation-title" className="mt-3 text-lg font-semibold">
              Violation detected
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{violation.message}</p>
            <p className="mt-2 text-sm font-medium">
              Warning {warnings} of 3. The interview will stop automatically after the 3rd
              warning.
            </p>
            <Button className="mt-5 w-full" onClick={dismissViolation} autoFocus>
              I understand, back to interview
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
