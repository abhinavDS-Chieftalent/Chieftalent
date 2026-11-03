// Dashboard checks. Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-dashboard.mjs
import { spawnSync } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { BASE, FIXTURES, launch, login, assert, done } from './test-helpers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const py = resolve(here, '../.venv/Scripts/python.exe')
const scratchDb = join(process.env.TEMP, 'chieftalent-scratch', 'data', 'hr_mvp.db')
const [adminEmail, adminPw] = FIXTURES.creds.admin
const ROLE = 'net_development_intern'
const allErrors = []

const rowCount = (page) => page.locator('tbody tr').filter({ has: page.locator('td a') }).count()
async function openDashboard(page, query = '') {
  await page.goto(`${BASE}/admin${query}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-dashboard-ready]', { timeout: 30000 })
}
const tabText = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}\\b`) }).innerText().then((t) => t.replace(/\s+/g, ' '))

// ---------- desktop admin ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, adminEmail, adminPw)
  await openDashboard(page)

  // stats: one strip (not four floating cards), each number paired with a chart of real data
  await page.waitForTimeout(1200) // let the one-time bar draw-in finish before measuring
  const stats = await page.evaluate(() => {
    const g = (k) => document.querySelector(`[data-stat="${k}"]`)
    const val = (k) => g(k)?.querySelector('[data-stat-value]')?.innerText.trim()
    const bar = document.querySelector('[data-stage-bar]')
    const seg = (k) => bar?.querySelector(`[data-stage="${k}"]`)
    return {
      total: val('total'), shortlisted: val('shortlisted'), interviewing: val('interviewing'), avg: val('avg'),
      strips: document.querySelectorAll('[data-stats]').length,
      fullyBordered: ['total', 'shortlisted', 'interviewing', 'avg'].filter((k) => {
        const s = getComputedStyle(g(k)); return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].every((w) => parseFloat(w) > 0)
      }).length,
      segments: bar ? [...bar.querySelectorAll('[data-stage]')].map((e) => e.getAttribute('data-stage')) : [],
      shortlistedShare: bar && seg('shortlisted') ? seg('shortlisted').offsetWidth / bar.offsetWidth : 0,
      barLabel: bar?.getAttribute('aria-label') || '',
      shortlistedText: g('shortlisted')?.innerText.replace(/\s+/g, ' '),
      avgText: g('avg')?.innerText.replace(/\s+/g, ' '),
      clickable: ['total', 'shortlisted', 'interviewing'].filter((k) => g(k).tagName === 'BUTTON').length,
    }
  })
  assert(stats.total === '9' && stats.shortlisted === '6' && stats.interviewing === '0', `stats show 9 / 6 / 0 (got ${stats.total} / ${stats.shortlisted} / ${stats.interviewing})`)
  assert(/^71/.test(stats.avg || ''), `average interview score shows 71 (got ${stats.avg})`)
  assert(stats.strips === 1 && stats.fullyBordered === 0, `stats sit in one strip, not four bordered cards (strips=${stats.strips}, boxed cells=${stats.fullyBordered})`)
  assert(['shortlisted', 'evaluated', 'rejected', 'other'].every((s) => stats.segments.includes(s)) && !stats.segments.includes('interviewing'), `stage bar has one segment per non-empty stage (got ${stats.segments.join(', ')})`)
  assert(Math.abs(stats.shortlistedShare - 6 / 9) < 0.05, `shortlisted segment is about 6/9 of the bar (got ${stats.shortlistedShare.toFixed(2)})`)
  assert(/6 shortlisted/.test(stats.barLabel) && /1 evaluated/.test(stats.barLabel), `stage bar has a text alternative (got "${stats.barLabel}")`)
  assert(/67%/.test(stats.shortlistedText || ''), `shortlisted cell says 67% of candidates (got "${stats.shortlistedText}")`)
  assert(/from 1 interview\b/.test(stats.avgText || ''), `average cell says what it is based on (got "${stats.avgText}")`)
  assert(stats.clickable === 3, `total, shortlisted and interviewing cells are buttons (got ${stats.clickable})`)

  // the table must fit at desktop width, even with a 70-character name in it (no sideways scroll inside it)
  const tableOver = await page.evaluate(() => {
    const w = document.querySelector('section[aria-label="Candidates"] table').parentElement
    return w.scrollWidth - w.clientWidth
  })
  assert(tableOver <= 0, `candidates table fits at 1440px with no inner horizontal scroll (overflow ${tableOver}px)`)

  // tabs, counts, filtering
  for (const [name, n] of [['All', 9], ['Shortlisted', 6], ['Interviewing', 0], ['Evaluated', 1], ['Rejected', 1]]) {
    const t = await tabText(page, name)
    assert(t === `${name} (${n})`, `tab reads "${name} (${n})" with the count in brackets (got "${t}")`)
  }

  // role names are shown in full, never cut with an ellipsis
  const role = await page.evaluate(() => {
    const cell = document.querySelector('tbody tr td:nth-child(2)')
    const range = document.createRange()
    range.selectNodeContents(cell)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    return { text: cell.innerText.replace(/\s+/g, ' ').trim(), lines, clipped: cell.scrollWidth > cell.clientWidth + 1 || getComputedStyle(cell).textOverflow === 'ellipsis' }
  })
  assert(role.text === 'Net Development Intern' && !role.clipped, `role is shown in full (got "${role.text}", clipped=${role.clipped})`)
  assert(role.lines === 1, `a normal role name sits on one line, not wrapped (lines=${role.lines})`)

  // clicking a stats cell filters the table to that stage
  await page.locator('[data-stat="shortlisted"]').click()
  assert((await page.getByRole('tab', { name: /^Shortlisted/ }).getAttribute('aria-selected')) === 'true' && (await rowCount(page)) === 6, 'clicking the Shortlisted cell selects that tab (6 rows)')
  assert((await page.locator('[data-stat="shortlisted"]').getAttribute('aria-pressed')) === 'true', 'the active cell is marked pressed')
  await page.locator('[data-stat="total"]').click()
  assert((await rowCount(page)) === 9, 'clicking the Total cell goes back to all 9')

  // ---- filters and sorting ----
  const pick = async (label, option) => {
    await page.getByLabel(label, { exact: true }).click()
    await page.getByRole('option', { name: option }).click()
  }
  const names = () => page.locator('tbody tr td a').allInnerTexts()
  const count = () => page.locator('[data-result-count]').innerText().then((t) => t.replace(/\s+/g, ' '))
  assert(/Showing 9 of 9/.test(await count()), `result count starts at "Showing 9 of 9" (got "${await count()}")`)

  await pick('Status', /^Interview sent/)
  assert((await rowCount(page)) === 6 && /status=interview_sent/.test(page.url()), `status filter "Interview sent" shows 6 rows and is kept in the URL (rows=${await rowCount(page)})`)
  assert(/Showing 6 of 9/.test(await count()), 'result count follows the filter')
  await pick('ATS score', /^80 and above/)
  assert((await rowCount(page)) === 1 && (await names())[0] === 'Arjun Rawat', `status + ATS 80 and above leaves only Arjun Rawat (got ${(await names()).join(', ')})`)
  await pick('ATS score', /^Not scored/)
  assert((await rowCount(page)) === 0 && /match these filters/i.test(await page.locator('tbody').innerText()), 'a filter combination with no match says so and offers a reset')
  await page.getByRole('button', { name: 'Reset filters' }).first().click()
  assert((await rowCount(page)) === 9 && !/status=|ats=/.test(page.url()), 'Reset filters restores all 9 rows and clears the URL')

  await pick('ATS score', /^Below the threshold/)
  assert((await names()).join() === 'Kabir Anand', 'ATS "below the threshold" shows only Kabir Anand (41)')
  await pick('ATS score', /^Any/)
  await pick('Interview score', /^Not interviewed/)
  assert((await rowCount(page)) === 8, `interview score "Not interviewed" shows 8 rows (got ${await rowCount(page)})`)
  await pick('Interview score', /^60 to 79/)
  assert((await names()).join() === 'Aarav Mehta', 'interview score "60 to 79" shows only Aarav Mehta (71)')
  await page.getByRole('button', { name: 'Reset filters' }).first().click()

  await pick('Sort by', /^ATS score, high to low/)
  let order = await names()
  assert(order[0] === 'Arjun Rawat' && order[order.length - 1] === 'Kabir Anand', `sorting by ATS high to low puts Arjun first and Kabir last (got ${order[0]} ... ${order[order.length - 1]})`)
  await pick('Sort by', /^Name, A to Z/)
  order = await names()
  assert(order[0] === 'Aarav Mehta' && order[order.length - 1] === 'Tanvi Joshi', `sorting by name puts Aarav first and Tanvi last (got ${order[0]} ... ${order[order.length - 1]})`)
  await page.getByRole('button', { name: 'Reset filters' }).first().click()

  // a filtered view can be bookmarked and shared
  await openDashboard(page, '?status=interview_sent&sort=ats-desc')
  order = await names()
  assert(order.length === 6 && order[0] === 'Arjun Rawat', `a filtered, sorted URL opens already filtered (got ${order.length} rows, first ${order[0]})`)
  assert(/Interview sent/.test(await page.getByLabel('Status', { exact: true }).innerText()), 'the Status control shows the filter from the URL')
  await openDashboard(page)
  assert((await rowCount(page)) === 9, 'no URL filters: all 9 rows again')
  assert((await rowCount(page)) === 9, `All tab lists 9 rows (got ${await rowCount(page)})`)
  await page.getByRole('tab', { name: /^Rejected/ }).click()
  assert((await rowCount(page)) === 1 && (await page.locator('tbody').innerText()).includes('Kabir Anand'), 'Rejected tab shows only Kabir Anand')
  await page.getByRole('tab', { name: /^Evaluated/ }).click()
  assert((await rowCount(page)) === 1 && (await page.locator('tbody').innerText()).includes('Aarav Mehta'), 'Evaluated tab shows only Aarav Mehta')
  await page.getByRole('tab', { name: /^All/ }).click()

  // copy link, admin-only delete with confirm
  assert((await page.locator('button:has-text("Copy link")').count()) === 8, `8 rows have a Copy link (got ${await page.locator('button:has-text("Copy link")').count()})`)
  const del = page.locator('tbody button[aria-label^="Delete "]')
  assert((await del.count()) === 9, `admin sees 9 delete controls (got ${await del.count()})`)
  await del.first().click()
  await page.waitForSelector('[role=alertdialog]')
  assert(/permanently removes/i.test(await page.locator('[role=alertdialog]').innerText()), 'delete asks for confirmation first')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForSelector('[role=alertdialog]', { state: 'detached' })
  assert((await rowCount(page)) === 9, 'cancelling the delete keeps all 9 rows')

  // intake controls keep working
  const jdBtn = page.getByRole('button', { name: 'Create role from text' })
  assert(await jdBtn.isDisabled(), 'JD paste button starts disabled')
  await page.getByLabel('Raw JD text').fill('too short')
  assert(await jdBtn.isDisabled(), 'JD paste button stays disabled under 40 characters')
  await page.getByLabel('Raw JD text').fill('Senior Python Developer. We need five years of Python and Django experience.')
  assert(await jdBtn.isEnabled(), 'JD paste button enables at 40+ characters')
  assert((await page.locator(`a[href="/api/admin/jd/${ROLE}/pdf"]`).count()) >= 1, 'JD PDF download link points at the selected role')
  assert((await page.locator('input[type=file][accept=".pdf"][multiple]').count()) === 1, 'CV upload accepts multiple PDFs')
  assert((await page.locator('input[type=file][accept=".pdf,.txt"]').count()) === 1, 'JD upload accepts PDF and TXT')
  assert(/Net Development Intern/i.test(await page.getByLabel('Job role', { exact: true }).innerText()), 'CV role select shows the role')
  assert(/70/.test(await page.getByText(/ATS threshold/i).first().innerText()), 'ATS threshold 70 is shown')

  // long name and email: row stays compact, page never scrolls sideways
  const long = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tbody tr')].find((r) => /Maximiliano/.test(r.innerText))
    return { h: row.getBoundingClientRect().height, over: document.documentElement.scrollWidth - window.innerWidth }
  })
  assert(long.h <= 110, `70-character name row stays compact (height ${Math.round(long.h)}px)`)
  assert(long.over <= 0, `no horizontal page scroll with the long row (overflow ${long.over})`)

  // house rules
  const house = await page.evaluate(() => {
    const all = [...document.querySelectorAll('body *')]
    return {
      upper: all.filter((e) => getComputedStyle(e).textTransform === 'uppercase').length,
      mono: all.filter((e) => /mono/i.test(getComputedStyle(e).fontFamily)).length,
      dashes: (document.body.innerText.match(/[â€”â€“]/g) || []).length,
      transitionAll: all.filter((e) => getComputedStyle(e).transitionProperty === 'all' && getComputedStyle(e).transitionDuration !== '0s').length,
    }
  })
  assert(house.upper === 0 && house.mono === 0 && house.dashes === 0 && house.transitionAll === 0, `no uppercase / mono / dashes / transition-all (${JSON.stringify(house)})`)
  await page.screenshot({ path: join(here, 'shots', 'redesign-dashboard-1440.png'), fullPage: true })

  // empty states
  await openDashboard(page, '?role=nonexistent_role')
  const empty = await page.locator('tbody').innerText()
  assert((await rowCount(page)) === 0 && /No candidates/i.test(empty) && /upload/i.test(empty), 'empty role filter explains what to do next')

  // live polling picks up a change made behind the page's back
  await openDashboard(page)
  const upd = spawnSync(py, ['-c', `import sqlite3; c=sqlite3.connect(r'${scratchDb}'); c.execute("UPDATE candidates SET status='evaluation_completed' WHERE name='Kabir Anand'"); c.commit()`])
  assert(upd.status === 0, 'test fixture update applied')
  await page.waitForFunction(() => /Evaluated\D*2\b/.test(document.querySelector('[role=tablist]')?.innerText.replace(/\s+/g, ' ') || ''), null, { timeout: 15000 })
    .then(() => assert(true, 'polling updates the tab counts without a reload (Evaluated 2)'))
    .catch(() => assert(false, 'polling updates the tab counts without a reload (Evaluated 2)'))
  spawnSync(py, ['-c', `import sqlite3; c=sqlite3.connect(r'${scratchDb}'); c.execute("UPDATE candidates SET status='rejected' WHERE name='Kabir Anand'"); c.commit()`])
  await browser.close()
  allErrors.push(...errors)
}

// ---------- recruiter: no delete ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, ...FIXTURES.creds.recruiter)
  await openDashboard(page)
  assert((await page.locator('tbody button[aria-label^="Delete "]').count()) === 0, 'recruiter sees no delete controls')
  assert(await page.getByRole('button', { name: /Upload & screen/ }).isVisible(), 'recruiter can upload CVs')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- 360px ----------
{
  const { browser, page, errors } = await launch({ width: 360, height: 740 })
  await login(page, adminEmail, adminPw)
  await openDashboard(page)
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth }))
  assert(m.over <= 0, `360px: no horizontal page scroll on the dashboard (overflow ${m.over})`)
  await page.screenshot({ path: join(here, 'shots', 'redesign-dashboard-360.png'), fullPage: true })
  await browser.close()
  allErrors.push(...errors)
}

done(allErrors)

