// Verify the DotStark re-theme: landing (shader + mock + bento), login, dashboard.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const SHOTS = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/frontend/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(`console: ${m.text()}`) })

// 1. Landing
await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500) // shader + particles + rise-in settle
const checks = {
  headline: await page.locator('h1').textContent(),
  shaderCanvas: await page.locator('canvas.shader-canvas').count(),
  particlesCanvas: await page.locator('canvas').count(),
  marquee: await page.locator('.animate-marquee').count(),
  bentoCards: await page.locator('.group.relative').count(),
  mockFrame: await page.locator('.mock-frame').count(),
  shimmerButtons: await page.locator('button[class*="overflow-hidden"]').count(),
  syneLoaded: await page.evaluate(() => document.fonts.check('700 32px Syne')),
  dmSansLoaded: await page.evaluate(() => document.fonts.check('400 16px "DM Sans"')),
  primaryOrange: await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()),
}
console.log('LANDING:', JSON.stringify(checks, null, 1))
await page.screenshot({ path: `${SHOTS}/10-landing-hero.png` })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.45))
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/11-landing-pipeline.png` })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await page.waitForTimeout(900)
await page.screenshot({ path: `${SHOTS}/12-landing-cta.png` })

// 2. Login
await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${SHOTS}/13-login.png` })

// 3. Admin dashboard
await page.fill('#email', 'yash@dotstark.com')
await page.fill('#password', 'Yash@1234')
await page.locator('button[type=submit]').click()
await page.waitForURL('**/admin', { timeout: 10000 })
await page.waitForSelector('button:has-text("Copy link")', { timeout: 15000 })
await page.waitForTimeout(1500) // number tickers settle
await page.screenshot({ path: `${SHOTS}/14-dashboard.png`, fullPage: true })
console.log('dashboard ok, delete buttons:', await page.locator('button[aria-label^="Delete"]').count())

// 4. Interview page header (public, use real token from overview)
const ov = await page.evaluate(async () => (await fetch('/api/admin/overview')).json())
const withToken = ov.candidates.find((c) => c.interview_url)
if (withToken) {
  const tok = withToken.interview_url.split('/').pop()
  const page2 = await ctx.newPage()
  await page2.goto(`http://localhost:5000/interview/${tok}`, { waitUntil: 'networkidle' })
  await page2.waitForTimeout(1200)
  await page2.screenshot({ path: `${SHOTS}/15-interview.png` })
  console.log('interview page rendered for:', withToken.name)
  await page2.close()
}

console.log('JS errors:', errors.length ? errors : 'none')
await browser.close()
console.log('THEME TEST DONE')
