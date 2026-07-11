import { getAdminDb, getPublicDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

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
      else if (f.op === 'gte') query = query.gte(f.col, f.val)
      else if (f.op === 'lte') query = query.lte(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
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

export async function fetchTesterCapacity() {
  const { data, error } = await adminRpc('get_tester_capacity')
  if (error) return { data: { activeCount: 0, maxTesters: 100 }, error }
  const row = Array.isArray(data) ? data[0] : data
  return {
    data: {
      activeCount: Number(row?.active_count ?? 0),
      maxTesters: Number(row?.max_testers ?? 100),
    },
    error: null,
  }
}

export const fetchTesterApplications = (opts = {}) => {
  const filters = []
  if (opts.status) filters.push({ op: 'eq', col: 'status', val: opts.status })
  return q(getPublicDb(), 'tester_applications', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: filters.length ? filters : undefined,
  })
}

export const fetchSystemTesters = (opts = {}) => {
  const filters = []
  if (opts.status) filters.push({ op: 'eq', col: 'status', val: opts.status })
  return q(getPublicDb(), 'system_testers', '*', {
    order: { column: 'moratorium_end', asc: true },
    limit: opts.limit || 500,
    filters: filters.length ? filters : undefined,
  })
}

export const fetchTesterProjectAssignments = (opts = {}) => {
  const filters = []
  if (opts.is_active !== undefined) filters.push({ op: 'eq', col: 'is_active', val: opts.is_active })
  if (opts.tester_id) filters.push({ op: 'eq', col: 'tester_id', val: opts.tester_id })
  return q(getPublicDb(), 'tester_project_assignments', '*', {
    order: { column: 'assigned_at', asc: false },
    limit: opts.limit || 500,
    filters: filters.length ? filters : undefined,
  })
}

export const fetchTesterOrgSandboxes = () =>
  q(getPublicDb(), 'tester_org_sandboxes', '*', {
    order: { column: 'created_at', asc: false },
    limit: 200,
  })

export async function fetchTesterDashboardSummary() {
  const [capacityRes, testersRes, appsRes] = await Promise.all([
    fetchTesterCapacity(),
    fetchSystemTesters(),
    fetchTesterApplications(),
  ])

  const testers = testersRes.data || []
  const apps = appsRes.data || []
  const now = Date.now()
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const monthMs = 30 * 24 * 60 * 60 * 1000

  const expiringThisWeek = testers.filter((t) => {
    if (t.status !== 'active') return false
    const end = new Date(t.moratorium_end).getTime()
    return end >= now && end <= now + weekMs
  }).length

  const expiringThisMonth = testers.filter((t) => {
    if (t.status !== 'active') return false
    const end = new Date(t.moratorium_end).getTime()
    return end >= now && end <= now + monthMs
  }).length

  const expired = testers.filter((t) => t.status === 'expired' || new Date(t.moratorium_end).getTime() < now).length
  const converted = testers.filter((t) => t.status === 'converted').length
  const pendingApps = apps.filter((a) => a.status === 'pending').length

  return {
    data: {
      ...capacityRes.data,
      expiringThisWeek,
      expiringThisMonth,
      expired,
      converted,
      activeTesters: testers.filter((t) => t.status === 'active').length,
      pendingApps,
      testers,
      applications: apps,
    },
    error: capacityRes.error || testersRes.error || appsRes.error,
  }
}

export async function enrichTestersWithUsers(testers) {
  const db = getPublicDb()
  if (!db || !testers?.length) return testers || []
  const userIds = [...new Set(testers.map((t) => t.user_id).filter(Boolean))]
  const { data: users } = await q(db, 'users', 'id, email, full_name', {
    filters: [{ op: 'in', col: 'id', val: userIds }],
    limit: userIds.length,
  })
  const byId = Object.fromEntries((users || []).map((u) => [u.id, u]))
  return testers.map((t) => ({
    ...t,
    user: byId[t.user_id] || null,
    email: byId[t.user_id]?.email,
    full_name: byId[t.user_id]?.full_name,
  }))
}

export async function enrichApplicationsWithReviewers(applications) {
  const adminDb = getAdminDb()
  if (!adminDb || !applications?.length) return applications || []
  const reviewerIds = [...new Set(applications.map((a) => a.reviewed_by).filter(Boolean))]
  if (!reviewerIds.length) return applications
  const { data: admins } = await q(adminDb, 'admin_users', 'id, email, full_name', {
    filters: [{ op: 'in', col: 'id', val: reviewerIds }],
    limit: reviewerIds.length,
  })
  const byId = Object.fromEntries((admins || []).map((a) => [a.id, a]))
  return applications.map((a) => ({
    ...a,
    reviewer: byId[a.reviewed_by] || null,
  }))
}

export async function searchUsersForTesterGrant(term) {
  const db = getPublicDb()
  if (!db || !term?.trim()) return { data: [], error: null }
  const t = term.trim()
  const { data, error } = await db
    .from('users')
    .select('id, email, full_name, is_active')
    .or(`email.ilike.%${t}%,full_name.ilike.%${t}%`)
    .limit(20)
  return { data: data || [], error }
}

export async function fetchTesterActivity(userIds = []) {
  const adminDb = getAdminDb()
  const publicDb = getPublicDb()
  if (!adminDb || !userIds.length) return { data: [], error: null }

  const [auditRes, bugsRes, featuresRes] = await Promise.all([
    adminDb
      .from('admin_audit_log')
      .select('id, action, entity_type, created_at, details')
      .order('created_at', { ascending: false })
      .limit(500),
    publicDb
      .from('bugs')
      .select('id, title, status, reporter_id, created_at')
      .in('reporter_id', userIds)
      .order('created_at', { ascending: false })
      .limit(200),
    publicDb
      .from('feature_requests')
      .select('id, title, status, user_id, created_at')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  const audit = (auditRes.data || []).filter((row) => {
    const uid = row.details?.user_id
    return uid && userIds.includes(uid)
  })

  return {
    data: {
      audit,
      bugs: bugsRes.data || [],
      featureRequests: featuresRes.data || [],
    },
    error: auditRes.error || bugsRes.error || featuresRes.error,
  }
}

export function daysUntilExpiry(moratoriumEnd) {
  if (!moratoriumEnd) return null
  const ms = new Date(moratoriumEnd).getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function expiryBadgeVariant(daysLeft, status) {
  if (status === 'expired' || status === 'revoked') return 'gray'
  if (daysLeft == null) return 'gray'
  if (daysLeft < 0) return 'gray'
  if (daysLeft < 30) return 'red'
  if (daysLeft < 90) return 'yellow'
  return 'green'
}

export function capacityBarVariant(active, max) {
  if (!max) return 'green'
  const pct = active / max
  if (pct >= 1) return 'red'
  if (pct >= 0.8) return 'yellow'
  return 'green'
}

export async function approveTesterApplication(applicationId, payload = {}) {
  return adminRpc('approve_tester_application', {
    p_application_id: applicationId,
    p_moratorium_months: payload.moratorium_months ?? null,
    p_grant_note: payload.grant_note || null,
    p_systems: payload.systems || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function rejectTesterApplication(applicationId, rejectionReason) {
  return adminRpc('reject_tester_application', {
    p_application_id: applicationId,
    p_rejection_reason: rejectionReason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function grantTesterAccess(payload) {
  return adminRpc('grant_tester_access', {
    p_user_id: payload.user_id,
    p_systems: payload.systems,
    p_moratorium_months: payload.moratorium_months ?? null,
    p_grant_note: payload.grant_note || null,
    p_application_id: payload.application_id || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function revokeTesterAccess(testerId, reason) {
  return adminRpc('revoke_tester_access', {
    p_tester_id: testerId,
    p_reason: reason || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function extendTesterMoratorium(testerId, additionalMonths) {
  return adminRpc('extend_tester_moratorium', {
    p_tester_id: testerId,
    p_additional_months: additionalMonths,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function markTesterConverted(testerId) {
  return adminRpc('mark_tester_converted', {
    p_tester_id: testerId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function assignTesterToProject(payload) {
  return adminRpc('assign_tester_to_project', {
    p_tester_id: payload.tester_id,
    p_account_id: payload.account_id,
    p_project_id: payload.project_id || null,
    p_org_role: payload.org_role,
    p_project_role: payload.project_role || null,
    p_notes: payload.notes || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function revokeTesterAssignment(assignmentId, reason) {
  return adminRpc('revoke_tester_assignment', {
    p_assignment_id: assignmentId,
    p_reason: reason || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createTesterSandbox(payload) {
  return adminRpc('create_tester_sandbox', {
    p_account_id: payload.account_id,
    p_sandbox_name: payload.sandbox_name,
    p_moratorium_months: payload.moratorium_months ?? null,
    p_target_system: payload.target_system || 'platform',
    p_notes: payload.notes || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function provisionSandboxMembers(sandboxId) {
  return adminRpc('provision_sandbox_members', {
    p_sandbox_id: sandboxId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function processTesterExpiryNotifications() {
  return adminRpc('process_tester_expiry_notifications')
}

export async function batchExtendTesterMoratorium(testerIds, additionalMonths) {
  const results = []
  for (const id of testerIds) {
    const res = await extendTesterMoratorium(id, additionalMonths)
    results.push({ id, ...res })
  }
  const failed = results.filter((r) => r.error)
  return {
    data: results,
    error: failed.length ? failed.map((f) => f.error).join('; ') : null,
  }
}
