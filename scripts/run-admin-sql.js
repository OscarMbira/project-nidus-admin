import fs from 'fs'
import path from 'path'
import pg from 'pg'
import { resolveDatabaseUrl, printDatabaseSetupHelp } from './lib/resolve-database-url.js'

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/run-admin-sql.js <path-to-sql-file>')
  process.exit(1)
}

const sqlPath = path.resolve(process.cwd(), sqlFile)
if (!fs.existsSync(sqlPath)) {
  console.error(`SQL file not found: ${sqlPath}`)
  process.exit(1)
}

async function connectPg() {
  const resolved = resolveDatabaseUrl()
  if (!resolved.url) {
    printDatabaseSetupHelp()
    process.exit(1)
  }

  const attempts = []
  const url = new URL(resolved.url)
  const ref = url.username.includes('.') ? url.username.split('.').slice(1).join('.') : null

  attempts.push({ label: resolved.source, url: resolved.url })

  if (ref && !process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
    const region = process.env.SUPABASE_DB_REGION || 'eu-central-1'
    const password = process.env.SUPABASE_DB_PASSWORD
    attempts.push({
      label: 'pooler port 6543',
      url: `postgresql://${encodeURIComponent(`postgres.${ref}`)}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:6543/postgres`,
    })
  }

  let lastError = null
  for (const attempt of attempts) {
    const client = new pg.Client({
      connectionString: attempt.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    })

    try {
      await client.connect()
      if (attempt.label !== resolved.source) {
        console.log(`Connected using ${attempt.label}.`)
      }
      return client
    } catch (error) {
      lastError = error
      try { await client.end() } catch { /* ignore */ }
    }
  }

  console.error(`Migration failed: ${lastError?.message || 'Unable to connect'}`)
  if (/password authentication failed/i.test(lastError?.message || '')) {
    console.error('')
    console.error('The database password in .env does not match your Supabase project.')
    console.error('Use the Database password from Project Settings → Database (not the service role key).')
  }
  printDatabaseSetupHelp()
  console.error(`For this file, paste into Supabase SQL Editor: ${sqlPath}`)
  process.exit(1)
}

async function main() {
  const sql = fs.readFileSync(sqlPath, 'utf8')
  const client = await connectPg()

  try {
    console.log(`Running ${path.basename(sqlPath)}...`)
    await client.query(sql)
    console.log('Migration completed successfully.')
  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()
