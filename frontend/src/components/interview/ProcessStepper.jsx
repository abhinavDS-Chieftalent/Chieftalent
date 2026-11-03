import { Check, X } from '@phosphor-icons/react'

/**
 * Progress bar for the candidate's whole journey:
 * Your details -> Guidelines -> Interview -> Completed.
 * Interview questions are NOT steps - the whole interview is one step.
 */

const PROCESS_STEPS = [
  { key: 'verify', name: 'Verify email' },
  { key: 'details', name: 'Your details' },
  { key: 'guidelines', name: 'Guidelines' },
  { key: 'interview', name: 'Interview' },
  { key: 'completed', name: 'Completed' },
]

const PHASE_INDEX = {
  verify: 0,
  details: 1,
  guidelines: 2,
  interview: 3,
  completed: 4,
  aborted: 3, // interview step, shown as failed
}

export default function ProcessStepper({ phase }) {
  const current = PHASE_INDEX[phase]
  if (current == null) return null
  const aborted = phase === 'aborted'

  return (
    <div
      className="mx-auto max-w-3xl px-6 pt-5"
      role="list"
      aria-label="Interview process progress"
    >
      <div className="flex items-center gap-2">
        {PROCESS_STEPS.map((s, i) => {
          const done = i < current
          const isCurrent = i === current
          const failed = aborted && i === current
          // Steps size to their content (labels are never cut off); only the connector lines
          // stretch. The last step has no connector, so it just takes its own width.
          return (
            <div
              key={s.key}
              className={`flex items-center gap-2 ${i < PROCESS_STEPS.length - 1 ? 'flex-1' : 'shrink-0'}`}
              role="listitem"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    failed
                      ? 'bg-fail text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : done
                          ? 'bg-pass text-white'
                          : 'bg-muted text-muted-foreground'
                  }`}
                  aria-current={isCurrent || failed ? 'step' : undefined}
                >
                  {failed ? (
                    <X size={13} weight="bold" />
                  ) : done ? (
                    <Check size={13} weight="bold" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={`whitespace-nowrap text-sm font-medium ${
                    failed
                      ? 'text-fail'
                      : isCurrent
                        ? 'text-orange-deep'
                        : done
                          ? 'text-pass'
                          : 'text-muted-foreground'
                  } ${isCurrent || failed ? '' : 'hidden md:inline'}`}
                >
                  {failed ? (
                    <>
                      <span className="md:hidden">Terminated</span>
                      <span className="hidden md:inline">Interview terminated</span>
                    </>
                  ) : (
                    s.name
                  )}
                </span>
              </div>
              {i < PROCESS_STEPS.length - 1 && (
                <span
                  className={`h-px w-4 shrink-0 sm:min-w-4 sm:flex-1 ${done ? 'bg-pass/60' : 'bg-border'}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
