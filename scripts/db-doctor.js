import pg from 'pg'
import { loadEnv, getProjectRef } from './lib/load-env.js'
import { getSupabaseAdmin } from './lib/supabase-admin.js'
import { resolveDatabaseUrl, printDatabaseSetupHelp } from './lib/resolve-database-url.js'

async function checkSupabaseApi() {
  const { client, error } = getSupabaseAdmin()
  if (!client) return { ok: false, detail: error }

  const { error: pingError } = await client.from('admin_users').select('id', { head: true, count: 'exact' })
  if (pingError) return { ok: false, detail: pingError.message }
  return { ok: true, detail: 'Service role API reachable (admin schema)' }
}

async function checkPostgres() {
  const resolved = resolveDatabaseUrl()
  if (!resolved.url) return { ok: false, detail: 'No SUPABASE_DB_URL or SUPABASE_DB_PASSWORD configured' }

  const client = new pg.Client({
    connectionString: resolved.url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  })

  try {
    await client.connect()
    await client.query('SELECT 1 AS ok')
    return { ok: true, detail: `Postgres reachable via ${resolved.source}` }
  } catch (error) {
    return { ok: false, detail: error.message }
  } finally {
    try { await client.end() } catch { /* ignore */ }
  }
}

async function main() {
  loadEnv()
  const ref = getProjectRef()

  console.log('Admin database connectivity check')
  console.log(`Project ref: ${ref || '(missing VITE_ADMIN_SUPABASE_URL)'}`)
  console.log('')

  const api = await checkSupabaseApi()
  console.log(`${api.ok ? 'OK' : 'FAIL'} Supabase API — ${api.detail}`)

  const pgResult = await checkPostgres()
  console.log(`${pgResult.ok ? 'OK' : 'FAIL'} Postgres CLI — ${pgResult.detail}`)

  console.log('')
  if (api.ok && !pgResult.ok) {
    console.log('You can run RPC-based seeds without Postgres:')
    console.log('  pnpm run admin:seed-id-generation-display-id-backfill')
    console.log('')
    console.log('For SQL migrations, use Supabase SQL Editor or fix SUPABASE_DB_URL.')
  }

  if (!api.ok && !pgResult.ok) {
    printDatabaseSetupHelp()
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
