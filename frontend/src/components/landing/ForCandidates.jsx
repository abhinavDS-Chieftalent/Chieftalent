import { CANDIDATE_STEPS, SUPPORT_EMAIL, SUPPORT_MAILTO } from './content.js'

/** The candidate's path in order, as a single row of short steps (collapses to a column on mobile). */
export default function ForCandidates() {
  return (
    <section id="for-candidates" className="bg-paper py-20 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.08]">
          What a candidate goes through
        </h2>

        <ol className="mt-10 grid list-none gap-8 p-0 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          {CANDIDATE_STEPS.map((s) => (
            <li key={s.title} className="border-t-2 border-ink pt-4">
              <h3 className="text-base font-bold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>

        <p className="mt-10 max-w-[62ch]">
          Problem with a link or the interview? Write to{' '}
          <a href={SUPPORT_MAILTO} className="link underline underline-offset-4">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </section>
  )
}
