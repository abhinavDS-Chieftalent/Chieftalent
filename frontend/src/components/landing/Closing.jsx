import { CLOSING, SALES_LABEL, SALES_MAILTO } from './content.js'

/** Orange band that bookends the hero (the page stays one light theme). */
export default function Closing() {
  return (
    <section className="bg-orange text-ink">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-end md:justify-between md:py-20">
        <h2 className="display max-w-[16ch] text-[clamp(2rem,4.4vw,3.5rem)]">{CLOSING.title}</h2>
        <a
          href={SALES_MAILTO}
          className="inline-flex h-11 shrink-0 items-center self-start rounded-md bg-ink px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#2b2724] md:self-auto"
        >
          {SALES_LABEL}
        </a>
      </div>
    </section>
  )
}
