import { AI_DOES, YOU_DO } from './content.js'

/** Two plain columns separated by a single rule. No cards. */
export default function WhoDoesWhat() {
  return (
    <section className="bg-fog py-20 md:py-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.08]">Who does what</h2>
        <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-0">
          <div className="md:pr-12">
            <h3 className="text-xl font-bold">What the AI does</h3>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 marker:text-orange-deep">
              {AI_DOES.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="md:border-l md:border-line md:pl-12">
            <h3 className="text-xl font-bold">What you do</h3>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 marker:text-orange-deep">
              {YOU_DO.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
