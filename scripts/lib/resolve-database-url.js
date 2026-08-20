import { loadEnv, getProjectRef } from './load-env.js'

export function resolveDatabaseUrl() {
  loadEnv()

  if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    return {
      url: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
      source: 'SUPABASE_DB_URL/DATABASE_URL',
    }
  }

  const ref = getProjectRef()
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!ref || !password) {
    return { url: null, source: null }
  }

  const region = process.env.SUPABASE_DB_REGION || 'eu-central-1'
  const useDirect = process.env.SUPABASE_DB_DIRECT === 'true'
  const host = process.env.SUPABASE_DB_HOST
    || (useDirect ? `db.${ref}.supabase.co` : `aws-0-${region}.pooler.supabase.com`)
  const port = process.env.SUPABASE_DB_PORT || '5432'
  const user = process.env.SUPABASE_DB_USER
    || (useDirect ? 'postgres' : `postgres.${ref}`)

  return {
    url: `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`,
    source: 'constructed from SUPABASE_DB_PASSWORD',
  }
}

export function printDatabaseSetupHelp() {
  console.error('')
  console.error('Database connection is not configured or the password is wrong.')
  console.error('')
  console.error('Option A — recommended for migrations (no local Postgres password):')
  console.error('  1. Open Supabase Dashboard → SQL Editor')
  console.error('  2. Paste and run the SQL file shown in the command')
  console.error('')
  console.error('Option B — local CLI migrations:')
  console.error('  1. Supabase Dashboard → Project Settings → Database')
  console.error('  2. Copy the Session pooler URI (IPv4)')
  console.error('  3. Add to .env: SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@...')
  console.error('     Or set SUPABASE_DB_PASSWORD to the database password (not the service role key)')
  console.error('')
  console.error('Option C — RPC-only scripts (backfill):')
  console.error('  pnpm run admin:seed-id-generation-display-id-backfill')
  console.error('  Uses VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY — no SUPABASE_DB_PASSWORD needed.')
  console.error('')
}
