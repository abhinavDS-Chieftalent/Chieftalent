// Candidate interview flow + legal pages. Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-interview.mjs
// Behaviour (proctoring, timers, uploads) is frozen: these checks drive the real flow and assert the
// restyled screens, labels, headings and copy. Proctoring violations are NOT triggered here.
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { BASE, FIXTURES, launch, assert, done } from './test-helpers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const py = resolve(here, '../.venv/Scripts/python.exe')
const scratchDb = join(process.env.TEMP, 'chieftalent-scratch', 'data', 'hr_mvp.db')
const T = FIXTURES.tokens
const allErrors = []

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim()
const sql = (q) => {
  const r = spawnSync(py, ['-c', `import sqlite3; c=sqlite3.connect(r'${scratchDb}'); print(c.execute(r"""${q}""").fetchone()[0])`], { encoding: 'utf8' })
  return r.stdout.trim()
}
async function open(page, token) {
  await page.goto(`${BASE}/interview/${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20000 })
}
async function houseRules(page, label) {
  const r = await page.evaluate(() => {
    const all = [...document.querySelectorAll('body *')]
    return {
      h1: document.querySelectorAll('h1').length,
      upper: all.filter((e) => getComputedStyle(e).textTransform === 'uppercase').length,
      mono: all.filter((e) => /mono/i.test(getComputedStyle(e).fontFamily)).length,
      dashes: (document.body.innerText.match(/[—–]/g) || []).length,
      provider: /\bnvidia\b|\bnim\b/i.test(document.body.innerText),
      over: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  assert(r.h1 === 1, `${label}: exactly one h1 (got ${r.h1})`)
  assert(r.upper === 0 && r.mono === 0 && r.dashes === 0 && !r.provider, `${label}: no uppercase / mono / dashes / provider names (${JSON.stringify({ u: r.upper, m: r.mono, d: r.dashes, p: r.provider })})`)
  assert(r.over <= 0, `${label}: no horizontal page scroll (overflow ${r.over})`)
}

// ---------- verify -> details -> guidelines -> interview, in one browser ----------
{
  const { browser, page, errors } = await launch({ width: 1280, height: 900 })

  await open(page, T.verify)
  assert(/Verify it.s you/.test(await page.locator('h1').innerText()), 'verify: heading')
  assert(/i\*\*\*@example\.com/.test(await page.locator('body').innerText()), 'verify: email is masked')
  const steps = await page.locator('[aria-label="Interview process progress"] [role=listitem]').allInnerTexts()
  assert(steps.length === 5 && /Verify email/.test(steps[0]) && /Completed/.test(steps[4]), `stepper shows the five labelled steps (got ${steps.length})`)
  assert(/\b2\b/.test(steps[1]) && /\b5\b/.test(steps[4]), 'stepper keeps its numbers (a real sequence)')
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Interview process progress"] [role=listitem] span.font-medium')]
      .filter((s) => s.offsetParent !== null && s.scrollWidth > s.clientWidth + 1).map((s) => s.innerText))
  assert(clipped.length === 0, `stepper labels are never cut off at 1280px (clipped: ${clipped.join(', ') || 'none'})`)
  await houseRules(page, 'verify')

  await page.getByRole('button', { name: /verification code/i }).click()
  await page.waitForSelector('#verify-code')
  const code = sql(`SELECT code FROM interview_verifications WHERE interview_id=(SELECT id FROM interviews WHERE token='${T.verify}')`)
  assert(/^\d{6}$/.test(code), `verification code was issued (${code ? 'ok' : 'none'})`)
  assert((await page.getByLabel('6-digit code').count()) === 1, 'verify: code input has a visible label')
  const vc = await page.evaluate(() => { const i = document.querySelector('#verify-code'); return { name: i.getAttribute('name'), spell: i.spellcheck } })
  assert(vc.name === 'code' && vc.spell === false, `verify: code input has a name and spellcheck off (${JSON.stringify(vc)})`)
  await page.fill('#verify-code', '000000')
  await page.getByRole('button', { name: /Verify & continue/ }).click()
  await page.waitForFunction(() => /wrong code/i.test(document.body.innerText), null, { timeout: 8000 })
    .then(() => assert(true, 'verify: a wrong code shows an inline error'))
    .catch(() => assert(false, 'verify: a wrong code shows an inline error'))
  await page.fill('#verify-code', code)
  await page.getByRole('button', { name: /Verify & continue/ }).click()
  await page.waitForFunction(() => /Before we begin/.test(document.querySelector('h1')?.innerText || ''), null, { timeout: 10000 })
  assert(true, 'verify: the right code moves on to the details form')

  // details form
  await houseRules(page, 'details')
  for (const label of ['First Name', 'Last Name', 'Current City', 'Hometown', 'Current Company', 'Total Experience', 'Notice Period', 'Current CTC', 'Expected CTC', 'Number of Family Members', 'Number of Earning Family Members'])
    assert((await page.getByLabel(new RegExp(`^${label}`)).count()) >= 1, `details: field "${label}" has a label`)
  assert((await page.getByLabel(/three strongest skills/i).count()) === 1, 'details: skills question has a label')
  assert(/0\s*\/\s*300 characters minimum/.test(norm(await page.locator('body').innerText())), 'details: live 300-character counter')
  const fields = await page.evaluate(() => [...document.querySelectorAll('form input, form textarea')].filter((f) => !f.getAttribute('name') || !f.getAttribute('autocomplete')).map((f) => f.id))
  assert(fields.length === 0, `details: every field has a name and an autocomplete value (missing: ${fields.join(', ') || 'none'})`)
  assert(!/\.\.\./.test(await page.getByLabel(/three strongest skills/i).getAttribute('placeholder')), 'details: placeholder uses the ellipsis character')
  await page.getByRole('button', { name: /Submit & continue/ }).click() // required fields stop the submit natively
  await page.getByLabel('First Name').fill('Rohan')
  await page.getByLabel('Last Name').fill('Sethi')
  await page.getByLabel('Current City').fill('Jaipur')
  await page.getByLabel('Hometown').fill('Kota')
  await page.getByLabel(/^Total Experience/).fill('0')
  await page.getByLabel(/^Notice Period/).fill('0')
  await page.getByLabel(/^Current CTC/).fill('0')
  await page.getByLabel(/^Expected CTC/).fill('300000')
  await page.getByLabel('Number of Family Members').fill('4')
  await page.getByLabel('Number of Earning Family Members').fill('1')
  await page.getByLabel(/three strongest skills/i).fill('Too short.')
  await page.getByRole('button', { name: /Submit & continue/ }).click()
  assert(/at least 300 characters/i.test(await page.locator('body').innerText()), 'details: a too-short skills answer is rejected with a clear message')
  await page.getByLabel(/three strongest skills/i).fill('I write backend code in C# and Python and have built a library API with SQL Server. I explain things clearly and I like pairing with others. '.repeat(3))
  await page.getByRole('button', { name: /Submit & continue/ }).click()
  await page.waitForFunction(() => /proceeding to the online interview/i.test(document.querySelector('h1')?.innerText || ''), null, { timeout: 10000 })
  assert(true, 'details: a valid form moves on to the guidelines')

  // guidelines + device check
  await houseRules(page, 'guidelines')
  const g = norm(await page.locator('body').innerText())
  assert(/External voices and background conversations may be detected and flagged/.test(g), 'guidelines: wording is unchanged (voice sentence still present)')
  assert((await page.locator('ul li').count()) >= 10, 'guidelines: all ten guidelines are listed')
  const proceed = page.getByRole('button', { name: /Confirm & start interview/ })
  assert(await proceed.isDisabled(), 'guidelines: proceed is disabled at first')
  await page.getByRole('button', { name: /Enable camera & microphone/ }).click()
  await page.waitForFunction(() => /Camera and microphone are working/.test(document.body.innerText), null, { timeout: 10000 })
  assert(true, 'guidelines: device check passes with a camera and microphone')
  assert(await proceed.isDisabled(), 'guidelines: still disabled until both boxes are ticked')
  await page.getByLabel(/read and understood/i).check()
  await page.getByLabel(/accurate and truthful/i).check()
  assert(await proceed.isEnabled(), 'guidelines: enabled once both boxes are ticked and the device check passed')
  await browser.close()
  // the deliberate wrong code above makes the API answer 400 (and the page shows "wrong code"): expected
  allErrors.push(...errors.filter((e) => !/status of 400/.test(e)))
}

// ---------- the interview itself ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await open(page, T.interview)
  await page.waitForTimeout(2200)
  const body = norm(await page.locator('body').innerText())
  assert(/Tell me about yourself in brief/.test(await page.locator('h1').innerText()), 'runner: the question is the h1')
  assert(/Question 1 of 4/.test(body), `runner: shows "Question 1 of 4"`)
  assert(/Interview time left: \d+:\d\d/.test(body), 'runner: shows the 30-minute countdown')
  assert((await page.getByRole('dialog', { name: /full screen/i }).count()) >= 1 || /Continue in full screen/.test(body), 'runner: the fullscreen gate still appears (proctoring behaviour kept)')
  assert(/Save & continue/.test(body), 'runner: primary action is "Save & continue"')
  await houseRules(page, 'runner')
  await page.screenshot({ path: join(here, 'shots', 'redesign-interview-runner.png') })
  await browser.close()
  allErrors.push(...errors)
}

// ---------- end screens ----------
{
  const { browser, page, errors } = await launch({ width: 1280, height: 800 })
  await open(page, T.completed)
  assert(/Interview completed/.test(await page.locator('h1').innerText()) && /yash@dotstark\.com/.test(await page.locator('body').innerText()), 'completed: heading and the interview contact')
  await houseRules(page, 'completed')
  await open(page, T.aborted)
  const ab = norm(await page.locator('body').innerText())
  assert(/Interview terminated/.test(await page.locator('h1').innerText()) && /switched too many times/.test(ab) && /yash@dotstark\.com/.test(ab), 'aborted: heading, reason and the interview contact')
  await houseRules(page, 'aborted')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- legal pages ----------
{
  const { browser, page, errors } = await launch({ width: 1280, height: 800 })
  await page.goto(`${BASE}/terms`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  const terms = norm(await page.locator('body').innerText())
  assert(/hiring platform provided by DotStark/.test(terms) && !/internal/i.test(terms), 'terms: describes a platform for companies, no "internal tool"')
  assert(/sales@dotstark\.com/.test(terms) && /yash@dotstark\.com/.test(terms), 'terms: both contact addresses')
  assert(/uptime/i.test(terms) && /in writing/i.test(terms), 'terms: availability wording has no uptime promise unless agreed in writing')
  assert(/November 2026/.test(terms), 'terms: last updated is November 2026')
  await houseRules(page, 'terms')
  await page.goto(`${BASE}/privacy`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1')
  const priv = norm(await page.locator('body').innerText())
  assert(/through an AI API/.test(priv), 'privacy: AI processing is described as an AI API')
  assert(/yash@dotstark\.com/.test(priv) && /sales@dotstark\.com/.test(priv), 'privacy: both contact addresses')
  assert(/November 2026/.test(priv), 'privacy: last updated is November 2026')
  await houseRules(page, 'privacy')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- in-between widths: the stepper (all labels, non-shrinking) must never push the page sideways ----------
{
  const { browser, page, errors } = await launch({ width: 600, height: 800 })
  for (const w of [600, 640, 680, 700, 768]) {
    await page.setViewportSize({ width: w, height: 800 })
    for (const k of ['verify', 'aborted']) {
      await open(page, T[k])
      const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      assert(o <= 0, `${w}px: ${k} screen (stepper) has no horizontal scroll (overflow ${o})`)
    }
  }
  await browser.close()
  allErrors.push(...errors)
}

// ---------- 360px ----------
{
  const { browser, page, errors } = await launch({ width: 360, height: 740 })
  for (const k of ['guidelines', 'details', 'verify']) {
    await open(page, T[k])
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    assert(o <= 0, `360px: ${k} screen has no horizontal scroll (overflow ${o})`)
  }
  await browser.close()
  allErrors.push(...errors)
}

done(allErrors)
