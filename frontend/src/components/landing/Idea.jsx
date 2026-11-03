import { IDEA } from './content.js'

/** One stacked statement: headline over text, text capped at 65ch. */
export default function Idea() {
  return (
    <section className="bg-paper py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 className="max-w-[20ch] text-[clamp(2rem,4.4vw,3.5rem)] font-extrabold leading-[1.04]">{IDEA.title}</h2>
        <div className="mt-6 max-w-[62ch] space-y-4 text-lg text-foreground/85">
          {IDEA.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  )
}
