// Naming rule: nothing user-visible may name the AI provider, gateway or a model family.
// Scans the built SPA and the frontend source. Usage: node test-no-provider-names.mjs
//
// Known non-visible exception: react-device-detect ships a user-agent device-vendor table
// (... "Motorola", "Nvidia", "OnePlus" ...). It is library data, never rendered, so a match
// whose surrounding text is that table is ignored.
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const roots = [resolve(here, '../app/static/spa'), resolve(here, 'src')]
const exts = /\.(js|css|html|jsx)$/
const banned = /\b(nvidia|nim|nim-proxy|gpt-oss|nemotron|llama)\b/gi
const hits = []

function lineCol(text, index) {
  const before = text.slice(0, index).split('\n')
  return `${before.length}:${before[before.length - 1].length + 1}`
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (exts.test(name)) {
      const text = readFileSync(p, 'utf8')
      for (const m of text.matchAll(banned)) {
        const ctx = text.slice(Math.max(0, m.index - 60), m.index + 60)
        if (/"Motorola"|"OnePlus"|"Samsung"/.test(ctx)) continue // UA vendor table
        hits.push(`${p}:${lineCol(text, m.index)}  "${m[0]}"  ${ctx.replace(/\s+/g, ' ')}`)
      }
    }
  }
}
roots.forEach(walk)

if (hits.length) {
  console.log(`FAIL  ${hits.length} provider-name hit(s):`)
  hits.slice(0, 25).forEach((h) => console.log('  ' + h))
  process.exit(1)
}
console.log('PASS  no provider names in the built SPA or frontend source')
