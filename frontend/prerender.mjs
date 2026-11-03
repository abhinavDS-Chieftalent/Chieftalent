// Prerender landing page using Playwright - captures fully rendered HTML
// Runs after Vite build, outputs static index.html with full content
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'
import { createReadStream } from 'fs'
import { extname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = resolve(__dirname, '../app/static/spa')
const ENTRY_HTML = join(DIST_DIR, 'index.html')

// Simple static file server for prerendering
function startStaticServer(dir, port) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      // Handle /static/spa/ prefix by stripping it
      let url = req.url
      if (url.startsWith('/static/spa/')) {
        url = url.slice('/static/spa'.length)
      }
      let filePath = join(dir, url === '/' ? 'index.html' : url)
      if (!filePath.startsWith(dir)) { res.writeHead(403); return res.end() }
      const ext = extname(filePath).toLowerCase()
      const mime = {
        '.html': 'text/html', '.js': 'application/javascript',
        '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
        '.json': 'application/json', '.woff': 'font/woff', '.woff2': 'font/woff2',
      }[ext] || 'application/octet-stream'
      createReadStream(filePath)
        .on('error', () => { res.writeHead(404); res.end() })
        .on('open', () => { res.writeHead(200, { 'Content-Type': mime }); })
        .pipe(res)
    })
    server.listen(port, () => resolve(server))
  })
}

async function prerender() {
  console.log('[prerender] Starting static server...')
  const server = await startStaticServer(DIST_DIR, 5173)
  console.log('[prerender] Server ready on port 5173')
  
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (compatible; ChiefTalentBot/1.0; +https://chieftalent.dotstark.tech/bot)',
  })
  const page = await context.newPage()
  
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await page.waitForTimeout(5000)
  console.log('[prerender] Page title:', await page.title())
  console.log('[prerender] Body text (first 500):', (await page.locator('body').textContent()).slice(0, 500))
  await page.waitForSelector('h1', { timeout: 15000 })
  await page.waitForTimeout(1000)
  
  const renderedHtml = await page.content()
  
  await browser.close()
  server.close()
  
  writeFileSync(ENTRY_HTML, renderedHtml)
  console.log('[prerender] Landing page prerendered successfully')
  console.log('[prerender] HTML size:', renderedHtml.length, 'chars')
}

prerender().catch((err) => {
  console.error('[prerender] Failed:', err)
  process.exit(1)
})