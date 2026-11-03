// Playwright UI verification: screenshots + programmatic design checks.
//   node shot.mjs [outdir]
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5000'
const OUT = process.argv[2] || 'shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))

async function checks() {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body)
    const el = document.documentElement
    return {
      fontFamily: body.fontFamily.slice(0, 60),
      geistLoaded: document.fonts.check('12px Geist'),
      geistMonoLoaded: document.fonts.check('12px "Geist Mono"'),
      bodyBg: body.backgroundColor,
      horizontalOverflow: el.scrollWidth > window.innerWidth,
    }
  })
}

const report = []

async function shoot(name, url, waitFor, file, { mockState } = {}) {
  if (mockState) {
    await page.route('**/api/interview/*/state', async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      json.remaining_seconds = 87 // freeze the timer for the screenshot
      await route.fulfill({ response: res, json })
    })
  }
  await page.goto(url, { waitUntil: 'networkidle' })
  try {
    await page.waitForSelector(waitFor, { timeout: 10000 })
  } catch {
    errors.push(`${name}: selector not found: ${waitFor}`)
  }
  await page.waitForTimeout(600)
  const c = await checks()
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true })
  report.push({ name, ...c })
  if (mockState) await page.unroute('**/api/interview/*/state')
}

await shoot('dashboard', `${BASE}/admin/`, 'table', '01-dashboard')
await shoot('candidate-detail', `${BASE}/admin/candidate/1`, 'h1', '02-candidate-detail')
await shoot(
  'interview',
  `${BASE}/interview/MIw6yLLofn_g6WTb28vDbzKVYbPRmtUp`,
  'main',
  '03-interview',
  { mockState: true }
)
await shoot('interview-done', `${BASE}/interview/MIw6yLLofn_g6WTb28vDbzKVYbPRmtUp/done`, 'h1', '04-done')

await browser.close()
console.log(JSON.stringify({ report, errors }, null, 2))
