#!/usr/bin/env node
/**
 * Admin rule 25 (monorepo rule 80, v1352 D9): Admin background work is registered in the monorepo job
 * catalogue (public.background_job_register) and started by the single monorepo tick. Fails on any
 * cron.schedule in Admin SQL from v255 on. Test files (*_tests.sql) are ignored.
 *
 *   node scripts/check-background-jobs.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const FIRST_CHECKED_VERSION = 255

export function sqlVersion(fileName) {
  const m = /^v(\d+)[a-z]?_/i.exec(path.basename(fileName))
  return m ? Number(m[1]) : null
}

export function findCronSchedules(sql) {
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
  return [...clean.matchAll(/cron\.schedule\s*\(\s*(?:job_name\s*:?=>?\s*)?('([^']*)')?/gi)].map((m) => m[2] ?? '?')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.join(ROOT, 'SQL')
  const problems = []
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    if (/_tests?\.sql$/i.test(name)) continue
    const version = sqlVersion(name)
    if (version === null || version < FIRST_CHECKED_VERSION) continue
    for (const job of findCronSchedules(fs.readFileSync(path.join(dir, name), 'utf8'))) {
      problems.push(`${name}: cron.schedule('${job}') — register the job with public.background_job_register instead (Admin rule 25)`)
    }
  }
  if (problems.length) {
    console.error(`Background job check failed (${problems.length}):`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log('Background job check passed: no pg_cron schedules in Admin SQL from v255 on.')
}
