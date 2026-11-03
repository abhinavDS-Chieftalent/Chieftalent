// Landing page checks. Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-landing.mjs
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { BASE, launch, assert, done } from './test-helpers.mjs'

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots')
mkdirSync(shots, { recursive: true })

const PLANNED = [
  'Situation-based video question',
  'Stronger interview integrity checks',
  'Server-side speech-to-text',
  'Video and voice analysis',
]

const allErrors = []

async function open(viewport, ctx = {}) {
  const r = await launch(viewport, ctx)
  await r.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await r.page.waitForSelector('h1')
  await r.page.waitForTimeout(1600) // let the single hero animation finish
  return r
}

// ---------- desktop: content, copy rules, structure ----------
{
  const { browser, page, errors } = await open({ width: 1440, height: 900 })

  const d = await page.evaluate((planned) => {
    const text = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim()
    const body = document.body.innerText
    const planSec = document.querySelector('#planned')
    const outside = body.replace(planSec?.innerText || '', '')
    const heads = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1])
    let skipsLevel = false
    heads.forEach((n, i) => { if (i && n - heads[i - 1] > 1) skipsLevel = true })
    const cs = (e) => getComputedStyle(e)
    const all = [...document.querySelectorAll('body *')]
    const mail = [...document.querySelectorAll('a[href="mailto:sales@dotstark.com"]')]
    const logo = document.querySelector('header img')
    const h1 = document.querySelector('h1')
    const fs = parseFloat(cs(h1).fontSize), lh = parseFloat(cs(h1).lineHeight) || fs * 0.93
    return {
      h1Count: document.querySelectorAll('h1').length,
      h1Text: text(h1),
      h1Lines: Math.round(h1.getBoundingClientRect().height / lh),
      // CTAs only: a link that merely displays the address (footer) is not a call to action
      mailCount: mail.filter((a) => !text(a).includes('@')).length,
      mailLabels: [...new Set(mail.map(text).filter((t) => !t.includes('@')))],
      loginInHeader: !!document.querySelector('header a[href="/login"]'),
      dashes: (body.match(/[—–]/g) || []).length,
      middleDots: (body.match(/·/g) || []).length,
      numberedHeadings: [...document.querySelectorAll('h1,h2,h3,h4')].map(text).filter((t) => /^0?\d\b/.test(t)),
      zeroNumbers: all.filter((e) => e.children.length === 0 && /^0\d$/.test(text(e))).length,
      uppercase: all.filter((e) => cs(e).textTransform === 'uppercase').length,
      mono: all.filter((e) => /mono/i.test(cs(e).fontFamily)).length,
      plannedTags: all.filter((e) => e.children.length === 0 && text(e) === 'Planned').length,
      plannedNamesInside: planned.filter((n) => text(planSec).includes(n)).length,
      plannedLeaks: /situation-based|second person|speech-to-text|voice analysis|spoof|gaze/i.test(outside),
      candidateContact: text(document.querySelector('#for-candidates')).includes('yash@dotstark.com'),
      providerNames: /\bnvidia\b|\bnim\b/i.test(body),
      // claims the product does not back up (reviewer findings): no editable scores, ATS rejections are
      // automatic, the shortlist line is a setting and not a control on the page
      falseClaims: (body.match(/override (any|a) score|every hire and every rejection|reviewer makes every decision|You set the line|You set it\b/gi) || []),
      overrule: /overrule/i.test(body),
      // inline links must look like links: a utility `underline` has to beat the base .link rule
      plainLinks: [...document.querySelectorAll('main a.link.underline')].filter((a) => !getComputedStyle(a).textDecorationLine.includes('underline')).map(text),
      logoAlt: logo?.getAttribute('alt'),
      logoSrc: logo?.getAttribute('src') || '',
      landmarks: ['header', 'main', 'footer'].every((t) => document.querySelector(t)),
      anchors: ['how-it-works', 'for-candidates', 'data-privacy', 'planned', 'main'].filter((id) => !document.getElementById(id)),
      skipsLevel,
      heroMailTop: mail[0] ? mail[0].getBoundingClientRect().bottom : 9999,
      transitionAll: all.filter((e) => cs(e).transitionProperty === 'all' && cs(e).transitionDuration !== '0s').length,
    }
  }, PLANNED)

  assert(d.h1Count === 1, 'exactly one h1')
  assert(/Fifty CVs in\.\s*A shortlist out\./.test(d.h1Text), `h1 reads "Fifty CVs in. A shortlist out." (got "${d.h1Text}")`)
  assert(d.h1Lines <= 2, `h1 fits in 2 lines at 1440 (got ${d.h1Lines})`)
  assert(d.mailCount >= 2, `at least two Talk to DotStark mailto links (got ${d.mailCount})`)
  assert(d.mailLabels.length === 1 && d.mailLabels[0] === 'Talk to DotStark', `one label for the sales intent (got ${JSON.stringify(d.mailLabels)})`)
  assert(d.loginInHeader, 'top bar has a Sign in link to /login')
  assert(d.dashes === 0, `zero em/en dashes in visible text (got ${d.dashes})`)
  assert(d.middleDots === 0, `no middle-dot separators (got ${d.middleDots})`)
  assert(d.numberedHeadings.length === 0 && d.zeroNumbers === 0, `no 01/02/03 style markers ${d.numberedHeadings.join('|')}`)
  assert(d.uppercase === 0, `no uppercase-transformed text (got ${d.uppercase})`)
  assert(d.mono === 0, `no monospace text (got ${d.mono})`)
  assert(d.plannedTags === 4 && d.plannedNamesInside === 4, `Planned section has the 4 features, each tagged (tags=${d.plannedTags}, names=${d.plannedNamesInside})`)
  assert(!d.plannedLeaks, 'no planned feature is described outside the Planned section')
  assert(d.candidateContact, 'For candidates section gives yash@dotstark.com')
  assert(!d.providerNames, 'no provider names visible')
  assert(d.falseClaims.length === 0, `no claims the product does not support (found: ${d.falseClaims.join(' | ') || 'none'})`)
  assert(d.overrule, 'copy says what HR can really do: overrule the AI recommendation')
  assert(d.plainLinks.length === 0, `inline links with an underline class are actually underlined (plain: ${d.plainLinks.join(', ') || 'none'})`)
  assert(d.logoAlt === 'ChiefTalent' && /chieftalent-logo-white\.png$/.test(d.logoSrc), `top bar uses the full-colour logo (alt=${d.logoAlt}, src=${d.logoSrc.slice(-32)})`)
  assert(d.landmarks, 'header, main and footer landmarks exist')
  assert(d.anchors.length === 0, `anchor targets exist (missing: ${d.anchors.join(', ')})`)
  assert(!d.skipsLevel, 'heading levels never skip')
  assert(d.heroMailTop <= 900, `hero CTA is above the fold at 1440x900 (bottom=${Math.round(d.heroMailTop)})`)
  assert(d.transitionAll === 0, 'no `transition: all` anywhere')

  // skip link: first Tab stop, and it works
  await page.keyboard.press('Tab')
  const skip = await page.evaluate(() => ({ t: document.activeElement?.textContent?.trim(), h: document.activeElement?.getAttribute('href') }))
  assert(/skip to main content/i.test(skip.t || '') && skip.h === '#main', `first Tab stop is the skip link (got ${JSON.stringify(skip)})`)

  await page.screenshot({ path: join(shots, 'redesign-landing-1440.png'), fullPage: true })
  await browser.close()
  allErrors.push(...errors)
}

// ---------- every width: no horizontal page scroll, hero fits, h1 stays within 2 lines ----------
for (const [w, h] of [[768, 1024], [390, 844], [360, 740]]) {
  const { browser, page, errors } = await open({ width: w, height: h })
  const m = await page.evaluate(() => {
    const h1 = document.querySelector('h1')
    const lh = parseFloat(getComputedStyle(h1).lineHeight) || parseFloat(getComputedStyle(h1).fontSize) * 0.93
    const cta = document.querySelector('a[href="mailto:sales@dotstark.com"]')
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      lines: Math.round(h1.getBoundingClientRect().height / lh),
      ctaBottom: cta ? cta.getBoundingClientRect().bottom : 9999,
    }
  })
  assert(m.overflow <= 0, `${w}px: no horizontal page scroll (overflow=${m.overflow})`)
  assert(m.lines <= 2, `${w}px: h1 within 2 lines (got ${m.lines})`)
  if (w <= 390) assert(m.ctaBottom <= h, `${w}px: hero CTA above the fold (bottom=${Math.round(m.ctaBottom)} of ${h})`)
  await page.screenshot({ path: join(shots, `redesign-landing-${w}.png`), fullPage: true })
  await browser.close()
  allErrors.push(...errors)
}

// ---------- reduced motion: the ranked list is already in its final state ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ranked-bar]')
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('[data-ranked-bar]')].map((b) => getComputedStyle(b).transform),
  )
  const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'
  assert(bars.length === 6 && bars.every(identity), `reduced motion: all 6 bars drawn immediately (${bars.length} bars, transforms ${[...new Set(bars)].join(' | ')})`)
  await browser.close()
  allErrors.push(...errors)
}

done(allErrors)
