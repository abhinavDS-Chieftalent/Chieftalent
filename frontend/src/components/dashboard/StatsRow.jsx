import { motion, useReducedMotion } from 'motion/react'

// Stage colours are the product's own status colours (pass / fail), the accent, and ink. One legend, used twice.
const STAGES = [
  ['shortlisted', 'shortlisted', 'bg-ink'],
  ['interviewing', 'interviewing', 'bg-orange'],
  ['evaluated', 'evaluated', 'bg-pass'],
  ['rejected', 'rejected', 'bg-fail'],
  ['other', 'other', 'bg-[#c9cdd4]'],
]

const EASE = [0.22, 1, 0.36, 1]

function Cell({ k, onClick, pressed, children }) {
  const base = 'flex min-w-0 flex-col gap-3 bg-card p-5 text-left'
  if (!onClick) {
    return (
      <div data-stat={k} className={base}>
        {children}
      </div>
    )
  }
  return (
    <button
      type="button"
      data-stat={k}
      aria-pressed={pressed}
      onClick={onClick}
      className={`${base} cursor-pointer transition-colors hover:bg-muted/60 aria-pressed:shadow-[inset_0_-3px_0_var(--orange)]`}
    >
      {children}
    </button>
  )
}

const Label = ({ children }) => <span className="block text-sm font-semibold text-muted-foreground">{children}</span>

function Figure({ ready, value, suffix }) {
  return (
    <span data-stat-value className="display block text-[2.5rem] tabular-nums">
      {ready && value != null ? (
        <>
          {value}
          {suffix && <span className="ml-1 text-base font-semibold text-muted-foreground">{suffix}</span>}
        </>
      ) : (
        '-'
      )}
    </span>
  )
}

/** A bar that grows in once, when the data first arrives. Transform only; final state under reduced motion. */
function Grow({ reduce, delay = 0, className, style, ...rest }) {
  return (
    <motion.span
      aria-hidden="true"
      className={`origin-left ${className}`}
      style={style}
      {...(reduce
        ? { initial: false, animate: { scaleX: 1 } }
        : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { duration: 0.55, delay, ease: EASE } })}
      {...rest}
    />
  )
}

/**
 * The pipeline at a glance: four cells in one strip, each number paired with a small chart of the
 * real data behind it. Total, Shortlisted and Interviewing are buttons that filter the table below.
 */
export default function StatsRow({
  ready, total, shortlisted, interviewing, avg, scored, breakdown, activeTab, onSelectTab,
}) {
  const reduce = useReducedMotion()
  const segments = STAGES.map(([key, label, cls]) => ({ key, label, cls, n: breakdown?.[key] || 0 })).filter((s) => s.n > 0)
  const barLabel = segments.map((s) => `${s.n} ${s.label}`).join(', ')
  const share = total > 0 ? Math.round((shortlisted / total) * 100) : 0

  return (
    <section
      data-stats
      aria-label="Pipeline summary"
      className="grid gap-px overflow-hidden rounded-lg border bg-line sm:grid-cols-2 lg:grid-cols-4"
    >
      <Cell k="total" onClick={() => onSelectTab('all')} pressed={activeTab === 'all'}>
        <Label>Total candidates</Label>
        <Figure ready={ready} value={total} />
        {ready && segments.length > 0 && (
          <>
            <span data-stage-bar role="img" aria-label={barLabel} className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
              {segments.map((s, i) => (
                <Grow
                  key={s.key}
                  reduce={reduce}
                  delay={i * 0.06}
                  data-stage={s.key}
                  className={`${s.cls} min-w-[6px]`}
                  style={{ flexGrow: s.n, flexBasis: 0 }}
                />
              ))}
            </span>
            <span aria-hidden="true" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {segments.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-sm ${s.cls}`} />
                  {s.n} {s.label}
                </span>
              ))}
            </span>
          </>
        )}
      </Cell>

      <Cell k="shortlisted" onClick={() => onSelectTab('shortlisted')} pressed={activeTab === 'shortlisted'}>
        <Label>Shortlisted</Label>
        <Figure ready={ready} value={shortlisted} />
        {ready && (
          <>
            <span className="block h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <Grow reduce={reduce} className="block h-full rounded-full bg-ink" style={{ width: `${share}%` }} />
            </span>
            <span className="text-xs text-muted-foreground">
              <span className="num font-semibold text-foreground">{share}%</span> of candidates
            </span>
          </>
        )}
      </Cell>

      <Cell k="interviewing" onClick={() => onSelectTab('interviewing')} pressed={activeTab === 'interviewing'}>
        <Label>Interviewing</Label>
        <Figure ready={ready} value={interviewing} />
        {ready && (
          <span className="text-xs text-muted-foreground">
            {interviewing > 0 ? 'Running now or being scored' : 'No interviews running'}
          </span>
        )}
      </Cell>

      <Cell k="avg">
        <Label>Average interview score</Label>
        <Figure ready={ready} value={avg} suffix="/ 100" />
        {ready && avg != null && (
          <>
            <span className="block h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <Grow reduce={reduce} className="block h-full rounded-full bg-orange" style={{ width: `${Math.min(100, avg)}%` }} />
            </span>
            <span className="text-xs text-muted-foreground">
              from <span className="num font-semibold text-foreground">{scored}</span> interview{scored === 1 ? '' : 's'}
            </span>
          </>
        )}
        {ready && avg == null && <span className="text-xs text-muted-foreground">No scored interviews yet</span>}
      </Cell>
    </section>
  )
}
