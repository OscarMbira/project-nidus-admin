import crypto from 'crypto'
import readline from 'readline'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx < 0 || line.trimStart().startsWith('#')) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) process.env[key] = val
  }
}

const url = process.env.VITE_ADMIN_SUPABASE_URL
const serviceKey = process.env.VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Set VITE_ADMIN_SUPABASE_URL and VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { db: { schema: 'admin' }, auth: { autoRefreshToken: false, persistSession: false } })
const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((res) => rl.question(q, res))

async function main() {
  const { count } = await admin.from('admin_users').select('*', { count: 'exact', head: true }).eq('role', 'super_admin')
  if (count >= 2) {
    console.log('Maximum 2 Super Admin accounts reached. Cannot create more.')
    rl.close()
    return
  }
  if (count === 1) {
    console.log('1 Super Admin already exists. Creating the second (final) Super Admin...')
  }

  const email = await ask('Super Admin email: ')
  const fullName = await ask('Full name: ')
  const password = await ask('Temporary password (min 12 chars): ')

  const { data: authUser, error: authErr } = await auth.auth.admin.createUser({ email, password, email_confirm: true })
  if (authErr) {
    console.error('Auth error:', authErr.message)
    rl.close()
    process.exit(1)
  }

  const { error: insertErr } = await admin.from('admin_users').insert({
    auth_user_id: authUser.user.id,
    email,
    full_name: fullName,
    role: 'super_admin',
    activation_status: 'active',
    activated_at: new Date().toISOString(),
    is_2fa_configured: false,
  })

  if (insertErr) {
    console.error('DB error:', insertErr.message)
    rl.close()
    process.exit(1)
  }

  console.log('Super Admin created. Log in at your admin URL to set up 2FA.')
  rl.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
