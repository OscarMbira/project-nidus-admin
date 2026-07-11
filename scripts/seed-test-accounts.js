import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { TEST_PASSWORD, ADMIN_ACCOUNTS, PLATFORM_ACCOUNTS } from '../e2e/helpers/env.js'

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

const adminDb = createClient(url, serviceKey, { db: { schema: 'admin' }, auth: { autoRefreshToken: false, persistSession: false } })
const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const publicDb = createClient(url, serviceKey, { db: { schema: 'public' }, auth: { autoRefreshToken: false, persistSession: false } })

async function upsertAuthUser(email) {
  const { data: list } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (existing) {
    await auth.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD, email_confirm: true })
    return existing.id
  }
  const { data, error } = await auth.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true })
  if (error) throw new Error(`Auth create ${email}: ${error.message}`)
  return data.user.id
}

async function seedAdminAccount({ email, role }) {
  const authUserId = await upsertAuthUser(email)
  const { data: existing } = await adminDb.from('admin_users').select('id').eq('email', email).maybeSingle()
  if (existing) {
    await adminDb.from('admin_users').update({
      role,
      activation_status: 'active',
      is_2fa_configured: false,
      requires_2fa: false,
      auth_user_id: authUserId,
    }).eq('id', existing.id)
    console.log(`  ✓ Admin updated: ${email} (${role})`)
    return
  }
  const { error } = await adminDb.from('admin_users').insert({
    auth_user_id: authUserId,
    email,
    full_name: `Test ${role.replace(/_/g, ' ')}`,
    role,
    activation_status: 'active',
    activated_at: new Date().toISOString(),
    is_2fa_configured: false,
    requires_2fa: false,
  })
  if (error) throw new Error(`Admin insert ${email}: ${error.message}`)
  console.log(`  ✓ Admin created: ${email} (${role})`)
}

async function seedPlatformAccount({ email, role }) {
  const authUserId = await upsertAuthUser(email)
  const { data: existing } = await publicDb.from('users').select('id').eq('email', email).maybeSingle()
  const row = {
    auth_user_id: authUserId,
    email,
    full_name: `Test ${role.replace(/_/g, ' ')}`,
    is_active: true,
    is_suspended: false,
  }
  if (existing) {
    await publicDb.from('users').update(row).eq('id', existing.id)
    console.log(`  ✓ Platform user updated: ${email} (${role})`)
    return existing.id
  }
  const { data, error } = await publicDb.from('users').insert(row).select('id').single()
  if (error) throw new Error(`Platform insert ${email}: ${error.message}`)
  console.log(`  ✓ Platform user created: ${email} (${role})`)
  return data.id
}

async function main() {
  console.log('Seeding E2E test accounts...')
  for (const account of ADMIN_ACCOUNTS) {
    await seedAdminAccount(account)
  }
  for (const account of PLATFORM_ACCOUNTS) {
    await seedPlatformAccount(account)
  }
  console.log(`Done. ${ADMIN_ACCOUNTS.length + PLATFORM_ACCOUNTS.length} accounts ready. Password: ${TEST_PASSWORD}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
