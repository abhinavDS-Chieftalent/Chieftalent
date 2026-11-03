// Candidate review page. Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-review.mjs
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { BASE, FIXTURES, launch, login, assert, done } from './test-helpers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ids = FIXTURES.candidate_ids
const [adminEmail, adminPw] = FIXTURES.creds.admin
const allErrors = []

async function openCandidate(page, id) {
  await page.goto(`${BASE}/admin/candidate/${id}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main h1, h1', { timeout: 30000 })
  await page.waitForSelector('[data-review-ready]', { timeout: 30000 })
}
const text = (page, sel) => page.locator(sel).innerText().then((t) => t.replace(/\s+/g, ' '))

// ---------- evaluated candidate: the full page ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, adminEmail, adminPw)
  await openCandidate(page, ids.evaluated)

  const d = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('[data-review-section]')]
    const all = [...document.querySelectorAll('body *')]
    return {
      h1s: document.querySelectorAll('h1').length,
      h1: document.querySelector('h1')?.innerText.trim(),
      sections: secs.map((s) => s.getAttribute('data-review-section')),
      boxedSections: secs.filter((s) => parseFloat(getComputedStyle(s).borderLeftWidth) > 0).length,
      upper: all.filter((e) => getComputedStyle(e).textTransform === 'uppercase').length,
      mono: all.filter((e) => /mono/i.test(getComputedStyle(e).fontFamily)).length,
      dashes: (document.body.innerText.match(/[—–]/g) || []).length,
      provider: /\bnvidia\b|\bnim\b/i.test(document.body.innerText),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      cv: !!document.querySelector('a[href$="/cv"]'),
    }
  })
  assert(d.h1s === 1 && d.h1 === 'Aarav Mehta', `one h1 with the candidate name (got ${d.h1s} / "${d.h1}")`)
  for (const s of ['ats', 'details', 'interview', 'evaluation'])
    assert(d.sections.includes(s), `section "${s}" is present`)
  assert(d.boxedSections === 0, `sections are divided by rules, not boxed in cards (${d.boxedSections} boxed)`)
  assert(d.upper === 0 && d.mono === 0 && d.dashes === 0 && !d.provider, `no uppercase / mono / dashes / provider names (${JSON.stringify({ u: d.upper, m: d.mono, d: d.dashes, p: d.provider })})`)
  assert(d.overflow <= 0, `no horizontal page scroll (overflow ${d.overflow})`)
  assert(d.cv, 'CV download link is present')

  // ATS section
  const ats = await text(page, '[data-review-section="ats"]')
  assert(/C# and OOP/.test(ats) && /SQL and relational databases/.test(ats) && /REST APIs/.test(ats), 'ATS lists the matched requirements')
  assert(/Docker or deployment exposure/.test(ats), 'ATS lists the missing requirement')
  assert(/Solid junior profile/.test(ats), 'ATS shows the reasoning')

  // pre-interview details (never scored)
  const det = await text(page, '[data-review-section="details"]')
  assert(/Jaipur/.test(det) && /Kota/.test(det) && /never scored/i.test(det), 'details section shows the form data and says it is never scored')

  // breathing room: content blocks inside a section must not touch the block above them
  const gaps = await page.evaluate(() => {
    const gap = (sectionName, selA, selB) => {
      const s = document.querySelector(`[data-review-section="${sectionName}"]`)
      const a = s.querySelector(selA), b = [...s.querySelectorAll(selB)].find((e) => e !== a && e.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)
      return Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom)
    }
    return { details: gap('details', 'dl', 'h3'), evaluation: gap('evaluation', 'dl', 'p') }
  })
  assert(gaps.details >= 12, `details grid and skills description are separated (gap ${gaps.details}px)`)
  assert(gaps.evaluation >= 12, `evaluation figures and summary are separated (gap ${gaps.evaluation}px)`)

  // answers: spoken answer with recording, transcript, five score labels
  const first = page.locator('[data-answer]').first()
  const firstText = (await first.innerText()).replace(/\s+/g, ' ')
  assert(/REST API in ASP\.NET Core/.test(firstText), 'spoken answer shows its transcript')
  assert((await first.locator('video').count()) === 1 && /\/admin\/recording\/\d+\/video$/.test(await first.locator('video').getAttribute('src')), 'spoken answer has a playable recording')
  assert((await first.locator('a[href$="/video/download"]').count()) === 1, 'spoken answer has a Download video link')
  for (const [label, n] of [['content', '7'], ['relevance', '8'], ['communication', '8'], ['completeness', '7'], ['overall', '7.5']])
    assert(new RegExp(`${label}\\s*${n.replace('.', '\\.')}`).test(firstText), `score badge "${label} ${n}" shows`)
  assert(/Relevant and concise/.test(firstText), 'per-answer feedback line shows')

  // MCQ answers: expected answer and correct / wrong marks
  const mcq = await page.locator('[data-answer]').allInnerTexts()
  assert(mcq.length === 4, `4 answers listed (got ${mcq.length})`)
  assert(/correct/i.test(mcq[1]) && !/wrong/i.test(mcq[1]), 'MCQ 1 is marked correct')
  assert(/wrong/i.test(mcq[2]) && /Combines rows from two tables/.test(mcq[2]), 'MCQ 2 is marked wrong and shows the expected answer')
  assert(/correct/i.test(mcq[3]) && !/wrong/i.test(mcq[3]), 'MCQ 3 is marked correct')

  // evaluation
  const ev = await text(page, '[data-review-section="evaluation"]')
  assert(/2\s*\/\s*3/.test(ev) && /67%/.test(ev), `objective tally reads 2/3 and 67% (got "${ev.slice(0, 160)}")`)
  assert(/7\.5/.test(ev) && /71/.test(ev), 'spoken average 7.5 and overall 71 show')
  assert(/Clear, relevant introduction/.test(ev) && /Concrete project evidence/.test(ev) && /SQL JOIN basics/.test(ev), 'summary, strengths and weaknesses show')
  assert(/Progress/.test(await page.locator('header').first().innerText()), 'recommendation badge says Progress')

  // retake opens a confirm dialog (we cancel: no state change)
  await page.getByRole('button', { name: /Retake interview/ }).click()
  await page.waitForSelector('[role=alertdialog]')
  assert(/Retake interview for Aarav Mehta/.test(await page.locator('[role=alertdialog]').innerText()), 'retake asks for confirmation first')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForSelector('[role=alertdialog]', { state: 'detached' })

  // manual review: save "Needs more review" and see it recorded
  await page.getByLabel('Review decision').click()
  await page.getByRole('option', { name: 'Needs more review' }).click()
  await page.getByLabel('Review notes').fill('Check the SQL answer on a call.')
  await page.getByRole('button', { name: 'Save review' }).click()
  await page.waitForFunction(() => /Last review:\s*manual_review/.test(document.body.innerText), null, { timeout: 15000 })
    .then(() => assert(true, 'saving a review records it ("Last review: manual_review")'))
    .catch(() => assert(false, 'saving a review records it ("Last review: manual_review")'))

  await page.screenshot({ path: join(here, 'shots', 'redesign-review-1440.png'), fullPage: true })
  await browser.close()
  allErrors.push(...errors)
}

// ---------- rejected candidate with no interview: empty states and the override ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, adminEmail, adminPw)
  await openCandidate(page, ids.rejected)
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  assert(/No interview yet/i.test(body) && /No answers recorded/i.test(body), 'no interview: says so instead of leaving a blank section')
  assert((await page.locator('[data-review-section="evaluation"]').count()) === 0, 'no evaluation section without an evaluation')
  assert(await page.getByRole('button', { name: /Manually shortlist/ }).isVisible(), 'rejected candidate offers the manual shortlist override')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- candidate who has not verified their email: HR sees the code ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, adminEmail, adminPw)
  await openCandidate(page, ids.verify)
  assert(/Verification code:\s*123456/.test((await page.locator('header').first().innerText()).replace(/\s+/g, ' ')), 'unverified candidate shows the support verification code')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- long name and email ----------
for (const [w, h] of [[1440, 900], [360, 740]]) {
  const { browser, page, errors } = await launch({ width: w, height: h })
  await login(page, adminEmail, adminPw)
  await openCandidate(page, ids.long)
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(o <= 0, `${w}px: 70-character name and email do not break the page (overflow ${o})`)
  await browser.close()
  allErrors.push(...errors)
}

// ---------- 360px, full page ----------
{
  const { browser, page, errors } = await launch({ width: 360, height: 740 })
  await login(page, adminEmail, adminPw)
  await openCandidate(page, ids.evaluated)
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(o <= 0, `360px: evaluated candidate page has no horizontal scroll (overflow ${o})`)
  await page.screenshot({ path: join(here, 'shots', 'redesign-review-360.png'), fullPage: true })
  await browser.close()
  allErrors.push(...errors)
}

done(allErrors)
