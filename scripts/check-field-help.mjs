#!/usr/bin/env node
/**
 * Admin field-level help coverage check (Admin rule 23; monorepo v1345 slice 6 — same output shape as the
 * monorepo scripts/check-field-help.mjs).
 *
 * Finds:
 *   1. help keys used by labels (AdminFieldLabelWithHelp helpKey="admin.…"),
 *   2. help keys seeded in SQL (INSERT INTO admin.field_help …),
 *   3. raw <label> elements in files that render form controls, not yet using AdminFieldLabelWithHelp.
 * A label excluded by rule 23 (filter / search box, toggle, option list, upload button …) carries
 * data-help="exempt" and is not counted.
 *
 *   node scripts/check-field-help.mjs            report (warn only, exit 0)
 *   node scripts/check-field-help.mjs --enforce  fail on any used key without help or any raw label
 *   node scripts/check-field-help.mjs --list     also list every file with raw labels
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CODE_DIRS = ['shell/src', 'modules', 'packages']

export function extractUsedKeys(source) {
  return new Set([...source.matchAll(/helpKey=["'](admin\.[a-z0-9_.]+)["']/g)].map((m) => m[1]))
}

export function extractSeededKeys(sql) {
  const keys = new Set()
  for (const block of sql.matchAll(/INSERT INTO admin\.field_help\b[\s\S]*?;/g)) {
    for (const m of block[0].matchAll(/\(\s*'(admin\.[a-z0-9_.]+)'/g)) keys.add(m[1])
  }
  return keys
}

/**
 * Fields without help in a file: raw labels in a file that renders controls, plus <AdminField> uses with no
 * helpKey (AdminField draws its own label). Labels / fields marked data-help="exempt" are not counted.
 */
export function countNotAdopted(source) {
  const exempt = (tag) => /\bdata-help=["']exempt["']/.test(tag)
  const adminFields = (source.match(/<AdminField\b[^>]*>/g) || []).filter((tag) => !/\bhelpKey=/.test(tag) && !exempt(tag)).length
  if (!/<(input|select|textarea|AdminDateInput|SelectField|SearchableSelect)\b/.test(source)) return adminFields
  return (source.match(/<label\b[^>]*>/g) || []).filter((tag) => !exempt(tag)).length + adminFields
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__', 'test', '_template'].includes(e.name) || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(jsx|js)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const used = new Map()
  const notAdopted = {}
  for (const f of CODE_DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
    if (/AdminFieldLabelWithHelp\.jsx$/.test(f)) continue
    const src = fs.readFileSync(f, 'utf8')
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    for (const k of extractUsedKeys(src)) if (!used.has(k)) used.set(k, rel)
    const n = countNotAdopted(src)
    if (n) notAdopted[rel] = n
  }
  const seeded = new Set()
  const sqlDir = path.join(ROOT, 'SQL')
  for (const f of fs.readdirSync(sqlDir).filter((x) => x.endsWith('.sql'))) extractSeededKeys(fs.readFileSync(path.join(sqlDir, f), 'utf8')).forEach((k) => seeded.add(k))
  const missing = [...used.keys()].filter((k) => !seeded.has(k)).sort()
  const raw = Object.values(notAdopted).reduce((a, b) => a + b, 0)
  const coverage = used.size + raw === 0 ? 100 : Math.round(((used.size - missing.length) / (used.size + raw)) * 10000) / 100
  console.log(`Admin field help: ${used.size} keys used, ${seeded.size} seeded, ${missing.length} used without help.`)
  console.log(`Not yet adopted: ${raw} raw <label> in ${Object.keys(notAdopted).length} form files. Approximate coverage ${coverage}%.`)
  for (const k of missing) console.log(`  ✗ no help seeded: ${k} (${used.get(k)})`)
  if (argv.includes('--list')) for (const [f, n] of Object.entries(notAdopted).sort()) console.log(`  ${n}\t${f}`)
  if (argv.includes('--enforce') && (missing.length || raw)) process.exit(1)
}
