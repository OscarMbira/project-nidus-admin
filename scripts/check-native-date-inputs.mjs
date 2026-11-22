#!/usr/bin/env node
/**
 * Admin rule 24 guard (monorepo v1351 parity): no browser date pickers — `<input type="date">` /
 * `type="datetime-local"` — in the shell, modules or packages. Use AdminDateInput from @nidus-admin/ui.
 *
 *   node scripts/check-native-date-inputs.mjs          list offenders, exit 1 when any
 *   node scripts/check-native-date-inputs.mjs --warn   list only, exit 0
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = ['shell', 'modules', 'packages']

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__', 'coverage'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(jsx|tsx|js|ts)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

/** End of the JSX tag starting at `start`, skipping {…} expressions and strings (so `=>` is not a tag end). */
function tagEnd(src, start) {
  let depth = 0
  let q = null
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i]
    if (q) { if (c === '\\') { i++; continue } if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') { q = c; continue }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && c === '>') return i + 1
  }
  return -1
}

/** Lines of `src` with a browser date picker (comments skipped). */
export function findPickers(src) {
  const hits = []
  const re = /<input(?=[\s/>])/g
  let m
  while ((m = re.exec(src))) {
    const lead = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index)
    if (/^\s*(\*|\/\*|\/\/)/.test(lead) || lead.includes('//')) continue
    const end = tagEnd(src, m.index)
    if (end < 0) continue
    const tag = src.slice(m.index, end).replace(/\{[^{}]*\}/g, (b) => (/["'](?:date|datetime-local)["']/.test(b) ? b : '{}'))
    if (/\btype\s*=\s*(?:["'](?:date|datetime-local)["']|\{[^}]*["'](?:date|datetime-local)["'])/.test(tag)) {
      hits.push(src.slice(0, m.index).split('\n').length)
    }
  }
  return hits
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = []
  for (const f of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
    for (const l of findPickers(fs.readFileSync(f, 'utf8'))) found.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}:${l}`)
  }
  if (!found.length) { console.log('No browser date pickers.'); process.exit(0) }
  console.log(`Browser date pickers found (${found.length}) — use AdminDateInput from @nidus-admin/ui (rule 24):\n  ${found.join('\n  ')}`)
  process.exit(process.argv.includes('--warn') ? 0 : 1)
}
