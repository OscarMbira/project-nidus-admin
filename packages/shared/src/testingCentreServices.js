import { getAdminDb, getPublicDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

const remoteUrl = (envKey, port) =>
  import.meta.env[envKey] || `http://localhost:${port}/assets/remoteEntry.js`

const MODULE_REMOTES = [
  ['users', remoteUrl('VITE_ADMIN_USERS_URL', 5180)],
  ['subscriptions', remoteUrl('VITE_ADMIN_SUBSCRIPTIONS_URL', 5181)],
  ['system', remoteUrl('VITE_ADMIN_SYSTEM_URL', 5182)],
  ['support', remoteUrl('VITE_ADMIN_SUPPORT_URL', 5183)],
  ['errors', remoteUrl('VITE_ADMIN_ERRORS_URL', 5184)],
  ['mirrors', remoteUrl('VITE_ADMIN_MIRRORS_URL', 5185)],
  ['platform', remoteUrl('VITE_ADMIN_PLATFORM_URL', 5186)],
  ['simulator', remoteUrl('VITE_ADMIN_SIMULATOR_URL', 5187)],
  ['security', remoteUrl('VITE_ADMIN_SECURITY_URL', 5188)],
  ['content', remoteUrl('VITE_ADMIN_CONTENT_URL', 5189)],
  ['feedback', remoteUrl('VITE_ADMIN_FEEDBACK_URL', 5190)],
  ['audit', remoteUrl('VITE_ADMIN_AUDIT_URL', 5191)],
  ['admin-mgmt', remoteUrl('VITE_ADMIN_ADMIN_MGMT_URL', 5192)],
  ['batch-ops', remoteUrl('VITE_ADMIN_BATCH_OPS_URL', 5193)],
  ['affiliates', remoteUrl('VITE_ADMIN_AFFILIATES_URL', 5194)],
  ['system-testers', remoteUrl('VITE_ADMIN_SYSTEM_TESTERS_URL', 5195)],
]

const q = (client, table, select, opts = {}) => {
  if (!client) return Promise.resolve({ data: [], error: null })
  let query = client.from(table).select(select)
  if (opts.order?.column) {
    query = opts.order.asc === false
      ? query.order(opts.order.column, { ascending: false })
      : query.order(opts.order.column)
  }
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.filters) {
    for (const f of opts.filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
      else if (f.op === 'gte') query = query.gte(f.col, f.val)
      else if (f.op === 'not') query = query.not(f.col, f.op2 || 'is', f.val)
    }
  }
  return query
}

async function adminRpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const fetchTcEvidence = (opts = {}) =>
  q(getAdminDb(), 'tc_evidence_files', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 200,
    filters: opts.runId ? [{ op: 'eq', col: 'test_run_id', val: opts.runId }] : undefined,
  })

export const fetchTcDiagnosticSessions = (limit = 20) =>
  q(getAdminDb(), 'tc_diagnostic_sessions', '*', {
    order: { column: 'created_at', asc: false },
    limit,
  })

export const fetchTcSettings = () =>
  q(getAdminDb(), 'tc_settings', '*', { order: { column: 'setting_key' }, limit: 100 })

export const fetchLinkedTestDefects = () =>
  q(getPublicDb(), 'bugs', '*', {
    filters: [{ op: 'not', col: 'linked_test_run_id', op2: 'is', val: null }],
    order: { column: 'created_at', asc: false },
    limit: 200,
  })

export const fetchAllTestCases = async (opts = {}) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: null }
  const { data: cases, error } = await db.from('test_cases').select('*').eq('is_active', true).order('case_name').limit(opts.limit || 500)
  if (error) return { data: [], error }
  const suiteIds = [...new Set((cases || []).map((c) => c.suite_id))]
  const { data: suites } = await db.from('test_suites').select('*').in('id', suiteIds)
  const suiteById = Object.fromEntries((suites || []).map((s) => [s.id, s]))
  return {
    data: (cases || []).map((c) => ({ ...c, test_suites: suiteById[c.suite_id] || null })),
    error: null,
  }
}

export const fetchRolePermissionsMatrix = async () => {
  const db = getAdminDb()
  if (!db) return { data: [], error: null }
  const [perms, roles] = await Promise.all([
    db.from('admin_permissions').select('permission_key, permission_name, category').order('category'),
    db.from('role_permissions').select('role, permission_key'),
  ])
  return { data: { permissions: perms.data || [], rolePermissions: roles.data || [] }, error: perms.error || roles.error }
}

export async function uploadTcEvidence(file, runId, caseId, label = 'actual', note = '') {
  const db = getAdminDb()
  if (!db) return { error: 'Database not configured' }
  const path = `admin/${runId}/${file.name}`
  const { error: upErr } = await db.storage.from('testing-evidence').upload(path, file, { upsert: true })
  if (upErr) return { error: upErr.message }
  return adminRpc('create_tc_evidence_record', {
    p_test_run_id: runId,
    p_test_case_id: caseId || null,
    p_file_name: file.name,
    p_file_path: path,
    p_file_type: file.type?.startsWith('video') ? 'video' : file.type?.startsWith('image') ? 'screenshot' : 'attachment',
    p_label: label,
    p_note: note || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function saveDiagnosticSession(name, checks, overallStatus, environment = 'local') {
  return adminRpc('save_diagnostic_session', {
    p_session_name: name,
    p_checks_run: checks,
    p_overall_status: overallStatus,
    p_environment: environment,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function upsertTcSetting(key, value, type = 'text', description = null) {
  return adminRpc('upsert_tc_setting', {
    p_setting_key: key,
    p_setting_value: value,
    p_setting_type: type,
    p_description: description,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function logTestDefect({ title, description, testRunId, testCaseId, testResultId, severity }) {
  return adminRpc('log_test_defect', {
    p_title: title,
    p_description: description,
    p_test_run_id: testRunId,
    p_test_case_id: testCaseId || null,
    p_test_result_id: testResultId || null,
    p_severity: severity || 'medium',
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function runDiagnosticChecks(environment = 'local') {
  const db = getAdminDb()
  const checks = []
  const push = (check_key, label, status, message, duration_ms = 0) => {
    checks.push({ check_key, label, status, message, duration_ms })
  }

  const timed = async (key, label, fn) => {
    const start = performance.now()
    try {
      const result = await fn()
      push(key, label, result.status, result.message, Math.round(performance.now() - start))
    } catch (e) {
      push(key, label, 'fail', e.message || String(e), Math.round(performance.now() - start))
    }
  }

  await timed('auth.session', 'Admin session', async () => {
    const adminId = await getCurrentAdminUserId()
    return adminId
      ? { status: 'pass', message: 'Active admin session resolved' }
      : { status: 'fail', message: 'No admin session' }
  })

  await timed('db.active_admins', 'Active admin users', async () => {
    if (!db) return { status: 'fail', message: 'DB not configured' }
    const { count } = await db.from('admin_users').select('*', { count: 'exact', head: true }).eq('activation_status', 'active')
    if ((count || 0) <= 1) return { status: 'warn', message: `Only ${count} active admin(s)` }
    return { status: 'pass', message: `${count} active admins` }
  })

  await timed('db.subscription_plans', 'Subscription plans catalog', async () => {
    const pub = getPublicDb()
    if (!pub) return { status: 'warn', message: 'Public DB not configured' }
    const { count } = await pub.from('subscription_plans').select('*', { count: 'exact', head: true })
    if (!count) return { status: 'warn', message: 'No subscription plans found' }
    return { status: 'pass', message: `${count} plan rows` }
  })

  await timed('settings.moratorium', 'Tester moratorium setting', async () => {
    if (!db) return { status: 'fail', message: 'DB not configured' }
    const { data } = await db.from('system_settings').select('setting_value').eq('setting_key', 'testers.default_moratorium_months').maybeSingle()
    return data?.setting_value
      ? { status: 'pass', message: `Default moratorium: ${data.setting_value} months` }
      : { status: 'warn', message: 'testers.default_moratorium_months not set' }
  })

  await timed('storage.docs', 'Documentation bucket', async () => {
    const base = (import.meta.env.VITE_ADMIN_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
    const res = await fetch(`${base}/storage/v1/object/public/documentation/admin/general/Getting_Started.md`)
    if (res.ok || res.status === 404) return { status: res.ok ? 'pass' : 'warn', message: res.ok ? 'Documentation reachable' : 'Bucket OK; Getting_Started.md not uploaded yet' }
    return { status: 'fail', message: `HTTP ${res.status}` }
  })

  await timed('storage.evidence', 'Testing evidence bucket', async () => {
    if (!db) return { status: 'fail', message: 'DB not configured' }
    const { error } = await db.storage.from('testing-evidence').list('admin', { limit: 1 })
    return error ? { status: 'warn', message: error.message } : { status: 'pass', message: 'Bucket reachable' }
  })

  for (const [name, url] of MODULE_REMOTES) {
    await timed(`modules.federation.${name}`, `Module federation: ${name}`, async () => {
      const res = await fetch(url, { method: 'HEAD' }).catch(() => fetch(url))
      return res.ok ? { status: 'pass', message: 'remoteEntry.js OK' } : { status: 'fail', message: `HTTP ${res.status}` }
    })
  }

  const overall = checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.some((c) => c.status === 'warn')
      ? 'warn'
      : 'pass'

  return { checks, overall }
}

export async function fetchFlakyTests() {
  const db = getAdminDb()
  if (!db) return { data: [], error: null }
  const { data: runs } = await db.from('test_runs').select('id').order('created_at', { ascending: false }).limit(10)
  const runIds = (runs || []).map((r) => r.id)
  if (!runIds.length) return { data: [], error: null }
  const { data: results } = await db.from('test_results').select('case_id, status').in('run_id', runIds)
  const stats = {}
  for (const r of results || []) {
    if (!r.case_id) continue
    if (!stats[r.case_id]) stats[r.case_id] = { failed: 0, total: 0 }
    stats[r.case_id].total += 1
    if (r.status === 'failed') stats[r.case_id].failed += 1
  }
  const flaky = Object.entries(stats)
    .filter(([, s]) => s.failed >= 2 && s.failed < s.total)
    .map(([caseId, s]) => ({ case_id: caseId, ...s }))
  return { data: flaky, error: null }
}
