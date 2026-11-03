// Verify the anti-slop editorial rebuild: landing with real screenshots, legal pages, login, dashboard.
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
await page.waitForTimeout(1200)
const checks = {
  headline: (await page.locator('h1').textContent()).slice(0, 60),
  demoImages: await page.locator('.shot img').count(),
  demoImagesLoaded: await page.evaluate(() =>
    Array.from(document.querySelectorAll('.shot img')).every((i) => i.complete && i.naturalWidth > 0)
  ),
  tosLink: await page.locator('a[href="/terms"]').count(),
  privacyLink: await page.locator('a[href="/privacy"]').count(),
  noGradients: await page.evaluate(() => {
    const els = document.querySelectorAll('*')
    for (const el of els) {
      const bg = getComputedStyle(el).backgroundImage
      if (bg.includes('gradient')) return false
    }
    return true
  }),
  noCanvas: await page.locator('canvas').count() === 0,
  syneLoaded: await page.evaluate(() => document.fonts.check('700 32px Syne')),
  dmSansLoaded: await page.evaluate(() => document.fonts.check('400 16px "DM Sans"')),
  dmMonoLoaded: await page.evaluate(() => document.fonts.check('400 12px "DM Mono"')),
  noEmDash: await page.evaluate(() => !document.body.innerText.includes('—')),
}
console.log('LANDING:', JSON.stringify(checks, null, 1))
await page.screenshot({ path: `${SHOTS}/20-landing-top.png` })
await page.evaluate(() => document.querySelector('#product').scrollIntoView())
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/21-landing-product.png` })
await page.evaluate(() => document.querySelector('#access').scrollIntoView())
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/22-landing-access.png` })

// 2. Legal pages
await page.goto('http://localhost:5000/terms', { waitUntil: 'networkidle' })
console.log('terms page h1:', await page.locator('h1').textContent())
await page.goto('http://localhost:5000/privacy', { waitUntil: 'networkidle' })
console.log('privacy page h1:', await page.locator('h1').textContent())

// 3. Login + dashboard
await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.screenshot({ path: `${SHOTS}/23-login.png` })
await page.fill('#email', 'yash@dotstark.com')
await page.fill('#password', 'Yash@1234')
await page.locator('button[type=submit]').click()
await page.waitForURL('**/admin', { timeout: 10000 })
await page.waitForSelector('button:has-text("Copy link")', { timeout: 15000 })
await page.waitForTimeout(800)
await page.screenshot({ path: `${SHOTS}/24-dashboard.png` })
console.log('dashboard delete buttons (admin):', await page.locator('button[aria-label^="Delete"]').count())

console.log('JS errors:', errors.length ? errors : 'none')
await browser.close()
console.log('EDITORIAL TEST DONE')
