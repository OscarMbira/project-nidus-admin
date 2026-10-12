import { getAdminDb, getPublicDb, getSimDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'
import { countsToSeverityMap, evaluateErrorReleaseReadiness } from './errorReadinessUtils.js'
import {
  findIdGenerationRuleForTable,
  normalizeTargetTable,
  targetTableLookupCandidates,
} from './idGenerationRuleUtils.js'

const q = (client, table, select, opts = {}) => {
  if (!client) return Promise.resolve({ data: [], error: null, count: 0 })
  let query = client.from(table).select(select, opts.count ? { count: 'exact' } : undefined)
  if (opts.order?.column) {
    query = opts.order.asc === false
      ? query.order(opts.order.column, { ascending: false })
      : query.order(opts.order.column)
  }
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.range) query = query.range(opts.range.from, opts.range.to)
  if (opts.filters) {
    for (const f of opts.filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
      else if (f.op === 'gte') query = query.gte(f.col, f.val)
      else if (f.op === 'lte') query = query.lte(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
    }
  }
  return query
}

const USER_LIST_COLUMNS = 'id, auth_user_id, email, full_name, is_active, is_suspended, created_at, last_login_at'

function isSubscriptionNotFoundError(error) {
  const msg = typeof error === 'string' ? error : error?.message || String(error || '')
  return /subscription not found/i.test(msg)
}

function mapSubscriptionDetailRpcRow(row) {
  if (!row) return null
  return {
    id: row.subscription_id,
    user_id: row.user_id,
    user_email: row.user_email,
    account_id: row.account_id,
    plan_type: row.plan_type,
    billing_cycle: row.billing_cycle,
    plan_name: row.plan_name,
    status: row.subscription_status,
    amount_paid: row.amount_paid,
    currency: row.currency,
    started_at: row.started_at,
    expires_at: row.expires_at,
    trial_end: row.trial_end,
    next_billing_date: row.next_billing_date,
    is_lifetime: row.is_lifetime,
    is_trial: row.is_trial,
    grace_period_end: row.grace_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    target_system: row.target_system,
  }
}

async function fetchSubscriptionRecordViaRpc(id, targetSystem = 'platform') {
  const db = getAdminDb()
  if (!db || !id) return { data: null, error: null }

  const { data, error } = await db.rpc('get_subscription_detail', {
    p_subscription_id: id,
    p_target_system: targetSystem,
  })

  if (error) {
    if (isSubscriptionNotFoundError(error)) return { data: null, error: null }
    return { data: null, error }
  }

  const row = Array.isArray(data) ? data[0] : data
  return { data: mapSubscriptionDetailRpcRow(row), error: null }
}
const USER_LIST_COLUMNS_LEGACY = 'id, auth_user_id, email, full_name, is_active, created_at, last_login_at'

const userListQueryOpts = (opts = {}) => ({
  order: { column: 'created_at', asc: false },
  limit: opts.limit || 500,
  range: opts.range,
  filters: opts.filters,
  count: opts.count,
})

export async function fetchUsers(opts = {}) {
  const db = getPublicDb()
  const queryOpts = userListQueryOpts(opts)
  let result = await q(db, 'users', USER_LIST_COLUMNS, queryOpts)
  const message = result.error?.message || String(result.error || '')
  if (message.includes('is_suspended')) {
    result = await q(db, 'users', USER_LIST_COLUMNS_LEGACY, queryOpts)
    if (result.data) {
      result = {
        ...result,
        data: result.data.map((row) => ({ ...row, is_suspended: false })),
      }
    }
  }
  return result
}

export const fetchUserById = (id) =>
  q(getPublicDb(), 'users', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchAccounts = (opts = {}) =>
  q(getPublicDb(), 'accounts', 'id, account_name, is_verified, is_suspended, created_at, owner_user_id, product_edition', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchAccountById = (id) =>
  q(getPublicDb(), 'accounts', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export async function fetchAccountMembers(accountId) {
  const adminDb = getAdminDb()
  if (adminDb) {
    const { data, error } = await adminDb.rpc('get_account_members', { p_account_id: accountId })
    if (!error) {
      return { data: data || [], error: null }
    }
    const message = error?.message || String(error)
    if (!message.includes('get_account_members') && !message.includes('Could not find the function')) {
      return { data: [], error }
    }
  }

  const { data: account, error: accountError } = await fetchAccountById(accountId)
  if (accountError) return { data: [], error: accountError }
  if (!account?.owner_user_id) return { data: [], error: null }

  return q(getPublicDb(), 'users', 'id, email, full_name, is_active', {
    filters: [{ op: 'in', col: 'id', val: [account.owner_user_id] }],
    order: { column: 'full_name' },
    limit: 200,
  })
}

export const fetchOwnedAccountsForUser = (userId) =>
  q(getPublicDb(), 'accounts', 'id, account_name, is_verified, is_suspended, created_at, owner_user_id', {
    filters: [{ op: 'eq', col: 'owner_user_id', val: userId }],
    order: { column: 'created_at', asc: false },
    limit: 10,
  })

export const fetchPlatformSubscriptions = (opts = {}) =>
  q(getPublicDb(), 'platform_subscriptions', 'id, status, user_id, account_id, started_at, expires_at, created_at, plan_type, billing_cycle, amount_paid, currency, custom_features', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchUserSubscriptions = (userId) =>
  q(getPublicDb(), 'platform_subscriptions', '*', {
    filters: [{ op: 'eq', col: 'user_id', val: userId }],
    order: { column: 'created_at', asc: false },
  })

export const fetchSimulatorSubscriptions = (opts = {}) =>
  q(getSimDb(), 'simulator_subscriptions', 'id, status, user_id, started_at, expires_at, created_at, plan_type, billing_cycle, amount_paid, currency, is_lifetime, features', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export async function fetchAllSubscriptions(opts = {}) {
  const [platformRes, simRes] = await Promise.all([
    fetchPlatformSubscriptions(opts),
    fetchSimulatorSubscriptions(opts),
  ])
  const error = platformRes.error || simRes.error
  if (error) return { data: [], error }

  const platformRows = (platformRes.data || []).map((row) => ({ ...row, target_system: 'platform' }))
  const simRows = (simRes.data || []).map((row) => ({ ...row, target_system: 'simulator' }))
  const data = [...platformRows, ...simRows].sort(
    (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  )
  return { data, error: null }
}

export async function fetchSubscriptionRecord(id, targetSystem = 'platform') {
  const rpcResult = await fetchSubscriptionRecordViaRpc(id, targetSystem)
  if (rpcResult.data || rpcResult.error) return rpcResult

  const db = targetSystem === 'simulator' ? getSimDb() : getPublicDb()
  const table = targetSystem === 'simulator' ? 'simulator_subscriptions' : 'platform_subscriptions'
  return q(db, table, '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))
}

/** Resolve a subscription UUID in platform or sim tables (display IDs share one rule table). */
export async function fetchSubscriptionRecordAnySystem(id) {
  if (!id) return { data: null, targetSystem: null, error: null }

  const [platformRes, simRes] = await Promise.all([
    fetchSubscriptionRecord(id, 'platform'),
    fetchSubscriptionRecord(id, 'simulator'),
  ])

  if (platformRes.data) {
    return { data: platformRes.data, targetSystem: 'platform', error: null }
  }
  if (simRes.data) {
    return { data: simRes.data, targetSystem: 'simulator', error: null }
  }

  return {
    data: null,
    targetSystem: null,
    error: platformRes.error || simRes.error || null,
  }
}

export const fetchSubscriptionPlans = () =>
  q(getPublicDb(), 'subscription_plans', '*', {
    order: { column: 'display_order', asc: true },
  })

export const fetchAllSubscriptionPlans = () =>
  q(getPublicDb(), 'subscription_plans', '*', {
    order: { column: 'display_order', asc: true },
  })

export async function fetchSubscriptionPlansCatalog() {
  const db = getPublicDb()
  if (!db) return { data: [], error: null, count: 0 }

  const { data, error } = await db.rpc('get_public_subscription_plans', { p_target_system: null })
  if (!error && Array.isArray(data)) {
    return { data, error: null, count: data.length }
  }

  return q(db, 'subscription_plans', '*', {
    filters: [{ op: 'eq', col: 'is_active', val: true }],
    order: { column: 'display_order', asc: true },
  })
}

export async function fetchAllSubscriptionFeatureCatalog() {
  const publicDb = getPublicDb()
  if (publicDb) {
    const { data, error } = await publicDb.rpc('get_subscription_feature_catalog', { p_target_system: null })
    if (!error && Array.isArray(data)) {
      return { data, error: null, count: data.length }
    }
  }

  return q(getAdminDb(), 'subscription_feature_catalog', 'id, feature_key, feature_label, description, category, target_system, sort_order', {
    filters: [{ op: 'eq', col: 'is_active', val: true }],
    order: { column: 'sort_order' },
  })
}

export const fetchSubscriptionFeatureCatalog = (targetSystem = 'platform') =>
  fetchAllSubscriptionFeatureCatalog().then((result) => {
    if (result.error || !targetSystem) return result
    const allowed = new Set([targetSystem, 'both'])
    return {
      ...result,
      data: (result.data || []).filter((row) => allowed.has(row.target_system)),
    }
  })

export const fetchPaymentTransactions = (opts = {}) =>
  q(getPublicDb(), 'payment_transactions', 'id, amount, currency, status, payment_method, created_at, user_id, subscription_id', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchSubscriptionPayments = (subscriptionId) =>
  q(getPublicDb(), 'payment_transactions', '*', {
    filters: [{ op: 'eq', col: 'subscription_id', val: subscriptionId }],
    order: { column: 'created_at', asc: false },
  })

export const fetchRevenueSummary = async (dateFrom, dateTo) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  return db.rpc('get_revenue_summary', { p_date_from: dateFrom, p_date_to: dateTo })
}

export const fetchSubscriptionAdminSummary = async (targetSystem = 'platform') => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  return db.rpc('get_subscription_admin_summary', { p_target_system: targetSystem })
}

export const fetchSubscriptionById = (id, targetSystem = 'platform') =>
  fetchSubscriptionRecord(id, targetSystem)

export const fetchSubscriptionDetail = async (subscriptionId, targetSystem = 'platform') => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  return db.rpc('get_subscription_detail', {
    p_subscription_id: subscriptionId,
    p_target_system: targetSystem,
  })
}

export const fetchSystemSettings = () =>
  q(getAdminDb(), 'system_settings', 'id, setting_key, setting_value, setting_type, category, description, is_sensitive', { order: { column: 'category' } })

export const fetchSystemSettingsByCategory = (category) =>
  q(getAdminDb(), 'system_settings', 'id, setting_key, setting_value, setting_type, category, description, is_sensitive', {
    order: { column: 'setting_key' },
    filters: [{ op: 'eq', col: 'category', val: category }],
  })

export async function fetchPlatformMirrorMenuItems() {
  const db = getPublicDb()
  if (!db) return { data: [], error: null }
  const { data, error } = await db
    .from('menu_items')
    .select('id, menu_code, menu_label, route_path, menu_level, sort_order, methodology, is_active, is_visible')
    .eq('is_visible', true)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .order('sort_order')
    .limit(500)
  if (error) return { data: [], error }
  const rows = (data || []).filter((row) => !String(row.route_path || '').startsWith('/simulator'))
  return { data: rows, error: null }
}

export async function fetchSimulatorMirrorMenuItems() {
  const db = getPublicDb()
  if (!db) return { data: [], error: null }
  const { data, error } = await db
    .from('menu_items')
    .select('id, menu_code, menu_label, route_path, menu_level, sort_order, methodology, is_active, is_visible')
    .eq('is_visible', true)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .ilike('route_path', '/simulator%')
    .order('sort_order')
    .limit(500)
  if (error) return { data: [], error }
  return { data: data || [], error: null }
}

export const fetchFeatureFlags = (opts = {}) =>
  q(getAdminDb(), 'feature_flags', '*', {
    order: { column: 'flag_key' },
    filters: opts.appliesTo ? [{ op: 'eq', col: 'applies_to', val: opts.appliesTo }] : undefined,
  })

export const fetchMaintenanceWindows = () =>
  q(getAdminDb(), 'maintenance_windows', '*', { order: { column: 'scheduled_start', asc: false }, limit: 100 })

export const fetchSupportTickets = (opts = {}) =>
  q(getAdminDb(), 'support_tickets', 'id, subject, status, priority, category, created_at, assigned_to, user_id', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchTicketById = (id) =>
  q(getAdminDb(), 'support_tickets', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchTicketMessages = (ticketId) =>
  q(getAdminDb(), 'ticket_messages', '*', {
    filters: [{ op: 'eq', col: 'ticket_id', val: ticketId }],
    order: { column: 'created_at' },
  })

export const fetchAnnouncements = () =>
  q(getAdminDb(), 'announcements', 'id, title, body, status, announcement_type, target_audience, publish_at, expires_at, created_at', {
    order: { column: 'created_at', asc: false },
    limit: 200,
  })

export const fetchImpersonationLog = () =>
  q(getAdminDb(), 'impersonation_log', 'id, admin_user_id, target_user_id, impersonation_mode, target_system, reason, started_at, ended_at', {
    order: { column: 'started_at', asc: false },
    limit: 200,
  })

export const fetchErrorAggregations = (opts = {}) =>
  q(getAdminDb(), 'error_aggregations', 'id, error_hash, error_type, error_message, page_route, system, occurrence_count, affected_user_count, status, severity, last_seen_at, auto_ticket_id, resolution_notes', {
    order: { column: 'last_seen_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchErrorById = (id) =>
  q(getAdminDb(), 'error_aggregations', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchErrorAggregationByHash = (errorHash) =>
  q(getAdminDb(), 'error_aggregations', '*', { filters: [{ op: 'eq', col: 'error_hash', val: errorHash }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchErrorLogEntries = (errorHash) =>
  q(getAdminDb(), 'system_error_log', '*', {
    filters: [{ op: 'eq', col: 'error_hash', val: errorHash }],
    order: { column: 'created_at', asc: false },
    limit: 100,
  })

export const fetchLatestErrorLogEntry = (errorHash) =>
  q(getAdminDb(), 'system_error_log', '*', {
    filters: [{ op: 'eq', col: 'error_hash', val: errorHash }],
    order: { column: 'created_at', asc: false },
    limit: 1,
  }).then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchErrorAlertRules = () =>
  q(getAdminDb(), 'error_alert_rules', '*', { order: { column: 'rule_name' } })

export async function fetchErrorReadinessSummary() {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }

  const adminUserId = await getCurrentAdminUserId()
  if (!adminUserId) return { data: null, error: 'Not authenticated' }

  const [summaryRes, thresholdRes] = await Promise.all([
    db.rpc('get_error_readiness_summary', { p_admin_user_id: adminUserId }),
    q(db, 'system_settings', 'setting_value', {
      filters: [{ op: 'eq', col: 'setting_key', val: 'errors.release_gate_severity_threshold' }],
      limit: 1,
    }),
  ])

  if (summaryRes.error) {
    return { data: null, error: summaryRes.error.message || summaryRes.error }
  }

  const threshold = thresholdRes.data?.[0]?.setting_value || 'critical'
  const counts = countsToSeverityMap(summaryRes.data || [])
  const readiness = evaluateErrorReleaseReadiness(counts, threshold)

  return {
    data: {
      ...readiness,
      threshold,
      rows: summaryRes.data || [],
    },
    error: null,
  }
}

export const fetchAllProjects = (opts = {}) =>
  q(getPublicDb(), 'projects', 'id, project_name, status_id, priority, created_at, account_id, project_manager_user_id', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchUserProjects = (userId) =>
  q(getPublicDb(), 'projects', 'id, project_name, status_id, priority, created_at, account_id', {
    filters: [{ op: 'eq', col: 'project_manager_user_id', val: userId }],
    order: { column: 'created_at', asc: false },
  })

export const fetchSimScenarios = (opts = {}) =>
  q(getSimDb(), 'scenarios', 'id, name, description, difficulty_level, is_active, completions_count, average_score, created_at', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchSimScenarioById = (id) =>
  q(getSimDb(), 'scenarios', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchSimCertificates = () =>
  q(getSimDb(), 'certificates', 'id, certificate_name, certificate_type, user_id, is_verified, issue_date, score, created_at', {
    order: { column: 'created_at', asc: false },
    limit: 200,
  })

export const fetchSimLeaderboard = (opts = {}) =>
  q(getSimDb(), 'leaderboard_entries', 'id, user_id, score, rank, leaderboard_type, category, period_start, recorded_at', {
    order: { column: 'rank' },
    limit: opts.limit || 200,
    filters: opts.filters,
  })

async function querySimFirstAvailableTable(tableNames, opts = {}) {
  const db = getSimDb()
  if (!db) return { data: [], error: null }

  let lastError = null
  for (const table of tableNames) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .limit(opts.limit || 200)

    if (error) {
      // Table does not exist in this simulator schema; try the next candidate.
      if (error.code === '42P01' || /does not exist/i.test(error.message || '')) {
        continue
      }
      lastError = error
      continue
    }

    return { data: data || [], error: null }
  }

  if (lastError) return { data: [], error: lastError }
  return { data: [], error: null }
}

export const fetchSimLearningPaths = (opts = {}) =>
  querySimFirstAvailableTable(
    ['learning_paths', 'sim_learning_paths', 'scenario_learning_paths'],
    opts,
  )

export const fetchSimNPCs = (opts = {}) =>
  querySimFirstAvailableTable(
    ['npc_characters', 'npcs', 'npc_profiles', 'sim_npcs'],
    opts,
  )

export const fetchAuditLog = (opts = {}) =>
  q(getAdminDb(), 'admin_audit_log', 'id, action, admin_role, admin_user_id, target_type, target_id, target_details, previous_value, new_value, created_at', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchAuditLogForTarget = (targetType, targetId) =>
  q(getAdminDb(), 'admin_audit_log', '*', {
    filters: [
      { op: 'eq', col: 'target_type', val: targetType },
      { op: 'eq', col: 'target_id', val: targetId },
    ],
    order: { column: 'created_at', asc: false },
    limit: 50,
  })

export const fetchAuditLogById = (id) =>
  q(getAdminDb(), 'admin_audit_log', '*', {
    filters: [{ op: 'eq', col: 'id', val: id }],
    limit: 1,
  }).then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchAdminActivity = async (opts = {}) => {
  const db = getPublicDb()
  if (!db) return { data: [], error: null, count: 0 }

  const enhancedSelect = 'id, action_type, action_category, admin_user_id, target_type, target_name, metadata, created_at'
  const fallbackSelect = 'id, action_type, action_category, target_name, created_at'

  const run = async (selectClause) => {
    let query = db.from('admin_activity_log').select(selectClause, opts.count ? { count: 'exact' } : undefined)
    query = query.order('created_at', { ascending: false })
    if (opts.limit) query = query.limit(opts.limit)
    if (opts.range) query = query.range(opts.range.from, opts.range.to)
    if (opts.filters) {
      for (const f of opts.filters) {
        if (f.op === 'eq') query = query.eq(f.col, f.val)
        else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
        else if (f.op === 'gte') query = query.gte(f.col, f.val)
        else if (f.op === 'lte') query = query.lte(f.col, f.val)
        else if (f.op === 'in') query = query.in(f.col, f.val)
      }
    }
    return query
  }

  const enhanced = await run(enhancedSelect)
  if (!enhanced.error || enhanced.error.code !== '42703') return enhanced

  return run(fallbackSelect)
}

export const fetchAdminUsers = (opts = {}) =>
  q(getAdminDb(), 'admin_users', 'id, email, full_name, role, activation_status, requires_2fa, last_login_at, created_at', {
    order: { column: 'created_at', asc: false },
    filters: opts.filters,
    limit: opts.limit || 500,
  })

export const fetchAdminUserById = (id) =>
  q(getAdminDb(), 'admin_users', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchPendingActivations = () =>
  q(getAdminDb(), 'admin_users', 'id, email, full_name, role, activation_status, created_at, created_by', {
    filters: [{ op: 'eq', col: 'activation_status', val: 'pending_activation' }],
    order: { column: 'created_at', asc: false },
  })

export const fetchAdminInvitations = () =>
  q(getAdminDb(), 'admin_invitations', 'id, email, target_role, status, expires_at, created_at, invited_by', {
    order: { column: 'created_at', asc: false },
    filters: [{ op: 'eq', col: 'status', val: 'pending' }],
  })

export const fetchAdminSessions = (opts = {}) =>
  q(getAdminDb(), 'admin_sessions', 'id, admin_user_id, ip_address, user_agent, started_at, expires_at, is_active, ended_at', {
    order: { column: 'started_at', asc: false },
    filters: opts.activeOnly ? [{ op: 'eq', col: 'is_active', val: true }] : opts.filters,
    limit: opts.limit || 200,
  })

export const fetchRolePermissions = () =>
  q(getAdminDb(), 'role_permissions', 'role, permission_key', { order: { column: 'role' } })

export const fetchAdminPermissions = () =>
  q(getAdminDb(), 'admin_permissions', 'permission_key, permission_name, category', {
    order: { column: 'category' },
    filters: [{ op: 'eq', col: 'is_active', val: true }],
  })

const BUG_LIST_COLUMNS = 'id, title, description, status, priority, severity, reporter_id, assignee_id, steps_to_reproduce, expected_behavior, actual_behavior, page_url, browser_info, device_info, screenshot_url, resolution_notes, resolved_at, related_project_id, created_at, updated_at'

const FEATURE_LIST_COLUMNS = 'id, title, description, status, priority, category, user_id, vote_count, upvote_count, downvote_count, assigned_to, implementation_notes, estimated_effort, estimated_completion_date, created_at, updated_at'

export const fetchBugReports = (opts = {}) =>
  q(getPublicDb(), 'bugs', BUG_LIST_COLUMNS, {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 200,
    filters: opts.filters,
  })

export const fetchBugReportById = (id) =>
  q(getPublicDb(), 'bugs', BUG_LIST_COLUMNS, { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export async function fetchFeatureRequests(opts = {}) {
  const result = await q(getPublicDb(), 'feature_requests', FEATURE_LIST_COLUMNS, {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 200,
    filters: opts.filters,
  })
  if (result.data) {
    result.data = result.data.map((row) => ({ ...row, votes: row.vote_count ?? 0 }))
  }
  return result
}

export const fetchFeatureRequestById = async (id) => {
  const result = await q(getPublicDb(), 'feature_requests', FEATURE_LIST_COLUMNS, {
    filters: [{ op: 'eq', col: 'id', val: id }],
    limit: 1,
  })
  const row = result.data?.[0] ?? null
  return {
    data: row ? { ...row, votes: row.vote_count ?? 0 } : null,
    error: result.error,
  }
}

const USER_FEEDBACK_COLUMNS = 'id, user_id, feedback_type, feedback_text, rating, page_url, status, created_at, updated_at'

export const fetchUserFeedback = (opts = {}) =>
  q(getPublicDb(), 'user_feedback', USER_FEEDBACK_COLUMNS, {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 200,
    filters: opts.filters,
  })

const IMPROVEMENT_BACKLOG_COLUMNS = 'id, title, description, improvement_type, impact_score, effort_score, priority_score, status, source_type, related_bug_id, related_feature_request_id, related_feedback_id, planned_release, target_completion_date, improvement_notes, tags, created_at, updated_at'

export const fetchImprovementBacklog = (opts = {}) =>
  q(getPublicDb(), 'improvement_backlog', IMPROVEMENT_BACKLOG_COLUMNS, {
    order: { column: 'priority_score', asc: false },
    limit: opts.limit || 200,
    filters: opts.filters,
  })

export const fetchPricingChangeHistory = (opts = {}) =>
  q(getAdminDb(), 'pricing_change_history', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 200,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchPricingChangeById = (id) =>
  q(getAdminDb(), 'pricing_change_history', '*', {
    filters: [{ op: 'eq', col: 'id', val: id }],
    limit: 1,
  }).then((result) => ({
    ...result,
    data: result.data?.[0] || null,
  }))

export const fetchActiveUsersCount = async () => {
  const db = getPublicDb()
  if (!db) return { data: 0, error: null }
  const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true)
  return { data: count ?? 0, error }
}

// ─── Currency & Country Management ───────────────────────────────────────────

export const fetchCurrencies = (opts = {}) =>
  q(getAdminDb(), 'currencies', '*', {
    order: { column: 'sort_order', asc: true },
    filters: opts.activeOnly ? [{ op: 'eq', col: 'is_active', val: true }] : opts.filters,
    limit: opts.limit || 500,
  })

export const fetchActiveCurrencies = () => fetchCurrencies({ activeOnly: true })

export const fetchBaseCurrency = async () => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_base_currency')
  if (error) return { data: null, error: error.message || error }
  const row = Array.isArray(data) ? data[0] : data
  return { data: row ?? null, error: null }
}

export const fetchExchangeRates = (opts = {}) =>
  q(getAdminDb(), 'exchange_rates', '*', {
    order: { column: 'effective_from', asc: false },
    filters: opts.filters,
    limit: opts.limit || 500,
  })

export const fetchCurrentExchangeRates = async () => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_current_exchange_rates')
  return { data: data || [], error: error?.message || error || null }
}

export const fetchExchangeRateHistory = async (fromCurrency, toCurrency) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('list_exchange_rates', {
    p_from_currency: fromCurrency || null,
    p_to_currency: toCurrency || null,
    p_active_only: false,
  })
  return { data: data || [], error: error?.message || error || null }
}

export const fetchRevenueSummaryMultiCurrency = async (dateFrom, dateTo) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_revenue_summary_multi_currency', {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  })
  return { data: data || [], error: error?.message || error || null }
}

export const fetchCountries = (opts = {}) =>
  q(getAdminDb(), 'countries', '*', {
    order: { column: 'country_name', asc: true },
    filters: opts.activeOnly ? [{ op: 'eq', col: 'is_active', val: true }] : opts.filters,
    limit: opts.limit || 500,
  })

export const fetchActiveCountries = () => fetchCountries({ activeOnly: true })

export const fetchAllowedCountries = async (system) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_allowed_countries', { p_system: system })
  return { data: data || [], error: error?.message || error || null }
}

export const fetchIdGenerationRules = (opts = {}) =>
  q(getAdminDb(), 'id_generation_rules', '*', {
    order: { column: 'target_table' },
    limit: opts.limit || 1000,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchIdGenerationRuleById = (id) =>
  q(getAdminDb(), 'id_generation_rules', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchIdGenerationRuleByTargetTable = async (targetTable) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }

  const normalized = normalizeTargetTable(targetTable)
  if (!normalized) return { data: null, error: null }

  const { data: rpcData, error: rpcError } = await db.rpc(
    'resolve_id_generation_rule_by_target_table',
    { p_target_table: normalized },
  )

  if (!rpcError) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    if (row?.id) return { data: row, error: null }
  } else {
    const rpcMessage = rpcError?.message || String(rpcError)
    const rpcMissing = rpcMessage.includes('resolve_id_generation_rule_by_target_table')
      || rpcMessage.includes('Could not find the function')
    if (!rpcMissing) {
      return { data: null, error: rpcMessage }
    }
  }

  const candidates = targetTableLookupCandidates(normalized)
  const { data, error } = await q(getAdminDb(), 'id_generation_rules', '*', {
    filters: [{ op: 'in', col: 'target_table', val: candidates }],
    limit: 10,
  })

  if (error) return { data: null, error }

  const match = findIdGenerationRuleForTable(data, normalized)
  return { data: match, error: null }
}

export const fetchGeneratedIds = (opts = {}) =>
  q(getAdminDb(), 'generated_ids', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    range: opts.range,
    filters: opts.filters,
    count: opts.count,
  })

export const fetchAvailableTables = async () => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_available_tables')
  return { data: data || [], error: error?.message || error || null }
}

export const fetchIdGenerationRuleUsage = async () => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.from('v_id_generation_rule_usage').select('*')
  return { data: data || [], error: error?.message || error || null }
}

export const resolveIdGenerationRuleByAbbreviation = async (abbreviation) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('resolve_id_generation_rule_by_abbreviation', {
    p_table_abbreviation: abbreviation,
  })
  const row = Array.isArray(data) ? data[0] : data
  return { data: row ?? null, error: error?.message || error || null }
}

export const previewIdGenerationCapacity = async (form) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const generationMode = form.generation_mode ?? 'random'
  const isSequential = generationMode === 'sequential'
  const { data, error } = await db.rpc('preview_id_generation_capacity', {
    p_target_table: form.target_table,
    p_num_letters: isSequential ? 0 : (form.num_letters ?? 0),
    p_num_digits: form.num_digits ?? 0,
    p_letter_case: form.letter_case ?? 'uppercase',
    p_excluded_chars: isSequential ? '' : (form.excluded_chars ?? ''),
    p_segment_type: isSequential ? 'numeric' : (form.segment_type ?? 'alphanumeric'),
    p_generation_mode: generationMode,
    p_include_date: Boolean(form.include_date),
    p_scope_column: isSequential ? (form.scope_column || null) : null,
  })
  const row = Array.isArray(data) ? data[0] : data
  return { data: row ?? null, error: error?.message || error || null }
}

export const fetchScopableColumns = async (targetTable) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  if (!targetTable) return { data: [], error: null }

  const { data, error } = await db.rpc('get_scopable_columns', {
    p_target_table: targetTable,
  })

  return {
    data: (data || []).map((row) => row.column_name || row).filter(Boolean),
    error: error?.message || error || null,
  }
}

// ─── Notifications & Alerts ──────────────────────────────────────────────────

export const fetchNotificationTemplates = (opts = {}) =>
  q(getAdminDb(), 'notification_templates', '*', {
    order: { column: 'template_name' },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchAlertRules = (opts = {}) =>
  q(getAdminDb(), 'alert_rules', '*', {
    order: { column: 'rule_name' },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchNotifications = (opts = {}) =>
  q(getAdminDb(), 'notifications', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchUnreadNotifications = async (limit = 20) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_unread_notifications', { p_limit: limit })
  return { data: data || [], error: error?.message || error || null }
}

export const fetchNotificationCount = async () => {
  const db = getAdminDb()
  if (!db) return { data: 0, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_notification_count')
  return { data: data ?? 0, error: error?.message || error || null }
}

// ─── Email Templates ───────────────────────────────────────────────────────────

export const fetchEmailTemplates = async (opts = {}) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('list_email_templates', {
    p_active_only: opts.activeOnly ?? false,
    p_category: opts.category || null,
    p_target_system: opts.targetSystem || null,
  })
  return { data: data || [], error: error?.message || error || null }
}

export const fetchEmailTemplateById = (id) =>
  q(getAdminDb(), 'email_templates', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchEmailSendLog = (opts = {}) =>
  q(getAdminDb(), 'email_send_log', '*', {
    order: { column: 'sent_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

// ─── API Keys & Webhooks ───────────────────────────────────────────────────────

export const fetchApiKeys = (opts = {}) =>
  q(getAdminDb(), 'api_keys', 'id, key_name, key_prefix, permissions, target_system, is_active, last_used_at, expires_at, rate_limit_per_minute, created_at', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchWebhooks = (opts = {}) =>
  q(getAdminDb(), 'webhooks', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchWebhookDeliveryLog = async (opts = {}) => {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('list_webhook_delivery_logs', {
    p_webhook_id: opts.webhookId || null,
    p_limit: opts.limit || 200,
  })
  return { data: data || [], error: error?.message || error || null }
}

// ─── Reports ───────────────────────────────────────────────────────────────────

export const fetchReportDefinitions = (opts = {}) =>
  q(getAdminDb(), 'report_definitions', '*', {
    order: { column: 'report_name' },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchScheduledReports = (opts = {}) =>
  q(getAdminDb(), 'scheduled_reports', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchReportRuns = (opts = {}) =>
  q(getAdminDb(), 'report_runs', '*', {
    order: { column: 'started_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchReportRun = async (runId) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_report_run', { p_run_id: runId })
  const row = Array.isArray(data) ? data[0] : data
  return { data: row ?? null, error: error?.message || error || null }
}

// ─── Billing ───────────────────────────────────────────────────────────────────

export const fetchInvoices = (opts = {}) =>
  q(getAdminDb(), 'invoices', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchTaxRates = (opts = {}) =>
  q(getAdminDb(), 'tax_rates', '*', {
    order: { column: 'country_code' },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchRefunds = (opts = {}) =>
  q(getAdminDb(), 'refunds', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchRefundById = (refundId) =>
  q(getAdminDb(), 'refunds', '*', { filters: [{ op: 'eq', col: 'id', val: refundId }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

// ─── Localization ──────────────────────────────────────────────────────────────

export const fetchSupportedLanguages = (opts = {}) =>
  q(getAdminDb(), 'supported_languages', '*', {
    order: { column: 'language_name' },
    limit: opts.limit || 500,
    filters: opts.filters,
  })

export const fetchTranslationKeys = (opts = {}) =>
  q(getAdminDb(), 'translation_keys', '*', {
    order: { column: 'translation_key' },
    limit: opts.limit || 1000,
    filters: opts.filters,
  })

export const fetchTranslations = (opts = {}) =>
  q(getAdminDb(), 'translations', '*', {
    order: { column: 'updated_at', asc: false },
    limit: opts.limit || 2000,
    filters: opts.filters,
  })

export const fetchTranslationCoverage = async (languageCode) => {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_translation_coverage', { p_language_code: languageCode })
  const row = Array.isArray(data) ? data[0] : data
  return { data: row ?? null, error: error?.message || error || null }
}
