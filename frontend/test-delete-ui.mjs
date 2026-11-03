// UI test: delete a candidate from the dashboard via the trash button + confirm dialog.
import { chromium } from 'playwright'
import { execSync } from 'child_process'

const PY = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/.venv/Scripts/python.exe'
const HELPER = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/frontend/zz_test_helper.py'

// 1. insert a synthetic candidate directly in the DB
const cid = parseInt(execSync(`${PY} ${HELPER} seed`).toString().trim())
console.log('synthetic candidate id:', cid)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://localhost:5000/admin/')
await page.waitForSelector('table table, table tbody', { timeout: 15000 })
await page.waitForTimeout(1000)

// 2. find the row and its trash button (wait for data to load)
const row = page.locator('tr', { hasText: 'ZZ UI Delete Test' })
await row.waitFor({ state: 'visible', timeout: 15000 })
console.log('row visible:', await row.isVisible())
const trash = row.locator('button[aria-label="Delete ZZ UI Delete Test"]')
console.log('trash button visible:', await trash.isVisible())

// 3. click trash -> confirmation dialog must appear
await trash.click()
const dialog = page.locator('[role="alertdialog"]')
await dialog.waitFor({ timeout: 5000 })
console.log('dialog title:', await dialog.locator('[role="alertdialog"], h2').first().textContent?.() ?? '')
console.log('dialog text:', (await dialog.textContent()).replace(/\s+/g, ' ').slice(0, 120))

// 4. cancel first — nothing should be deleted
await dialog.locator('button', { hasText: 'Cancel' }).click()
await dialog.waitFor({ state: 'hidden', timeout: 5000 })
console.log('after cancel, row still visible:', await row.isVisible())

// 5. delete for real
await trash.click()
await dialog.waitFor({ timeout: 5000 })
await dialog.locator('button', { hasText: 'Delete candidate' }).click()
try {
  await row.waitFor({ state: 'detached', timeout: 12000 })
  console.log('after confirm, row gone: true')
} catch {
  console.log('after confirm, row gone: false (still visible after 12s)')
}

// 6. verify DB
const n = execSync(`${PY} ${HELPER} count ${cid}`).toString().trim()
console.log('db rows for id', cid, ':', n, '(want 0)')

await browser.close()
console.log('UI TEST DONE')
