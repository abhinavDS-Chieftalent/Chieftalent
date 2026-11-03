// UI verification: landing, login flow, role-based dashboard, forgot-password.
// Screenshots saved to frontend/shots/ for the user to review.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const SHOTS = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/frontend/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })

// 1. Landing
await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' })
await page.waitForTimeout(900) // let rise-in animations finish
console.log('landing title headline:', await page.locator('h1').textContent())
console.log('landing pipeline cards:', await page.locator('.ink-card').count())
await page.screenshot({ path: `${SHOTS}/01-landing.png`, fullPage: true })

// 2. Login page
await page.goto('http://localhost:5000/login', { waitUntil: 'networkidle' })
console.log('login heading:', await page.locator('h1').textContent())
await page.screenshot({ path: `${SHOTS}/02-login.png` })

// 3. Forgot password flow
await page.locator('button', { hasText: 'Forgot password?' }).click()
await page.fill('#reset-email', 'yash@dotstark.com')
await page.screenshot({ path: `${SHOTS}/03-forgot.png` })
await page.locator('button', { hasText: 'Send verification code' }).click()
await page.waitForSelector('#otp', { timeout: 8000 })
console.log('otp view heading:', await page.locator('h1').textContent())
console.log('otp input disabled (space for later):', await page.locator('#otp').isDisabled())
await page.screenshot({ path: `${SHOTS}/04-otp-sent.png` })

// 4. Back to login, sign in as ADMIN
await page.locator('button', { hasText: 'Back to sign in' }).click()
await page.fill('#email', 'yash@dotstark.com')
await page.fill('#password', 'Yash@1234')
await page.locator('button[type=submit]').click()
await page.waitForURL('**/admin', { timeout: 10000 })
await page.waitForSelector('button:has-text("Copy link")', { timeout: 15000 }) // real rows, not skeletons
await page.waitForTimeout(600)
console.log('--- logged in as admin ---')
console.log('url:', page.url())
console.log('ADMIN badge visible:', await page.locator('text=ADMIN').isVisible())
console.log('delete buttons (admin):', await page.locator('button[aria-label^="Delete"]').count())
await page.screenshot({ path: `${SHOTS}/05-dashboard-admin.png`, fullPage: true })

// 5. Logout, sign in as RECRUITER
await page.locator('button[aria-label="Sign out"]').click()
await page.waitForURL('**/login', { timeout: 8000 })
await page.fill('#email', 'recruiter@dotstark.com')
await page.fill('#password', 'Recruit@1234')
await page.locator('button[type=submit]').click()
await page.waitForURL('**/admin', { timeout: 10000 })
await page.waitForSelector('button:has-text("Copy link")', { timeout: 15000 })
await page.waitForTimeout(600)
console.log('--- logged in as recruiter ---')
console.log('RECRUITER badge visible:', await page.getByText('RECRUITER', { exact: true }).isVisible())
console.log('delete buttons (recruiter, want 0):', await page.locator('button[aria-label^="Delete"]').count())
console.log('upload button visible (recruiter can upload):', await page.locator('button', { hasText: 'Upload & screen' }).isVisible())
await page.screenshot({ path: `${SHOTS}/06-dashboard-recruiter.png`, fullPage: true })

// 6. Session protection: fresh context, no cookie -> /admin redirects to /login
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page2 = await ctx2.newPage()
await page2.goto('http://localhost:5000/admin', { waitUntil: 'networkidle' })
await page2.waitForTimeout(1200)
console.log('--- anonymous /admin ---')
console.log('redirected to:', page2.url())

console.log('JS errors:', errors.length ? errors : 'none')
await browser.close()
console.log('UI TEST DONE')
