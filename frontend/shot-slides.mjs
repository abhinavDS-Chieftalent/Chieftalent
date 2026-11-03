// Viewport (non-fullPage) screenshots for slide embedding — 1440x900 frames.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:5000'
const OUT = 'slides-img'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // crisp on slides
})
const page = await ctx.newPage()

async function shoot(url, file, { mockState, scrollTo } = {}) {
  if (mockState) {
    await page.route('**/api/interview/*/state', async (route) => {
      const res = await route.fetch()
      const json = await res.json()
      json.remaining_seconds = 87
      await route.fulfill({ response: res, json })
    })
  }
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  if (scrollTo) await page.evaluate((y) => window.scrollTo(0, y), scrollTo)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${file}.png` })
  console.log('shot', file)
  if (mockState) await page.unroute('**/api/interview/*/state')
}

await shoot(`${BASE}/admin/`, 'dashboard')
await shoot(`${BASE}/admin/candidate/1`, 'detail-top')
await shoot(`${BASE}/admin/candidate/1`, 'detail-answers', { scrollTo: 900 })
await shoot(`${BASE}/interview/MIw6yLLofn_g6WTb28vDbzKVYbPRmtUp`, 'interview', { mockState: true })

await browser.close()
console.log('done')
