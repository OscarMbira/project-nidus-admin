import { getAdminDb, getPublicDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

const toError = (error) => {
  if (!error) return null
  if (typeof error === 'string') return error
  const parts = [error.message, error.details, error.hint].filter(Boolean)
  return parts.join(' — ') || String(error)
}

function isMissingDbRelation(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('does not exist')
    || message.includes('42p01')
    || message.includes('pgrst205')
    || message.includes('could not find the table')
  )
}

function missingLifecycleLogsResult() {
  return {
    data: [],
    error: null,
    count: 0,
    unavailable: true,
    unavailableReason: 'Record lifecycle logging is not set up. Run pnpm run admin:migrate-record-lifecycle (v95–v99).',
  }
}

function summarisePendingChangesClient(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null
  const entries = Object.entries(changes)
  if (!entries.length) return null
  return entries
    .map(([key, value]) => {
      const rendered = typeof value === 'string'
        ? value
        : JSON.stringify(value).slice(0, 160)
      return `${key} → ${rendered}`
    })
    .join('; ')
}

function pendingChangesKey(tableName, recordId) {
  return `${tableName}:${recordId}`
}

function resolveRecordLabel(row, labelMaps) {
  if (row.record_label) return row.record_label
  const { table_name: tableName, record_id: recordId } = row
  if (!recordId) return null
  if (tableName === 'subscription_plans') return labelMaps.plans[recordId] || null
  if (tableName === 'affiliates') return labelMaps.affiliates[recordId] || null
  if (tableName === 'payment_gateways') return labelMaps.gateways[recordId] || null
  if (tableName === 'cancellation_reason_categories') return labelMaps.categories[recordId] || null
  return null
}

function buildPendingDiff(liveRow, proposedChanges) {
  if (!proposedChanges || typeof proposedChanges !== 'object' || Array.isArray(proposedChanges)) {
    return { original_changes: null, new_changes: null }
  }

  const fields = Object.keys(proposedChanges)
  if (!fields.length) return { original_changes: null, new_changes: null }

  const originalChanges = {}
  const newChanges = {}
  for (const field of fields) {
    originalChanges[field] = liveRow?.[field] ?? null
    newChanges[field] = proposedChanges[field]
  }

  return { original_changes: originalChanges, new_changes: newChanges }
}

async function enrichPendingAuthorisationRows(rows) {
  if (!rows.length) return rows

  const db = getAdminDb()
  const publicDb = getPublicDb()
  if (!db) return rows

  const planIds = [...new Set(rows.filter((row) => row.table_name === 'subscription_plans' && row.record_id).map((row) => row.record_id))]
  const affiliateIds = [...new Set(rows.filter((row) => row.table_name === 'affiliates' && row.record_id).map((row) => row.record_id))]
  const gatewayIds = [...new Set(rows.filter((row) => row.table_name === 'payment_gateways' && row.record_id).map((row) => row.record_id))]
  const categoryIds = [...new Set(rows.filter((row) => row.table_name === 'cancellation_reason_categories' && row.record_id).map((row) => row.record_id))]

  const pendingRes = await db
    .from('record_pending_changes')
    .select('table_name, record_id, proposed_changes')

  const pendingFullMap = {}
  const pendingPlanIds = new Set()
  const pendingAffiliateIds = new Set()
  const pendingGatewayIds = new Set()
  const pendingCategoryIds = new Set()

  if (!pendingRes.error) {
    for (const pending of pendingRes.data || []) {
      const key = pendingChangesKey(pending.table_name, pending.record_id)
      pendingFullMap[key] = pending.proposed_changes
      if (pending.table_name === 'subscription_plans') pendingPlanIds.add(pending.record_id)
      if (pending.table_name === 'affiliates') pendingAffiliateIds.add(pending.record_id)
      if (pending.table_name === 'payment_gateways') pendingGatewayIds.add(pending.record_id)
      if (pending.table_name === 'cancellation_reason_categories') pendingCategoryIds.add(pending.record_id)
    }
  }

  const livePlanIds = [...new Set([...planIds, ...pendingPlanIds])]
  const liveAffiliateIds = [...new Set([...affiliateIds, ...pendingAffiliateIds])]
  const liveGatewayIds = [...new Set([...gatewayIds, ...pendingGatewayIds])]
  const liveCategoryIds = [...new Set([...categoryIds, ...pendingCategoryIds])]

  const [plansRes, affiliatesRes, gatewaysRes, categoriesRes] = await Promise.all([
    livePlanIds.length && publicDb
      ? publicDb.from('subscription_plans').select('*').in('id', livePlanIds)
      : Promise.resolve({ data: [] }),
    liveAffiliateIds.length
      ? db.from('affiliates').select('*').in('id', liveAffiliateIds)
      : Promise.resolve({ data: [] }),
    liveGatewayIds.length
      ? db.from('payment_gateways').select('*').in('id', liveGatewayIds)
      : Promise.resolve({ data: [] }),
    liveCategoryIds.length
      ? db.from('cancellation_reason_categories').select('*').in('id', liveCategoryIds)
      : Promise.resolve({ data: [] }),
  ])

  const labelMaps = {
    plans: Object.fromEntries((plansRes.data || []).map((row) => [row.id, row.plan_name])),
    affiliates: Object.fromEntries((affiliatesRes.data || []).map((row) => [row.id, row.name])),
    gateways: Object.fromEntries((gatewaysRes.data || []).map((row) => [row.id, row.display_name])),
    categories: Object.fromEntries((categoriesRes.data || []).map((row) => [row.id, row.label])),
  }

  const liveRowMap = {}
  for (const row of plansRes.data || []) liveRowMap[pendingChangesKey('subscription_plans', row.id)] = row
  for (const row of affiliatesRes.data || []) liveRowMap[pendingChangesKey('affiliates', row.id)] = row
  for (const row of gatewaysRes.data || []) liveRowMap[pendingChangesKey('payment_gateways', row.id)] = row
  for (const row of categoriesRes.data || []) liveRowMap[pendingChangesKey('cancellation_reason_categories', row.id)] = row

  return rows.map((row) => {
    const key = pendingChangesKey(row.table_name, row.record_id)
    const proposedChanges = pendingFullMap[key]
    const diff = buildPendingDiff(liveRowMap[key], proposedChanges)

    return {
      ...row,
      record_label: resolveRecordLabel(row, labelMaps),
      ...diff,
    }
  })
}

async function fetchPendingAuthorisationRequestsDirect() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }

  const adminUserId = await getCurrentAdminUserId()
  if (!adminUserId) return { data: [], error: 'Active admin user required' }

  const { fetchAdminContext } = await import('./adminContext.jsx')
  const ctx = await fetchAdminContext()
  const isConfigure = ctx.permissions.includes('lifecycle.configure')

  let query = db
    .from('record_authorisation_requests')
    .select('*')
    .eq('status', 'pending')
    .order('activated_at', { ascending: true, nullsFirst: false })
    .order('submitted_at', { ascending: true })

  if (!isConfigure) {
    query = query.eq('authoriser_id', adminUserId)
  }

  const { data, error } = await query
  if (error && !isMissingDbRelation(error)) {
    return { data: [], error: toError(error) }
  }

  const rows = (data || []).map((row) => ({
    request_id: row.id,
    submission_batch_id: row.submission_batch_id,
    table_name: row.table_name,
    root_record_id: row.root_record_id,
    record_id: row.record_id,
    approval_level: row.approval_level,
    role_label: row.role_label,
    submitted_by: row.submitted_by,
    authoriser_id: row.authoriser_id,
    status: row.status,
    submission_notes: row.submission_notes,
    submitted_at: row.submitted_at,
    activated_at: row.activated_at,
    record_label: null,
    change_summary: row.submission_notes,
    assigned_to_me: row.authoriser_id === adminUserId,
    can_decide: row.authoriser_id === adminUserId || isConfigure,
  }))

  if (rows.length === 0) {
    const { data: pendingRows, error: pendingError } = await db
      .from('record_pending_changes')
      .select('*')
      .order('submitted_at', { ascending: true })

    if (!pendingError && pendingRows?.length) {
      const { data: authorisers } = await db
        .from('record_authorisers')
        .select('*')
        .eq('is_active', true)

      for (const pending of pendingRows) {
        const tableAuthorisers = (authorisers || []).filter(
          (authoriser) => authoriser.table_name === pending.table_name,
        )
        if (!tableAuthorisers.length) continue

        const minLevel = Math.min(...tableAuthorisers.map((authoriser) => authoriser.approval_level))
        const activeAuthorisers = tableAuthorisers.filter(
          (authoriser) => authoriser.approval_level === minLevel,
        )
        const myAuthoriser = activeAuthorisers.find(
          (authoriser) => authoriser.authoriser_admin_user_id === adminUserId,
        )

        if (!isConfigure && !myAuthoriser) continue

        const displayAuthoriser = myAuthoriser || activeAuthorisers[0]
        rows.push({
          request_id: null,
          submission_batch_id: pending.submission_batch_id,
          table_name: pending.table_name,
          root_record_id: pending.root_record_id,
          record_id: pending.record_id,
          approval_level: displayAuthoriser?.approval_level ?? minLevel,
          role_label: displayAuthoriser?.role_label ?? 'Authoriser',
          submitted_by: pending.submitted_by,
          authoriser_id: displayAuthoriser?.authoriser_admin_user_id ?? null,
          status: 'pending',
          submission_notes: 'Pending changes awaiting authorisation',
          submitted_at: pending.submitted_at,
          activated_at: pending.submitted_at,
          record_label: null,
          change_summary: summarisePendingChangesClient(pending.proposed_changes),
          assigned_to_me: Boolean(myAuthoriser),
          can_decide: Boolean(myAuthoriser) || isConfigure,
        })
      }
    }
  }

  return {
    data: rows,
    error: null,
  }
}

export async function fetchPendingAuthorisationRequests() {
  const result = await fetchPendingAuthorisationRequestsDirect()
  if (result.error) return { data: [], error: result.error }

  const enriched = await enrichPendingAuthorisationRows(result.data || [])
  return { data: enriched, error: null }
}

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const adminUserId = await getCurrentAdminUserId()
  const payload = { ...params }
  if (adminUserId) payload.p_admin_user_id = adminUserId
  const { data, error } = await db.rpc(fn, payload)
  return { data: data ?? null, error: toError(error) }
}

export const LIFECYCLE_PILOT_TABLES = [
  { key: 'subscription_plans', label: 'Subscription Plans' },
  { key: 'affiliates', label: 'Affiliates' },
  { key: 'payment_gateways', label: 'Payment Gateways' },
  { key: 'cancellation_reason_categories', label: 'Cancellation Reason Categories' },
]

export const LIFECYCLE_STATUS_LABELS = {
  unauthorised: 'Unauthorised',
  live: 'Live',
  history: 'History',
  archived: 'Archived',
}

export function lifecycleStatusVariant(status) {
  if (status === 'live') return 'active'
  if (status === 'unauthorised') return 'pending'
  if (status === 'history') return 'retrying'
  if (status === 'archived') return 'suspended'
  return 'content_admin'
}

export async function fetchLifecycleConfigs() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db
    .from('record_lifecycle_config')
    .select('*')
    .order('table_name')
  return { data: data || [], error: toError(error) }
}

export async function fetchLifecycleAuthorisers(tableName = null) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  let query = db.from('record_authorisers').select('*').order('table_name').order('approval_level')
  if (tableName) query = query.eq('table_name', tableName)
  const { data, error } = await query
  return { data: data || [], error: toError(error) }
}

export async function fetchArchiveConfigs() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db
    .from('record_archive_config')
    .select('*')
    .order('table_name')
  return { data: data || [], error: toError(error) }
}

export async function fetchLifecycleConfig(tableName) {
  return rpc('get_lifecycle_config', { p_table_name: tableName })
}

export async function fetchApprovalChain(tableName) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_approval_chain', { p_table_name: tableName })
  return { data, error: toError(error) }
}

export async function fetchApprovalProgress(batchId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_approval_progress', { p_batch_id: batchId })
  return { data, error: toError(error) }
}

export async function fetchRecordLifecycleChain(tableName, rootRecordId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_record_lifecycle_chain', {
    p_table_name: tableName,
    p_root_record_id: rootRecordId,
  })
  return { data, error: toError(error) }
}

export async function fetchLifecycleLogs(tableName, rootRecordId) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db
    .from('record_lifecycle_logs')
    .select('*')
    .eq('table_name', tableName)
    .eq('root_record_id', rootRecordId)
    .order('performed_at', { ascending: false })
  if (error && isMissingDbRelation(error)) return missingLifecycleLogsResult()
  return { data: data || [], error: toError(error) }
}

export async function fetchLifecycleLogsByTable(tableName, opts = {}) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured', count: 0 }
  let query = db
    .from('record_lifecycle_logs')
    .select('*', opts.count ? { count: 'exact' } : undefined)
    .eq('table_name', tableName)
    .order('performed_at', { ascending: false })
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.range) query = query.range(opts.range.from, opts.range.to)
  const { data, error, count } = await query
  if (error && isMissingDbRelation(error)) return missingLifecycleLogsResult()
  return { data: data || [], error: toError(error), count: count ?? 0 }
}

export async function upsertLifecycleConfig(payload) {
  return rpc('upsert_lifecycle_config', {
    p_table_name: payload.table_name,
    p_approval_enabled: payload.approval_enabled,
    p_level_approval_mode: payload.level_approval_mode,
    p_history_retention_days: payload.history_retention_days ?? null,
    p_auto_archive_enabled: payload.auto_archive_enabled,
    p_archive_retention_years: payload.archive_retention_years ?? null,
    p_is_active: payload.is_active,
  })
}

export async function upsertRecordAuthoriser(payload) {
  return rpc('upsert_record_authoriser', {
    p_table_name: payload.table_name,
    p_authoriser_admin_user_id: payload.authoriser_admin_user_id,
    p_approval_level: payload.approval_level ?? 1,
    p_role_label: payload.role_label ?? null,
    p_is_active: payload.is_active ?? true,
  })
}

export async function upsertArchiveConfig(payload) {
  return rpc('upsert_archive_config', {
    p_table_name: payload.table_name,
    p_history_retention_days: payload.history_retention_days ?? null,
    p_auto_archive_enabled: payload.auto_archive_enabled ?? null,
    p_archive_retention_years: payload.archive_retention_years ?? null,
    p_override_reason: payload.override_reason,
    p_regulatory_reference: payload.regulatory_reference ?? null,
    p_effective_from: payload.effective_from ?? null,
    p_effective_until: payload.effective_until ?? null,
    p_is_active: payload.is_active ?? true,
  })
}

export async function submitForAuthorisation({ tableName, recordId, rootRecordId, notes, proposedChanges }) {
  return rpc('submit_for_authorisation', {
    p_table_name: tableName,
    p_record_id: recordId,
    p_root_record_id: rootRecordId,
    p_notes: notes ?? null,
    p_proposed_changes: proposedChanges ?? null,
  })
}

export async function fetchPendingChanges(tableName, recordId) {
  return rpc('get_pending_changes', {
    p_table_name: tableName,
    p_record_id: recordId,
  })
}

export async function processAuthoriserDecision({ requestId, decision, notes }) {
  return rpc('process_authoriser_decision', {
    p_request_id: requestId,
    p_decision: decision,
    p_notes: notes ?? null,
  })
}

export async function decidePendingRecord({ tableName, recordId, decision, notes }) {
  return rpc('decide_pending_record', {
    p_table_name: tableName,
    p_record_id: recordId,
    p_decision: decision,
    p_notes: notes ?? null,
  })
}

export async function transitionRecordStatus({ tableName, recordId, operation, notes }) {
  return rpc('transition_record_status', {
    p_table_name: tableName,
    p_record_id: recordId,
    p_operation: operation,
    p_notes: notes ?? null,
  })
}
