import { getAdminDb, getPublicDb } from './supabase.js'

export const LIFECYCLE_REVIEW_FIELDS = {
  subscription_plans: [
    { key: 'plan_name', label: 'Plan Name' },
    { key: 'plan_type', label: 'Plan Type' },
    { key: 'billing_cycle', label: 'Billing Cycle' },
    { key: 'catalog_scope', label: 'System' },
    { key: 'price', label: 'Price' },
    { key: 'original_price', label: 'Original Price' },
    { key: 'currency', label: 'Currency' },
    { key: 'display_order', label: 'Display Order' },
    { key: 'member_limit', label: 'Member Limit' },
    { key: 'project_limit', label: 'Project Limit' },
    { key: 'additional_member_price', label: 'Extra Member Price' },
    { key: 'features', label: 'Features', type: 'json' },
    { key: 'platform_included', label: 'Platform Included', type: 'boolean' },
    { key: 'simulator_included', label: 'Simulator Included', type: 'boolean' },
    { key: 'is_popular', label: 'Popular', type: 'boolean' },
    { key: 'is_active', label: 'Active', type: 'boolean' },
    { key: 'record_status', label: 'Record Status' },
  ],
  affiliates: [
    { key: 'code', label: 'Referral Code' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'website', label: 'Website' },
    { key: 'target_system', label: 'Target System' },
    { key: 'commission_rate_pct', label: 'Commission Rate %' },
    { key: 'status', label: 'Status' },
    { key: 'payout_method', label: 'Payout Method' },
    { key: 'application_notes', label: 'Internal Notes' },
  ],
  payment_gateways: [
    { key: 'display_name', label: 'Display Name' },
    { key: 'name', label: 'Gateway Name' },
    { key: 'provider_key', label: 'Provider' },
    { key: 'environment', label: 'Environment' },
    { key: 'is_active', label: 'Active', type: 'boolean' },
    { key: 'is_default', label: 'Default', type: 'boolean' },
    { key: 'notes', label: 'Notes' },
  ],
  cancellation_reason_categories: [
    { key: 'code', label: 'Code' },
    { key: 'label', label: 'Label' },
    { key: 'description', label: 'Description' },
    { key: 'sort_order', label: 'Sort Order' },
    { key: 'is_active', label: 'Active', type: 'boolean' },
  ],
  global_template_library: [
    { key: 'name', label: 'Name' },
    { key: 'domain', label: 'Domain' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    { key: 'payload', label: 'Fields payload', type: 'json' },
    { key: 'record_version', label: 'Version' },
    { key: 'record_status', label: 'Record Status' },
  ],
}

const ADMIN_RECORD_TABLES = {
  affiliates: 'affiliates',
  payment_gateways: 'payment_gateways',
  cancellation_reason_categories: 'cancellation_reason_categories',
  global_template_library: 'global_template_library',
}

function reviewValuesEqual(current, next) {
  if (current === next) return true
  if (current == null && next == null) return true
  if (typeof current === 'object' || typeof next === 'object') {
    return JSON.stringify(current) === JSON.stringify(next)
  }
  return String(current) === String(next)
}

export function formatReviewValue(value, fieldDef = {}) {
  if (value == null || value === '') return '—'
  if (fieldDef.type === 'boolean') return value ? 'Yes' : 'No'
  if (fieldDef.type === 'json' || typeof value === 'object') {
    const text = typeof value === 'string'
      ? value
      : JSON.stringify(value, null, 2)
    return text.length > 600 ? `${text.slice(0, 600)}…` : text
  }
  return String(value)
}

export function buildReviewFieldRows(tableName, record, pending, queueDiff = null) {
  const fieldDefs = LIFECYCLE_REVIEW_FIELDS[tableName] || []
  const proposed = pending?.proposed_changes && typeof pending.proposed_changes === 'object'
    ? pending.proposed_changes
    : (queueDiff?.new_changes && typeof queueDiff.new_changes === 'object'
      ? queueDiff.new_changes
      : {})
  const approvedBaseline = queueDiff?.original_changes && typeof queueDiff.original_changes === 'object'
    ? queueDiff.original_changes
    : null

  return fieldDefs.map((fieldDef) => {
    const current = approvedBaseline && Object.prototype.hasOwnProperty.call(approvedBaseline, fieldDef.key)
      ? approvedBaseline[fieldDef.key]
      : (record?.[fieldDef.key] ?? null)
    const afterApproval = Object.prototype.hasOwnProperty.call(proposed, fieldDef.key)
      ? proposed[fieldDef.key]
      : current

    return {
      key: fieldDef.key,
      label: fieldDef.label,
      current,
      afterApproval,
      changed: !reviewValuesEqual(current, afterApproval),
      currentDisplay: formatReviewValue(current, fieldDef),
      afterApprovalDisplay: formatReviewValue(afterApproval, fieldDef),
    }
  })
}

async function fetchRecordRow(tableName, recordId) {
  if (!recordId) return { data: null, error: 'Record id required' }

  if (tableName === 'subscription_plans') {
    const publicDb = getPublicDb()
    if (!publicDb) return { data: null, error: 'Database not configured' }
    const { data, error } = await publicDb
      .from('subscription_plans')
      .select('*')
      .eq('id', recordId)
      .maybeSingle()
    return { data, error: error?.message || null }
  }

  const adminTable = ADMIN_RECORD_TABLES[tableName]
  if (!adminTable) return { data: null, error: `Unsupported table: ${tableName}` }

  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db
    .from(adminTable)
    .select('*')
    .eq('id', recordId)
    .maybeSingle()
  return { data, error: error?.message || null }
}

export async function fetchLifecycleRecordForReview(tableName, recordId) {
  const db = getAdminDb()
  const pendingPromise = db
    ? db
      .from('record_pending_changes')
      .select('proposed_changes, submitted_at, submission_batch_id, previous_status')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const [recordRes, pendingRes] = await Promise.all([
    fetchRecordRow(tableName, recordId),
    pendingPromise,
  ])

  if (recordRes.error) {
    return { record: null, pending: pendingRes.data, error: recordRes.error }
  }

  return {
    record: recordRes.data,
    pending: pendingRes.data,
    error: null,
  }
}
