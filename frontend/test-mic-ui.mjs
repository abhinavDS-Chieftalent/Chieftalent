// Reproduces the user's mic bug scenario in a real browser with a scripted
// mock SpeechRecognition: speak word -> speak more words -> session restart.
// Asserts each phrase appears EXACTLY ONCE in the transcript textarea.
import { chromium } from 'playwright'
import { execSync } from 'child_process'

const PY = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/.venv/Scripts/python.exe'
const HELPER = 'C:/Users/DST-15/OneDrive/Desktop/HR/hr_screening_mvp/frontend/zz_test_helper.py'
const TOKEN = 'zz-mic-test-token'

// --- seed synthetic candidate + interview at spoken question 2 ---
const cid = parseInt(execSync(`${PY} ${HELPER} micseed`).toString().trim())
console.log('synthetic candidate id:', cid)

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
})
const ctx = await browser.newContext()
await ctx.addInitScript(`
  class MockResult {
    constructor(text, isFinal) { this.isFinal = isFinal; this.length = 1; this[0] = { transcript: text }; }
  }
  class MockSR {
    static calls = 0
    constructor() { this.continuous = false; this.interimResults = false; this.lang = ''; this.onresult = null; this.onend = null; this.onerror = null; this._active = false; }
    start() {
      if (this._active) return
      this._active = true
      const self = this
      const call = ++MockSR.calls
      const results = []
      const fire = (ri) => { if (self._active) self.onresult && self.onresult({ results, resultIndex: ri }) }
      const at = (ms, fn) => setTimeout(() => { if (self._active) fn() }, ms)
      if (call === 1) {
        // session 1: "Hello" ... "world" ... "my name is John" (user's exact scenario)
        at(300,  () => { results[0] = new MockResult('Hello', false); fire(0) })
        at(600,  () => { results[0] = new MockResult('Hello', true);  fire(0) })
        at(900,  () => { results[1] = new MockResult('world', false); fire(1) })
        at(1200, () => { results[1] = new MockResult('world', true);  fire(1) })
        at(1500, () => { results[2] = new MockResult('my name is John', false); fire(2) })
        at(1800, () => { results[2] = new MockResult('my name is John', true);  fire(2) })
        at(2100, () => { self._active = false; self.onend && self.onend() }) // Chrome silence-end
      } else {
        // session 2 (after page restarts recognition): one new phrase, stays active
        at(300,  () => { results[0] = new MockResult('second breath', false); fire(0) })
        at(600,  () => { results[0] = new MockResult('second breath', true);  fire(0) })
      }
    }
    stop() { this._active = false }
  }
  window.SpeechRecognition = MockSR
  window.webkitSpeechRecognition = MockSR
`)

const page = await ctx.newPage()
await page.goto(`http://localhost:5000/interview/${TOKEN}`)
await page.waitForSelector('textarea', { timeout: 15000 })
await page.waitForTimeout(400)

// mic setup must succeed (fake device) and recording must be live
console.log('question text:', (await page.locator('h1').textContent()).slice(0, 50))
console.log('mic live note visible:', await page.locator('text=Microphone live').isVisible().catch(() => false))
console.log('REC badge visible:', await page.locator('text=REC').isVisible().catch(() => false))

// let session 1 play out (3 phrases + end + restart)
await page.waitForTimeout(2600)
let v = await page.locator('textarea').inputValue()
console.log('after session 1:', JSON.stringify(v))
console.log('  "Hello" count (want 1):', (v.match(/Hello/g) || []).length)
console.log('  "world" count (want 1):', (v.match(/world/g) || []).length)
console.log('  "John" count (want 1):', (v.match(/John/g) || []).length)

// let session 2 (post-restart) play out
await page.waitForTimeout(1500)
v = await page.locator('textarea').inputValue()
console.log('after session 2:', JSON.stringify(v))
console.log('  "second breath" count (want 1):', (v.match(/second breath/g) || []).length)

const ok1 = v === 'Hello world my name is John second breath'
console.log('FINAL TRANSCRIPT EXACT MATCH:', ok1)

// cleanup: delete synthetic candidate via the API
execSync(`curl -s -X DELETE http://localhost:5000/api/admin/candidate/${cid}`)
const n = execSync(`${PY} ${HELPER} count ${cid}`).toString().trim()
console.log('synthetic candidate removed:', n === '0')

await browser.close()
console.log(ok1 ? 'MIC TEST PASSED' : 'MIC TEST FAILED')
process.exit(ok1 ? 0 : 1)
