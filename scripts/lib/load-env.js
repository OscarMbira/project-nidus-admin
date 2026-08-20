import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const idx = trimmed.indexOf('=')
    if (idx < 0) continue

    const key = trimmed.slice(0, idx).trim()
    let val = trimmed.slice(idx + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key) process.env[key] = val
  }
}

export function loadEnv() {
  parseEnvFile(path.join(rootDir, '.env'))
  parseEnvFile(path.join(rootDir, '.env.local'))
}

export function getProjectRef() {
  const supabaseUrl = process.env.VITE_ADMIN_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!supabaseUrl) return null
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    return null
  }
}
