/**
 * ChiefTalent logo (transparent PNGs in public/brand/).
 *   onDark  - white wordmark/ink, for dark surfaces (sidebar, login panel, landing)
 *   mark    - the icon only (head + checkmark), no wordmark
 * Size it with the height utility only (e.g. className="h-8"); width follows. The width and height
 * attributes are the files' intrinsic size: they give the browser the aspect ratio up front so the
 * page does not shift when the image loads.
 */
const BASE = import.meta.env.BASE_URL

export default function Logo({ onDark = false, mark = false, className = 'h-8', alt = 'ChiefTalent' }) {
  const file = `chieftalent-${mark ? 'mark' : 'logo'}${onDark ? '-white' : ''}.png`
  return (
    <img
      src={`${BASE}brand/${file}`}
      alt={alt}
      width={mark ? 485 : 1000}
      height={mark ? 512 : 256}
      className={`w-auto select-none ${className}`}
      draggable={false}
    />
  )
}
