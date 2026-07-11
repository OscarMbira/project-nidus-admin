import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './env.js'

loadEnv()

const url = process.env.VITE_ADMIN_SUPABASE_URL
const serviceKey = process.env.VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY

let adminClient = null
let authClient = null

export function getAdminClient() {
  if (!url || !serviceKey) return null
  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      db: { schema: 'admin' },
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return adminClient
}

export function getAuthClient() {
  if (!url || !serviceKey) return null
  if (!authClient) {
    authClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return authClient
}

export function getPublicClient() {
  const base = getAuthClient()
  return base ? base.schema('public') : null
}

async function resolveCliAdminUserId() {
  const db = getAdminClient()
  if (!db) return null
  const { data } = await db.from('admin_users')
    .select('id')
    .eq('role', 'super_admin')
    .eq('activation_status', 'active')
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function createTestRun(name, trigger = 'cli') {
  const db = getAdminClient()
  if (!db) return null
  const adminUserId = await resolveCliAdminUserId()
  const { data, error } = await db.rpc('create_test_run', {
    p_name: name,
    p_trigger: trigger,
    p_admin_user_id: adminUserId,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function updateTestRunStatus(runId, status, counts = {}) {
  const db = getAdminClient()
  if (!db || !runId) return
  await db.rpc('update_test_run_status', {
    p_run_id: runId,
    p_status: status,
    p_total: counts.total ?? null,
    p_passed: counts.passed ?? null,
    p_failed: counts.failed ?? null,
    p_skipped: counts.skipped ?? null,
    p_duration_ms: counts.durationMs ?? null,
  })
}

export async function recordTestResult(runId, payload = {}) {
  const db = getAdminClient()
  if (!db || !runId) return null
  const { data, error } = await db.rpc('record_test_result', {
    p_run_id: runId,
    p_case_id: payload.caseId ?? null,
    p_status: payload.status ?? 'pending',
    p_duration_ms: payload.durationMs ?? null,
    p_error: payload.error ?? null,
    p_error_stack: payload.errorStack ?? null,
    p_screenshot_url: payload.screenshotUrl ?? null,
    p_trace_url: payload.traceUrl ?? null,
    p_metadata: payload.metadata ?? {},
  })
  if (error) throw new Error(error.message)
  return data
}

export async function findCaseByKey(caseKey) {
  const db = getAdminClient()
  if (!db) return null
  const { data } = await db.from('test_cases').select('id, case_key, suite_id').eq('case_key', caseKey).maybeSingle()
  return data
}

export async function cleanupTestData(tag = '[TEST]') {
  const pub = getPublicClient()
  if (!pub) return
  const tables = ['currencies', 'countries']
  for (const table of tables) {
    try {
      await pub.from(table).delete().ilike('currency_name', `%${tag}%`)
    } catch {
      // table may not have matching column
    }
  }
}
