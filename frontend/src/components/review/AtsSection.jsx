import { Link } from 'react-router-dom'
import { Check, CircleNotch, Lightning, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { asList } from './scoreKeys.js'

function Notice({ children }) {
  return <div className="rounded-md border border-[#e8cf9b] bg-warn-bg p-4 text-sm text-warn">{children}</div>
}

function ShortlistButton({ busy, onClick, children }) {
  return (
    <Button size="sm" className="mt-3" onClick={onClick} disabled={busy}>
      {busy ? (
        <>
          <CircleNotch className="animate-spin" aria-hidden="true" /> Generating…
        </>
      ) : (
        <>
          <Lightning size={14} aria-hidden="true" /> {children}
        </>
      )}
    </Button>
  )
}

/** ATS screening: score, the two override notices, matched and missing requirements, reasoning. */
export default function AtsSection({ candidate: c, ats, interviewUrl, shortlisting, shortlistMsg, onShortlist }) {
  const passing = c.ats_score != null && c.ats_score >= 70
  const duplicateHeld = c.duplicate_of && !interviewUrl
  const rejectedNoLink = !c.duplicate_of && ['rejected', 'ats_error'].includes(c.status) && !interviewUrl
  const matched = asList(ats?.matched_requirements)
  const missing = asList(ats?.missing_requirements)

  return (
    <section data-review-section="ats" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">ATS screening</h2>
          <p className="mt-1 text-sm text-muted-foreground">AI review of the CV against the job posting.</p>
        </div>
        {c.ats_score != null && (
          <div className="flex items-center gap-3">
            <span className="stat-num">{c.ats_score}</span>
            <div className="meter">
              <span style={{ width: `${c.ats_score}%`, background: passing ? 'var(--pass)' : 'var(--fail)' }} />
            </div>
          </div>
        )}
      </div>

      {duplicateHeld && (
        <Notice>
          <p>
            This looks like a duplicate of{' '}
            <Link to={`/admin/candidate/${c.duplicate_of}`} className="link underline underline-offset-4">
              candidate #{c.duplicate_of}
            </Link>{' '}
            (same email on this role). The interview link was held so the candidate is not emailed twice. Review both,
            then send the link or delete one.
          </p>
          <ShortlistButton busy={shortlisting} onClick={onShortlist}>
            Send interview link anyway
          </ShortlistButton>
          {shortlistMsg && <p className="mt-3 text-muted-foreground" role="status" aria-live="polite">{shortlistMsg}</p>}
        </Notice>
      )}

      {rejectedNoLink && (
        <Notice>
          <p>
            ATS did not recommend this candidate. If their profile looks right to you, override it. An interview link
            will be generated and the invite email sent.
          </p>
          <ShortlistButton busy={shortlisting} onClick={onShortlist}>
            Manually shortlist &amp; generate interview
          </ShortlistButton>
          {shortlistMsg && <p className="mt-3 text-muted-foreground" role="status" aria-live="polite">{shortlistMsg}</p>}
        </Notice>
      )}

      {ats && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold">Matched</h3>
              <ul className="mt-2 space-y-1.5">
                {matched.length === 0 && <li className="text-sm text-muted-foreground">None recorded</li>}
                {matched.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug">
                    <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-pass" aria-hidden="true" />
                    <span className="min-w-0 break-words">{m}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold">Missing</h3>
              <ul className="mt-2 space-y-1.5">
                {missing.length === 0 && <li className="text-sm text-muted-foreground">None flagged</li>}
                {missing.map((m, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug">
                    <X size={14} weight="bold" className="mt-0.5 shrink-0 text-fail" aria-hidden="true" />
                    <span className="min-w-0 break-words">{m}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {ats.reasoning && (
            <p className="max-w-[70ch] border-t border-line pt-4 text-sm leading-relaxed text-muted-foreground">
              {ats.reasoning}
            </p>
          )}
        </>
      )}
    </section>
  )
}
