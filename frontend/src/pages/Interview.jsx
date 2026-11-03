import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleNotch } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { usePageTitle } from '@/components/usePageTitle.js'
import Logo from '@/components/Logo.jsx'
import DetailsForm from '@/components/interview/DetailsForm'
import GuidelinesModal from '@/components/interview/GuidelinesModal'
import InterviewRunner from '@/components/interview/InterviewRunner'
import ProcessStepper from '@/components/interview/ProcessStepper'
import VerifyEmail from '@/components/interview/VerifyEmail'
import { SuccessTick, AlarmRing } from '@/components/interview/CompletionIcons'
import { subscribeUploadStatus } from '@/components/interview/uploadQueue'
import { stopStream } from '@/components/interview/mediaStore'

function UploadStatus() {
  const [upload, setUpload] = useState({ uploading: false, pending: 0, failed: [] })
  useEffect(() => subscribeUploadStatus(setUpload), [])
  if (upload.uploading || upload.pending > 0) {
    return (
      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <CircleNotch size={14} className="animate-spin" />
        Saving your last answer. Please keep this tab open for a moment.
      </p>
    )
  }
  if (upload.failed.length) {
    return (
      <div className="mt-4">
        <p className="text-sm text-warn">
          Some answers could not be saved. Keep this tab open and retry.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {upload.failed.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.retry}
              className="rounded-md border border-[#e8cf9b] bg-warn-bg px-3 py-1 text-xs font-semibold text-warn hover:bg-[#ffe7b8]"
            >
              Retry saving {f.label}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export default function Interview() {
  usePageTitle('Interview')
  const { token } = useParams()
  const [state, setState] = useState(null)
  const [error, setError] = useState('')

  const loadState = useCallback(async () => {
    try {
      const s = await api.interviewState(token)
      setState(s)
    } catch (e) {
      setError(e.message)
    }
  }, [token])

  useEffect(() => {
    loadState()
  }, [loadState])

  // When the interview is over (completed or aborted), release the camera
  // and leave full screen.
  useEffect(() => {
    if (state && (state.phase === 'completed' || state.phase === 'aborted')) {
      stopStream()
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [state])

  // Each phase is a fresh "page" - always land at the top, never at the
  // scroll position the previous phase happened to be left at.
  // NOTE: must stay ABOVE the early returns - hooks after a conditional
  // return change the hook count between renders and crash React (#310).
  // 'instant' because global smooth-scroll animations get cancelled when
  // the next phase mounts, leaving the page part-way down.
  useEffect(() => {
    if (state) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [state?.phase])

  if (error)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 text-center text-sm text-fail">
        {error}
      </div>
    )
  if (!state)
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    )

  const header = (
    <header className="bg-ink text-ink-foreground">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-6 py-3.5">
        <Logo onDark className="h-8" />
        <span className="ml-3 hidden border-l border-ink-border pl-3 text-xs text-ink-muted sm:inline">
          {state.interview_title || 'Interview'}
        </span>
        {state.candidate_name && (
          <span className="ml-auto text-sm text-ink-muted">{state.candidate_name}</span>
        )}
      </div>
    </header>
  )

  if (state.phase === 'completed')
    return (
      <div className="min-h-[100dvh] bg-background">
        {header}
        <ProcessStepper phase={state.phase} />
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
            <div className="flex justify-center">
              {state.timed_out ? <AlarmRing /> : <SuccessTick />}
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">
              {state.timed_out ? "Time's up" : 'Interview completed'}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {state.timed_out
                ? 'Your 30 minutes ran out. The answers you completed were recorded and submitted, and they will be reviewed.'
                : 'Your responses have been recorded and submitted. Our team will review them and get back to you.'}
            </p>
            <div className="mt-4">
              <UploadStatus />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Facing any difficulty? Write to us at{' '}
              <a className="link" href="mailto:yash@dotstark.com">
                yash@dotstark.com
              </a>
            </p>
          </div>
        </div>
      </div>
    )

  if (state.phase === 'aborted')
    return (
      <div className="min-h-[100dvh] bg-background">
        {header}
        <ProcessStepper phase={state.phase} />
        <div className="mx-auto max-w-2xl px-6 py-16">
          <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-fail-bg">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-fail"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </div>
            <h1 className="mt-4 text-xl font-bold">Interview terminated</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {state.reason || 'The interview was stopped.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              If you believe this was a mistake, write to{' '}
              <a className="link underline underline-offset-4" href="mailto:yash@dotstark.com">
                yash@dotstark.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    )

  if (state.phase === 'verify')
    return (
      <div className="min-h-[100dvh] bg-background">
        {header}
        <ProcessStepper phase={state.phase} />
        <VerifyEmail token={token} maskedEmail={state.masked_email} onDone={loadState} />
      </div>
    )

  if (state.phase === 'details')
    return (
      <div className="min-h-[100dvh] bg-background">
        {header}
        <ProcessStepper phase={state.phase} />
        <DetailsForm token={token} onDone={loadState} />
      </div>
    )

  if (state.phase === 'guidelines')
    return (
      <div className="min-h-[100dvh] bg-background">
        {header}
        <ProcessStepper phase={state.phase} />
        <GuidelinesModal token={token} onDone={loadState} />
      </div>
    )

  // phase === 'interview'
  return (
    <div className="min-h-[100dvh] bg-background">
      {header}
      <ProcessStepper phase={state.phase} />
      <InterviewRunner
        token={token}
        state={state}
        onDone={loadState}
        onAborted={loadState}
      />
    </div>
  )
}
