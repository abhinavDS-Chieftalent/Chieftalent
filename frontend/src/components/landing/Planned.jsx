import { Badge } from '@/components/ui/badge'
import { PLANNED } from './content.js'

/** Specified but not built yet. Every row is tagged, none has a date, nothing here is live today. */
export default function Planned() {
  return (
    <section id="planned" className="bg-fog py-20 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.08]">
          What we are building next
        </h2>

        <dl className="mt-10 space-y-8">
          {PLANNED.map((p) => (
            <div key={p.name} className="grid gap-2 md:grid-cols-[20rem_minmax(0,1fr)] md:gap-10">
              <dt className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {p.name}
                <Badge variant="outline">Planned</Badge>
              </dt>
              <dd className="m-0 max-w-[62ch] text-muted-foreground">{p.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
