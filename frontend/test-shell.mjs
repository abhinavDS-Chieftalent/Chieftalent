// Login + admin shell. Run: powershell -File ../scripts/ui_cycle.ps1  then  node test-shell.mjs
import { BASE, FIXTURES, launch, login, assert, done } from './test-helpers.mjs'

const [adminEmail, adminPw] = FIXTURES.creds.admin
const [recEmail, recPw] = FIXTURES.creds.recruiter
const allErrors = []

// ---------- login page ----------
{
  const { browser, page, errors } = await launch({ width: 1280, height: 800 })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const d = await page.evaluate(() => {
    const text = (e) => (e.innerText || '').trim()
    return {
      h1: text(document.querySelector('h1')),
      logo: [...document.querySelectorAll('img')].some((i) => i.alt === 'ChiefTalent'),
      numbered: [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /^0\d$/.test(text(e))).length,
      dashes: (document.body.innerText.match(/[â€”â€“]/g) || []).length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
  assert(d.h1 === 'Sign in', `login h1 is "Sign in" (got "${d.h1}")`)
  assert(d.logo, 'login shows the ChiefTalent logo')
  assert(d.numbered === 0, `no 01/02/03 markers on the login panel (got ${d.numbered})`)
  assert(d.dashes === 0, 'no em/en dashes on login')
  assert((await page.getByLabel('Work email').count()) === 1, 'email input has a visible label')
  assert((await page.getByLabel('Password', { exact: true }).count()) === 1, 'password input has a visible label')

  // wrong password: error is announced and inline
  await page.fill('#email', adminEmail)
  await page.fill('#password', 'definitely-wrong')
  await page.locator('button[type=submit]').click()
  await page.waitForSelector('[role=alert]')
  assert(/invalid email or password/i.test(await page.locator('[role=alert]').innerText()), 'wrong password shows an inline alert')

  // forgot password still reaches the OTP view (sends to the scratch outbox, never real SMTP)
  await page.locator('button', { hasText: 'Forgot password?' }).click()
  await page.fill('#reset-email', adminEmail)
  await page.locator('button', { hasText: 'Send verification code' }).click()
  await page.waitForSelector('#otp', { timeout: 8000 })
  assert(await page.locator('#otp').isDisabled(), 'forgot password still reaches the code screen (field disabled, as built)')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- admin shell ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await login(page, adminEmail, adminPw)
  await page.waitForSelector('aside.sidebar')
  // the overview (with the AI health check) can take a few seconds: wait for real data, not for any text
  await page.waitForSelector('aside.sidebar a:has-text("Net Development Intern")', { timeout: 25000 })
  const s = await page.evaluate(() => {
    const side = document.querySelector('aside.sidebar')
    return {
      text: side.innerText,
      logo: !!side.querySelector('img[alt="ChiefTalent"]'),
      role: [...side.querySelectorAll('a')].some((a) => /Net Development Intern/i.test(a.innerText)),
      delRole: side.querySelectorAll('button[aria-label^="Delete role"]').length,
      height: side.getBoundingClientRect().height,
      vh: window.innerHeight,
    }
  })
  assert(s.logo, 'sidebar shows the logo')
  assert(/AI API (connected|unreachable)/.test(s.text), `sidebar status says "AI API connected/unreachable" (got "${s.text.replace(/\s+/g, ' ').slice(0, 120)}")`)
  assert(!/nvidia|\bnim\b|no model|[\w-]+\/[\w.-]+/i.test(s.text.replace(/yash@dotstark\.com|\w+@\w+\.\w+/g, '')), 'sidebar never shows a provider, model id or "no model"')
  assert(s.role, 'role list shows the job role')
  assert(s.delRole === 1, `admin sees the delete-role control (got ${s.delRole})`)
  assert(Math.abs(s.height - s.vh) <= 2, `sidebar fills the viewport (dvh) (h=${s.height}, vh=${s.vh})`)
  assert((await page.getByText('ADMIN', { exact: true }).count()) >= 1, 'admin badge shown')

  // landmarks and keyboard shortcut to the content
  assert((await page.locator('main#main').count()) === 1, 'admin pages have a main landmark with id "main"')
  await page.keyboard.press('Tab')
  const skip = await page.evaluate(() => ({ t: document.activeElement?.textContent?.trim(), h: document.activeElement?.getAttribute('href') }))
  assert(/skip to main content/i.test(skip.t || '') && skip.h === '#main', `first Tab stop is a skip link (got ${JSON.stringify(skip)})`)

  await page.locator('aside.sidebar').first().locator('button[aria-label="Sign out"]').click()
  await page.waitForURL('**/login', { timeout: 8000 })
  assert(true, 'sign out returns to /login')

  // recruiter: no admin controls
  await login(page, recEmail, recPw)
  await page.waitForSelector('aside.sidebar')
  assert((await page.locator('aside.sidebar').first().locator('button[aria-label^="Delete role"]').count()) === 0, 'recruiter does not see delete-role')
  assert((await page.getByText('RECRUITER', { exact: true }).count()) >= 1, 'recruiter badge shown')
  await browser.close()
  allErrors.push(...errors)
}

// ---------- resilience: an empty overview payload must not crash the shell or dashboard ----------
{
  const { browser, page, errors } = await launch({ width: 1440, height: 900 })
  await page.route('**/api/admin/overview', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await login(page, adminEmail, adminPw)
  await page.waitForSelector('aside.sidebar')
  await page.waitForTimeout(1500)
  assert(await page.locator('aside.sidebar').first().isVisible(), 'empty overview payload: sidebar still renders')
  assert(/Checking AI API/.test(await page.locator('aside.sidebar').first().innerText()), 'empty overview payload: status says it is checking, not a false red')
  assert(!errors.some((e) => /pageerror/.test(e)), 'empty overview payload: no uncaught page error')
  await browser.close()
  allErrors.push(...errors.filter((e) => !/pageerror/.test(e)))
}

// ---------- 360px: drawer opens and closes ----------
{
  const { browser, page, errors } = await launch({ width: 360, height: 740 })
  await login(page, adminEmail, adminPw)
  await page.locator('button[aria-label="Open menu"]').click()
  await page.waitForTimeout(300)
  const hidden = () => page.evaluate(() => document.querySelector('aside[aria-label="Workspace navigation"]').getAttribute('aria-hidden'))
  assert((await hidden()) === 'false', '360px: drawer opens')
  await page.locator('button[aria-label="Close menu"]').click()
  await page.waitForTimeout(300)
  assert((await hidden()) === 'true', '360px: drawer closes')
  const focusable = await page.evaluate(() => { const a = document.querySelector('aside[aria-label="Workspace navigation"]'); return a.hasAttribute('inert') })
  assert(focusable, '360px: closed drawer is inert (its links are not tab stops)')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert(overflow <= 0, `360px: no horizontal page scroll on the dashboard (overflow=${overflow})`)
  await browser.close()
  allErrors.push(...errors)
}

done(allErrors)


