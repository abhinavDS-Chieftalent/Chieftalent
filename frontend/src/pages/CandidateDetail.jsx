import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowCounterClockwise, Check, CircleNotch, Copy } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { usePageTitle } from '@/components/usePageTitle.js'
import AdminShell from '@/components/AdminShell.jsx'
import StatusBadge from '@/components/StatusBadge.jsx'
import AtsSection from '@/components/review/AtsSection.jsx'
import DetailsSection from '@/components/review/DetailsSection.jsx'
import AnswersSection from '@/components/review/AnswersSection.jsx'
import EvaluationSection from '@/components/review/EvaluationSection.jsx'
import ReviewRail from '@/components/review/ReviewRail.jsx'
import { initials, objectiveCounts } from '@/components/review/scoreKeys.js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function CandidateDetail() {
  usePageTitle('Candidate')
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState('')
  const [reviewMsg, setReviewMsg] = useState('')
  const [retaking, setRetaking] = useState(false)
  const [retakeMsg, setRetakeMsg] = useState('')
  const [retakeOpen, setRetakeOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shortlisting, setShortlisting] = useState(false)
  const [shortlistMsg, setShortlistMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await api.candidate(id)
      setData(d)
      setDecision(d.candidate.review_decision || '')
      setNotes(d.candidate.review_notes || '')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const saveReview = async () => {
    setSaving(true)
    setReviewMsg('')
    try {
      const res = await api.review(id, decision, notes)
      if (res?.interview_url) {
        setReviewMsg(
          `Interview link generated${res.email_status ? ` (email: ${res.email_status})` : ''}. ` +
            'The "Copy interview link" button above is ready.'
        )
      }
      await load()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(data.interview_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy interview link:', data.interview_url)
    }
  }

  // HR override: manually shortlist a rejected candidate + generate interview
  const doShortlist = async () => {
    if (shortlisting) return
    setShortlisting(true)
    setShortlistMsg('')
    try {
      const res = await api.shortlistCandidate(id)
      setShortlistMsg(
        res.already_shortlisted
          ? 'This candidate was already shortlisted. Showing their existing interview link above.'
          : `Interview link generated${res.email_status ? ` (email: ${res.email_status})` : ''}. ` +
              'The candidate is judged on interview performance only; the ATS score stays as context.'
      )
      await load()
    } catch (e) {
      setShortlistMsg(`Could not shortlist: ${e.message}`)
    } finally {
      setShortlisting(false)
    }
  }

  // HR reset: close the current attempt and issue a fresh interview
  const doRetake = async () => {
    if (retaking) return
    setRetaking(true)
    setRetakeMsg('')
    try {
      const res = await api.retakeCandidate(id)
      // Put the fresh link into state immediately, before the refetch, so the Copy button
      // cannot hand out the old (now dead) token in the gap.
      if (res.interview_url) {
        setData((prev) => (prev ? { ...prev, interview_url: res.interview_url } : prev))
      }
      setRetakeMsg(
        `Fresh interview created and emailed${res.email_status ? ` (${res.email_status})` : ''}. ` +
          'The old link now shows a reset notice.'
      )
      await load()
    } catch (e) {
      setRetakeMsg(`Could not retake: ${e.message}`)
    } finally {
      setRetaking(false)
    }
  }

  const qaByQuestion = useMemo(() => {
    const m = {}
    const qa = Array.isArray(data?.evaluation?.question_analysis) ? data.evaluation.question_analysis : []
    for (const q of qa) {
      const key = q.question_index ?? q.question_id ?? q.question
      if (key != null) m[String(key)] = q
    }
    return m
  }, [data])

  if (error)
    return (
      <AdminShell>
        <div role="alert" className="p-8 text-sm text-fail">{error}</div>
      </AdminShell>
    )
  if (!data)
    return (
      <AdminShell>
        <div className="p-8 text-sm text-muted-foreground">Loading…</div>
      </AdminShell>
    )

  const { candidate: c, ats, interview, answers, evaluation } = data

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8" data-review-ready="">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Candidates
        </Link>

        <header className="mb-8 flex flex-wrap items-start gap-4">
          <Avatar className="h-12 w-12 rounded-lg">
            <AvatarFallback className="rounded-lg text-sm">{initials(c.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="break-words text-3xl font-extrabold">{c.name}</h1>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {c.email || 'no email found'}
              <span className="ml-3 capitalize">{(c.role || '').replace(/_/g, ' ')}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            {data.retakes > 0 && (
              <Badge
                variant="warning"
                title={`This candidate was issued a fresh interview ${data.retakes} time${data.retakes > 1 ? 's' : ''}. Previous attempts stay on record.`}
              >
                Retaken{data.retakes > 1 ? ` ×${data.retakes}` : ''}
              </Badge>
            )}
            {evaluation?.recommendation && (
              <Badge
                variant={
                  evaluation.recommendation === 'recommend_progress'
                    ? 'success'
                    : evaluation.recommendation === 'recommend_reject'
                      ? 'destructive'
                      : 'warning'
                }
              >
                {evaluation.recommendation.replace('recommend_', '').replace('_', ' ').replace(/^./, (ch) => ch.toUpperCase())}
              </Badge>
            )}
            {data.interview_url && (
              <Button variant="outline" size="sm" onClick={copyLink}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy interview link'}
              </Button>
            )}
            {interview && !['not_started', 'in_progress'].includes(interview.status) && (
              <Button variant="outline" size="sm" onClick={() => setRetakeOpen(true)} disabled={retaking}>
                {retaking ? <CircleNotch className="animate-spin" aria-hidden="true" /> : <ArrowCounterClockwise aria-hidden="true" />}
                {retaking ? 'Creating…' : 'Retake interview'}
              </Button>
            )}
            {data.verification_code && (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-[#e8cf9b] bg-warn-bg px-2.5 py-1 text-xs text-warn"
                title="The candidate hasn't verified their email yet. If they say the code email never arrived, read this code to them. It expires 10 minutes after it was requested."
              >
                Verification code: <span className="num font-bold">{data.verification_code}</span>
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <AtsSection
              candidate={c}
              ats={ats}
              interviewUrl={data.interview_url}
              shortlisting={shortlisting}
              shortlistMsg={shortlistMsg}
              onShortlist={doShortlist}
            />
            {data.details && <DetailsSection details={data.details} />}
            <AnswersSection interview={interview} answers={answers} qaByQuestion={qaByQuestion} />
            {evaluation && <EvaluationSection evaluation={evaluation} objective={objectiveCounts(answers)} />}
          </div>

          <div className="min-w-0">
            <ReviewRail
              candidate={c}
              interview={interview}
              decision={decision}
              setDecision={setDecision}
              notes={notes}
              setNotes={setNotes}
              saving={saving}
              onSave={saveReview}
              reviewMsg={reviewMsg}
            />
          </div>
        </div>

        {retakeMsg && (
          <p role="status" aria-live="polite" className="mt-6 text-sm text-muted-foreground">
            {retakeMsg}
          </p>
        )}

        <AlertDialog open={retakeOpen} onOpenChange={setRetakeOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retake interview for {c.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                The current attempt is closed and its link stops working. A fresh interview with new questions is
                created and the new link is emailed to the candidate. Previous answers and evaluation stay on record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  setRetakeOpen(false)
                  doRetake()
                }}
              >
                Create fresh interview
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminShell>
  )
}
