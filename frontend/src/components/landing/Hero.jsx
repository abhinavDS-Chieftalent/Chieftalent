import RankedList from './RankedList.jsx'
import { HERO, SALES_LABEL, SALES_MAILTO } from './content.js'

/** Orange field. Text on it is ink (white fails AA on this orange). Headline fits two lines. */
export default function Hero() {
  return (
    <section className="bg-orange text-ink">
      <div className="mx-auto grid max-w-[1200px] items-end gap-10 px-4 pt-14 sm:px-6 md:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div className="pb-10 lg:pb-16">
          <h1 className="display text-[clamp(2.5rem,5.4vw,4.75rem)]">
            <span className="block">{HERO.line1}</span>
            <span className="block">{HERO.line2}</span>
          </h1>
          <p className="mt-6 max-w-[34ch] text-lg font-medium leading-snug">{HERO.sub}</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href={SALES_MAILTO}
              className="inline-flex h-11 items-center rounded-md bg-ink px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#2b2724]"
            >
              {SALES_LABEL}
            </a>
            <a
              href="#how-it-works"
              className="rounded-sm text-[15px] font-semibold underline decoration-2 underline-offset-4 hover:no-underline"
            >
              {HERO.secondary}
            </a>
          </div>
        </div>
        <RankedList />
      </div>
    </section>
  )
}
