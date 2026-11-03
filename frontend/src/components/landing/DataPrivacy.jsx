import { Link } from 'react-router-dom'
import { FACTS } from './content.js'

/** Left: the heading and where to read the full text. Right: the facts, which carry the content. */
export default function DataPrivacy() {
  return (
    <section id="data-privacy" className="bg-paper py-20 md:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-16">
        <div>
          <h2 className="text-[clamp(1.75rem,3.2vw,2.5rem)] font-extrabold leading-[1.08]">Data and privacy</h2>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
            <Link to="/privacy" className="link underline underline-offset-4">
              Privacy Policy
            </Link>
            <Link to="/terms" className="link underline underline-offset-4">
              Terms of Service
            </Link>
          </p>
        </div>

        <dl className="m-0 divide-y divide-line">
          {FACTS.map((f) => (
            <div key={f.q} className="grid gap-1 py-4 first:pt-0 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <dt className="font-bold">{f.q}</dt>
              <dd className="m-0 text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
