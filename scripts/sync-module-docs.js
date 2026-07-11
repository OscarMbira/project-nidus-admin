#!/usr/bin/env node
/**
 * Sync modules/{module}/docs/*.md to Supabase Storage documentation/admin/{module}/
 * Usage: node scripts/sync-module-docs.js <module-folder> [extra-storage-module]
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, basename } from 'path'

const moduleFolder = process.argv[2]
const storageModule = process.argv[3] || moduleFolder

if (!moduleFolder) {
  console.error('Usage: node scripts/sync-module-docs.js <module-folder>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required')
  process.exit(1)
}

const docsDir = join(process.cwd(), 'modules', moduleFolder, 'docs')
const generalDir = join(docsDir, 'general')

const files = []
if (existsSync(docsDir)) {
  for (const name of readdirSync(docsDir)) {
    if (name.endsWith('.md') && name !== 'README.md') files.push({ path: join(docsDir, name), module: storageModule })
  }
}
if (existsSync(generalDir)) {
  for (const name of readdirSync(generalDir)) {
    if (name.endsWith('.md')) files.push({ path: join(generalDir, name), module: 'general' })
  }
}

if (!files.length) {
  console.log(`No markdown files in modules/${moduleFolder}/docs`)
  process.exit(0)
}

for (const { path, module } of files) {
  const fileName = basename(path)
  const body = readFileSync(path)
  const storagePath = `admin/${module}/${fileName}`
  const res = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/documentation/${storagePath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'text/markdown',
    },
    body,
  })
  if (!res.ok) {
    console.error(`Failed ${fileName}:`, res.status, await res.text())
    process.exit(1)
  }
  console.log(`Synced ${fileName} → documentation/${storagePath}`)
}
