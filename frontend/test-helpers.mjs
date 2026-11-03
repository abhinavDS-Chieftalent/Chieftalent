// Shared helpers for the redesign checks. Run against the scratch server (scripts/ui_scratch.py --serve).
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

export const BASE = process.env.BASE || 'http://localhost:5055'
export const FIXTURES = JSON.parse(
  readFileSync(join(process.env.TEMP || '/tmp', 'chieftalent-scratch', 'fixtures.json'), 'utf8'),
)

const failures = []

export async function launch(viewport = { width: 1440, height: 900 }, contextOptions = {}) {
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  const context = await browser.newContext({ viewport, ...contextOptions })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // expected: anonymous visitors get a 401 from /api/auth/me
    if (/401/.test(t) || /favicon/.test(t)) return
    errors.push(`console: ${t}`)
  })
  return { browser, context, page, errors }
}

export async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.locator('button[type=submit]').click()
  await page.waitForURL('**/admin', { timeout: 10000 })
}

export function assert(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) failures.push(msg)
}

export function done(errors = []) {
  if (errors.length) {
    console.log('JS errors:', errors)
    failures.push(`${errors.length} JS error(s)`)
  }
  console.log(failures.length ? `\n${failures.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  process.exit(failures.length ? 1 : 0)
}
