import { CircleNotch, FilePdf } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fmtDate } from './scoreKeys.js'

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 break-all text-right text-sm font-semibold">{children}</dd>
    </div>
  )
}

/** Sticky rail on desktop: where the candidate came from, then the (always human) decision. */
export default function ReviewRail({
  candidate: c, interview, decision, setDecision, notes, setNotes, saving, onSave, reviewMsg,
}) {
  return (
    <aside className="divide-y divide-line rounded-lg border bg-card lg:sticky lg:top-6 lg:self-start" aria-label="Candidate summary and review">
      <div className="p-5">
        <h2 className="text-base font-bold">Details</h2>
        <dl className="m-0 mt-2">
          <Row label="Email">{c.email || '-'}</Row>
          <Row label="Role">{(c.role || '').replace(/_/g, ' ')}</Row>
          <Row label="CV">
            <a href={`/admin/candidate/${c.id}/cv`} className="link inline-flex items-center gap-1 underline underline-offset-4">
              <FilePdf size={14} aria-hidden="true" /> Download
            </a>
          </Row>
          <Row label="Added">{fmtDate(c.created_at)}</Row>
          <Row label="Interview">{interview ? fmtDate(interview.completed_at || interview.started_at) : '-'}</Row>
        </dl>
      </div>

      <div className="space-y-3 p-5">
        <div>
          <h2 className="text-base font-bold">Manual review</h2>
          <p className="mt-1 text-sm text-muted-foreground">The final decision is always human.</p>
        </div>
        <Select value={decision} onValueChange={setDecision}>
          <SelectTrigger aria-label="Review decision">
            <SelectValue placeholder="Choose a decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="selected">Selected</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="manual_review">Needs more review</SelectItem>
          </SelectContent>
        </Select>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes…" rows={4} aria-label="Review notes" />
        <Button onClick={onSave} disabled={!decision || saving} className="w-full">
          {saving && <CircleNotch className="animate-spin" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save review'}
        </Button>
        {reviewMsg && (
          <p role="status" aria-live="polite" className="text-sm text-pass">
            {reviewMsg}
          </p>
        )}
        {c.review_decision && (
          <p className="text-xs text-muted-foreground">
            Last review: {c.review_decision}. {fmtDate(c.reviewed_at)}
          </p>
        )}
      </div>
    </aside>
  )
}
