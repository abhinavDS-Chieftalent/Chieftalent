import { motion, useReducedMotion } from 'motion/react'
import { RANKED, SHORTLIST_LINE } from './content.js'

const STEP = 0.09 // seconds between bars
const DRAW = 0.5
const EASE = [0.22, 1, 0.36, 1]
const DIM = 0.55

/**
 * The one orchestrated moment on the page: CV scores draw in rank order, the shortlist line
 * appears, then everything under the line dims. Under prefers-reduced-motion the list is
 * rendered in its final state immediately. Transform and opacity only.
 */
export default function RankedList() {
  const reduce = useReducedMotion()
  const above = RANKED.filter((r) => r.score >= SHORTLIST_LINE)
  const below = RANKED.filter((r) => r.score < SHORTLIST_LINE)
  const barsDone = RANKED.length * STEP + DRAW // when the last bar has finished drawing
  const dimAt = barsDone + 0.5 // when the below-the-line rows dim

  // Motion props for an opacity change that happens after the bars and the line are in.
  const dimLater = (from, to) =>
    reduce
      ? { initial: false, animate: { opacity: to } }
      : { initial: { opacity: from }, animate: { opacity: to }, transition: { delay: dimAt, duration: 0.4 } }

  // Motion props for a bar: draws left to right; below-the-line bars then fade out (grey takes over).
  const barMotion = (index, dimmed) => {
    if (reduce) return { initial: false, animate: { scaleX: 1, opacity: dimmed ? 0 : 1 } }
    const draw = { duration: DRAW, delay: index * STEP, ease: EASE }
    return dimmed
      ? {
          initial: { scaleX: 0, opacity: 1 },
          animate: { scaleX: 1, opacity: 0 },
          transition: { scaleX: draw, opacity: { duration: 0.4, delay: dimAt } },
        }
      : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: draw }
  }

  // A render function, not a component: a component defined here would be a new type on every
  // render and remount (restart) the animation.
  const renderRow = (row, index, dimmed) => {
    const Text = dimmed ? motion.span : 'span'
    const textProps = dimmed ? dimLater(1, DIM) : {}
    return (
      <li key={row.name} className="grid grid-cols-[6.25rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
        <Text className="truncate font-semibold" {...textProps}>
          {row.name}
        </Text>
        <span className="relative block h-3">
          {dimmed && (
            <motion.span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-[#c9cdd4]"
              style={{ width: `${row.score}%` }}
              {...dimLater(0, 1)}
            />
          )}
          <motion.span
            data-ranked-bar
            aria-hidden="true"
            className="absolute inset-y-0 left-0 origin-left bg-ink"
            style={{ width: `${row.score}%` }}
            {...barMotion(index, dimmed)}
          />
        </span>
        <Text className="num text-right font-semibold" {...textProps}>
          {row.score}
        </Text>
      </li>
    )
  }

  return (
    <figure className="m-0 rounded-t-xl bg-paper p-5 text-ink md:p-6">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">Software Engineer, CV match</span>
        <span className="text-muted-foreground">Sample</span>
      </figcaption>

      <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
        {above.map((row, i) => renderRow(row, i, false))}

        <li aria-label={`Shortlist line at ${SHORTLIST_LINE}`} className="relative my-1 h-5">
          <motion.span
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 origin-left border-t-2 border-dashed border-orange-deep"
            {...(reduce
              ? { initial: false, animate: { scaleX: 1 } }
              : { initial: { scaleX: 0 }, animate: { scaleX: 1 }, transition: { delay: barsDone, duration: 0.5, ease: EASE } })}
          />
          <motion.span
            className="absolute right-0 top-0 bg-paper pl-2 text-xs font-semibold text-orange-deep"
            {...(reduce
              ? { initial: false, animate: { opacity: 1 } }
              : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { delay: barsDone + 0.25, duration: 0.3 } })}
          >
            Shortlist line {SHORTLIST_LINE}
          </motion.span>
        </li>

        {below.map((row, i) => renderRow(row, above.length + i, true))}
      </ol>

      <p className="mt-4 text-sm text-muted-foreground">
        The shortlist line is a setting, {SHORTLIST_LINE} by default. At or above it, a candidate is sent an interview link.
      </p>
    </figure>
  )
}
