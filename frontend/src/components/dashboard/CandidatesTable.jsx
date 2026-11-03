import { Link } from 'react-router-dom'
import { Copy, Check, Trash, UsersThree } from '@phosphor-icons/react'
import StatusBadge from '@/components/StatusBadge.jsx'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import FilterBar from './FilterBar.jsx'

export const TABS = [
  ['all', 'All'],
  ['shortlisted', 'Shortlisted'],
  ['interviewing', 'Interviewing'],
  ['evaluated', 'Evaluated'],
  ['rejected', 'Rejected'],
]

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const COLUMNS = 7

// One status column: the candidate's status, plus the interview's own state underneath, but only when it
// adds something (otherwise "evaluation completed" would be printed twice).
function interviewNote(c) {
  const iv = (c.interview_status || '').replace(/_/g, ' ')
  const st = (c.status || '').replace(/_/g, ' ')
  if (!iv || iv === st || st.endsWith(iv)) return ''
  return `Interview ${iv}`
}

// The same short wording the candidate page uses for the AI recommendation.
const RECOMMENDATION_LABEL = {
  recommend_progress: 'Progress',
  review_required: 'Review',
  recommend_reject: 'Reject',
}

/**
 * The page's centre: tabs with counts, filters and sorting, then one table. Long names and emails
 * truncate in the cell; role names are shown in full (they wrap).
 */
export default function CandidatesTable({
  loading, rows, tab, setTab, counts, isAdmin, atsThreshold, onCopy, onDelete, copiedId,
  filters, onFilterChange, onFilterReset, filtersActive, statusOptions, totalInTab,
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label="Candidates">
      <div className="px-6 pt-4">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList aria-label="Candidate stages">
            {TABS.map(([key, label]) => (
              <TabsTrigger key={key} value={key}>
                {label}
                <span className="num text-xs font-medium text-muted-foreground">({counts[key] ?? 0})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <FilterBar
        filters={filters}
        onChange={onFilterChange}
        onReset={onFilterReset}
        active={filtersActive}
        statusOptions={statusOptions}
        atsThreshold={atsThreshold}
        shown={rows.length}
        total={totalInTab}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>ATS</TableHead>
            <TableHead className="text-right">Interview score</TableHead>
            <TableHead>Recommendation</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: COLUMNS }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full max-w-28" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!loading && rows.length === 0 && totalInTab > 0 && (
            <TableRow>
              <TableCell colSpan={COLUMNS} className="py-14 text-center">
                <UsersThree size={28} className="mx-auto text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">No candidates match these filters</p>
                <p className="mt-1 text-sm text-muted-foreground">Loosen a filter, or start again.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={onFilterReset}>
                  Reset filters
                </Button>
              </TableCell>
            </TableRow>
          )}

          {!loading && rows.length === 0 && !(totalInTab > 0) && (
            <TableRow>
              <TableCell colSpan={COLUMNS} className="py-14 text-center">
                <UsersThree size={28} className="mx-auto text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold">No candidates here yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Upload CVs above to start screening.</p>
              </TableCell>
            </TableRow>
          )}

          {rows.map((c) => {
            const passing = c.ats_score != null && c.ats_score >= (atsThreshold ?? 70)
            return (
              <TableRow key={c.id}>
                <TableCell className="max-w-[13rem]">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{initials(c.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Link to={`/admin/candidate/${c.id}`} title={c.name} className="link block truncate text-sm">
                        {c.name}
                      </Link>
                      <div title={c.email} className="truncate text-xs text-muted-foreground">
                        {c.email || 'no email found'}
                      </div>
                      {c.duplicate_of && (
                        <Badge
                          variant="warning"
                          className="mt-1"
                          title={`Possible duplicate of ${c.duplicate_name || 'candidate #' + c.duplicate_of}. Same email on this role. Interview link held until you review.`}
                        >
                          Possible duplicate
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="min-w-[7rem] max-w-[13rem] break-words text-sm capitalize text-muted-foreground">
                  {c.role.replace(/_/g, ' ')}
                </TableCell>
                <TableCell>
                  {c.ats_score == null ? (
                    <span className="text-sm text-muted-foreground">-</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="num text-sm font-semibold" style={{ color: passing ? 'var(--pass)' : 'var(--fail)' }}>
                        {c.ats_score}
                      </span>
                      <div className="meter" style={{ width: 48 }}>
                        <span style={{ width: `${c.ats_score}%`, background: passing ? 'var(--pass)' : 'var(--fail)' }} />
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {c.interview_score != null ? (
                    <span className="num text-sm font-semibold">{Math.round(c.interview_score)}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {c.recommendation ? (
                    <Badge
                      variant={
                        c.recommendation === 'recommend_progress'
                          ? 'success'
                          : c.recommendation === 'recommend_reject'
                            ? 'destructive'
                            : 'warning'
                      }
                    >
                      {RECOMMENDATION_LABEL[c.recommendation] || c.recommendation.replace(/_/g, ' ')}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={c.status} />
                      {c.retakes > 0 && (
                        <Badge
                          variant="warning"
                          title={`A fresh interview was issued ${c.retakes} time${c.retakes > 1 ? 's' : ''} for this candidate.`}
                        >
                          Retaken{c.retakes > 1 ? ` ×${c.retakes}` : ''}
                        </Badge>
                      )}
                    </div>
                    {interviewNote(c) && <span className="text-xs text-muted-foreground">{interviewNote(c)}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {c.interview_url ? (
                      <Button variant="ghost" size="sm" onClick={() => onCopy(c)} aria-label={`Copy interview link for ${c.name}`}>
                        {copiedId === c.id ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                        {copiedId === c.id ? 'Copied' : 'Copy link'}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-fail"
                        onClick={() => onDelete(c)}
                        aria-label={`Delete ${c.name}`}
                      >
                        <Trash aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
