import { DownloadSimple } from '@phosphor-icons/react'
import StatusBadge from '@/components/StatusBadge.jsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SCORE_KEYS, fmtDate } from './scoreKeys.js'

const TYPE_LABEL = { mcq: 'Multiple choice', yes_no: 'Yes / No', spoken: 'Spoken' }

function Answer({ a, qa }) {
  const spoken = a.question_type === 'spoken'
  return (
    <article data-answer className="py-5 first:pt-0 last:pb-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Q{a.question_index + 1}</span>
        <Badge variant={spoken ? 'outline' : 'secondary'}>{TYPE_LABEL[a.question_type] || a.question_type}</Badge>
        {a.time_used != null && <span className="num ml-auto text-xs text-muted-foreground">{Math.round(a.time_used)}s</span>}
      </div>
      <p className="mb-3 break-words text-sm font-semibold leading-snug">{a.question_text}</p>

      {spoken ? (
        <>
          {(a.transcript || a.answer_text) && (
            <p className="mb-3 break-words rounded-md bg-muted p-3 text-sm leading-relaxed">{a.transcript || a.answer_text}</p>
          )}
          {a.audio_url && <audio controls preload="none" src={a.audio_url} className="mb-2 w-full" />}
          {a.video_url && (
            <div className="max-w-xl">
              <video controls preload="metadata" src={a.video_url} className="video-box mb-2" />
              <Button asChild variant="outline" size="sm">
                <a href={`/admin/recording/${a.id}/video/download`}>
                  <DownloadSimple aria-hidden="true" />
                  Download video
                </a>
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 break-words">
            Answer: <strong>{a.answer_text || '-'}</strong>
          </span>
          {a.correct_answer && <span className="min-w-0 break-words text-muted-foreground">expected {a.correct_answer}</span>}
          {a.is_correct != null && (
            <Badge variant={a.is_correct ? 'success' : 'destructive'}>{a.is_correct ? 'correct' : 'wrong'}</Badge>
          )}
        </div>
      )}

      {qa && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {SCORE_KEYS.filter(([key]) => qa[key] != null).map(([key, label]) => (
            <Badge key={key} variant="secondary" className="num">
              {label} {qa[key]}
            </Badge>
          ))}
          {qa.feedback && <p className="mt-2 w-full text-xs leading-relaxed text-muted-foreground">{qa.feedback}</p>}
        </div>
      )}
    </article>
  )
}

/** The interview: every answer with its recording, transcript and the AI's per-answer scores. */
export default function AnswersSection({ interview, answers, qaByQuestion }) {
  return (
    <section data-review-section="interview" className="space-y-5 border-t border-line pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Interview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {interview
              ? `Started ${fmtDate(interview.started_at)}. Completed ${fmtDate(interview.completed_at)}.`
              : 'No interview yet.'}
          </p>
        </div>
        <StatusBadge status={interview?.status} />
      </div>

      {answers.length === 0 && <p className="text-sm text-muted-foreground">No answers recorded.</p>}

      {answers.length > 0 && (
        <div className="divide-y divide-line">
          {answers.map((a) => (
            <Answer key={a.id} a={a} qa={qaByQuestion[String(a.question_index)] || qaByQuestion[a.question_id]} />
          ))}
        </div>
      )}
    </section>
  )
}
