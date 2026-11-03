// Screenshot a page of the scratch server.
//   node shoot.mjs <path> <name> [width=1440] [height=900] [admin|recruiter] [full]
// Output: frontend/shots/redesign-<name>.png (these shots are scratch material, not shipped)
import { mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { BASE, FIXTURES, launch, login } from './test-helpers.mjs'

const [path, name, w = '1440', h = '900', who = '', full = ''] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
mkdirSync(out, { recursive: true })

const { browser, page, errors } = await launch({ width: +w, height: +h })
if (who && FIXTURES.creds[who]) { // pass "none" for an anonymous page
  const [email, pw] = FIXTURES.creds[who]
  await login(page, email, pw)
}
// Admin pages poll every few seconds, so "network idle" never arrives: wait on the DOM instead.
await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(+(process.env.WAIT || 2500))
const file = join(out, `redesign-${name}.png`)
await page.screenshot({ path: file, fullPage: full === 'full' })
console.log('saved', file, errors.length ? `| errors: ${errors.join(' ; ')}` : '')
await browser.close()

