import { FRAGMENTS } from './Fragments.jsx'
import { STAGES } from './content.js'

/** A real sequence, so a rail connects the stages. Stage names are the labels (no numbers). */
export default function RoleTimeline() {
  return (
    <section id="how-it-works" className="bg-paper pb-20 md:pb-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 className="max-w-[24ch] text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.08]">
          How one role runs, from job to decision
        </h2>

        <ol className="mt-10 list-none border-l-2 border-line p-0">
          {STAGES.map((s) => {
            const Fragment = FRAGMENTS[s.key]
            return (
              <li
                key={s.key}
                className="relative grid grid-cols-[minmax(0,1fr)] gap-6 py-8 pl-6 before:absolute before:-left-[2px] before:top-9 before:h-7 before:w-[2px] before:bg-orange before:content-[''] md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-12 md:pl-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,32rem)]"
              >
                <div>
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 max-w-[44ch] text-muted-foreground">{s.text}</p>
                </div>
                <Fragment />
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
