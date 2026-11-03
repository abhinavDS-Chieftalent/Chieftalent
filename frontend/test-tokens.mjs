// Design-system floor: Archivo only, brand tokens, no mono / uppercase text, visible focus, head metadata.
// Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-tokens.mjs
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { BASE, launch, assert, done } from './test-helpers.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// --- source hygiene ---
const html = readFileSync(join(here, 'index.html'), 'utf8')
const css = readFileSync(join(here, 'src/index.css'), 'utf8')
assert(!/fonts\.googleapis|fonts\.gstatic/.test(html), 'index.html has no Google Fonts links')
assert(!/\b(Syne|DM Sans|DM Mono|Inter)\b/.test(html + css), 'no Syne / DM Sans / DM Mono / Inter anywhere in html or css')
assert(/rel="preload"[^>]*Archivo/.test(html), 'Archivo font is preloaded')
assert(/name="color-scheme"\s+content="light"/.test(html), 'color-scheme meta is light')
assert(/name="theme-color"\s+content="#13110F"/i.test(html), 'theme-color meta is ink')
assert(/name="description"/.test(html), 'meta description present')

// --- runtime ---
const { browser, page, errors } = await launch()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

const r = await page.evaluate(() => {
  const cs = (el) => getComputedStyle(el)
  const all = [...document.querySelectorAll('body *')]
  return {
    bodyFont: cs(document.body).fontFamily,
    archivoLoaded: [...document.fonts].some((f) => f.family.replace(/["']/g, '') === 'Archivo' && f.status === 'loaded'),
    upper: all.filter((e) => cs(e).textTransform === 'uppercase').map((e) => e.tagName + '.' + e.className).slice(0, 5),
    mono: all.filter((e) => /mono/i.test(cs(e).fontFamily)).map((e) => e.tagName + '.' + e.className).slice(0, 5),
    orange: cs(document.documentElement).getPropertyValue('--orange').trim(),
    ink: cs(document.documentElement).getPropertyValue('--ink').trim(),
    fog: cs(document.documentElement).getPropertyValue('--fog').trim(),
  }
})
assert(/^["']?Archivo/.test(r.bodyFont), `body font-family starts with Archivo (got ${r.bodyFont.slice(0, 40)})`)
assert(r.archivoLoaded, 'Archivo font face is actually loaded')
assert(r.upper.length === 0, `no uppercase-transformed text on /login ${r.upper.join(', ')}`)
assert(r.mono.length === 0, `no monospace text on /login ${r.mono.join(', ')}`)
assert(r.orange.toUpperCase() === '#EE5A2E', `--orange token is #EE5A2E (got "${r.orange}")`)
assert(r.ink.toUpperCase() === '#13110F', `--ink token is #13110F (got "${r.ink}")`)
assert(r.fog.toUpperCase() === '#F2F3F5', `--fog token is #F2F3F5 (got "${r.fog}")`)

// keyboard focus must be visible
await page.keyboard.press('Tab')
for (let i = 0; i < 6; i++) {
  const tag = await page.evaluate(() => document.activeElement?.tagName)
  if (tag === 'INPUT') break
  await page.keyboard.press('Tab')
}
const focus = await page.evaluate(() => {
  const s = getComputedStyle(document.activeElement)
  return { tag: document.activeElement.tagName, outline: s.outlineStyle !== 'none' && s.outlineWidth !== '0px', shadow: s.boxShadow !== 'none' }
})
assert(focus.tag === 'INPUT' && (focus.outline || focus.shadow), `focused input shows a visible ring (${JSON.stringify(focus)})`)

// images carry intrinsic dimensions (no layout shift)
const noDims = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).map((i) => i.alt || i.src))
assert(noDims.length === 0, `every <img> has width and height attributes (missing: ${noDims.join(', ') || 'none'})`)

await browser.close()
done(errors)
