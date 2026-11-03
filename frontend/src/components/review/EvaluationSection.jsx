import { Check, X } from '@phosphor-icons/react'
import { asList } from './scoreKeys.js'

function Figure({ label, value, note }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="m-0">
        <span className="stat-num mt-1 block">{value}</span>
        <span className="text-xs text-muted-foreground">{note}</span>
      </dd>
    </div>
  )
}

function Points({ title, items, Icon, tone }) {
  return (
    <div>
      <h3 className="text-sm font-bold">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm leading-snug">
            <Icon size={14} weight="bold" className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
            <span className="min-w-0 break-words">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The AI evaluation: objective tally, spoken average, overall, summary, strengths, weaknesses. */
export default function EvaluationSection({ evaluation, objective }) {
  const correct = evaluation.objective_questions?.correct ?? objective.correct
  const total = evaluation.objective_questions?.total ?? objective.total
  return (
    <section data-review-section="evaluation" className="space-y-5 border-t border-line pt-8">
      <div>
        <h2 className="text-xl font-bold">AI evaluation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Objective answers are scored deterministically. Spoken answers are scored by the AI.
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-4">
        <Figure
          label="Objective"
          value={`${correct}/${total}`}
          note={`${Math.round(evaluation.objective_questions?.accuracy ?? 0)}% correct`}
        />
        <Figure label="Spoken average" value={evaluation.spoken_questions?.average_score ?? '-'} note="out of 10" />
        <Figure label="Overall" value={Math.round(evaluation.overall_interview_score ?? 0)} note="out of 100" />
      </dl>

      {evaluation.summary && (
        <p className="max-w-[70ch] border-t border-line pt-4 text-sm leading-relaxed">{evaluation.summary}</p>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Points title="Strengths" items={asList(evaluation.strengths)} Icon={Check} tone="text-pass" />
        <Points title="Weaknesses" items={asList(evaluation.weaknesses)} Icon={X} tone="text-fail" />
      </div>
    </section>
  )
}
