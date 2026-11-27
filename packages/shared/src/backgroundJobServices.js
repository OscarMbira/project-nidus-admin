/**
 * Admin plan v219 (monorepo v1352 Slice 0, D3 / D4 / A1) — Background Jobs. Every call goes through the
 * public.admin_background_job_* RPCs (Admin SQL v255; permissions system.background_jobs.view / .run / .edit;
 * actions need a reason and are audited). The acting admin comes from the session — no admin id is sent.
 */
import { getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

/** Display labels for the catalogue's fixed check-constraint values (monorepo SQL v1559). */
export const BACKGROUND_JOB_KIND_LABELS = { sql: 'Database function', handler: 'Worker (queue)' }
export const BACKGROUND_JOB_OWNER_LABELS = {
  platform: 'Platform', simulator: 'Simulator', planner: 'Planner', admin: 'Admin', system: 'Framework',
}
export const BACKGROUND_JOB_TRIGGER_LABELS = {
  schedule: 'Schedule', retry: 'Retry', manual: 'Run now', rerun: 'Re-run', worker: 'Worker',
}

export const fetchBackgroundJobs = async () => {
  const { data, error } = await rpc('admin_background_job_list')
  return { data: data || { jobs: [], settings: null, worker_configured: false }, error }
}

export const fetchBackgroundJobDetail = async (jobCode, limit = 100) => {
  const { data, error } = await rpc('admin_background_job_runs', { p_job_code: jobCode, p_limit: limit })
  return { data: data || null, error }
}

export const setBackgroundJobEnabled = (jobCode, enabled, reason) =>
  rpc('admin_background_job_set_enabled', { p_job_code: jobCode, p_enabled: enabled, p_reason: reason })

export const runBackgroundJobNow = (jobCode, reason) =>
  rpc('admin_background_job_run_now', { p_job_code: jobCode, p_reason: reason })

export const rerunBackgroundJobRun = (runId, reason) =>
  rpc('admin_background_job_rerun', { p_run_id: runId, p_reason: reason })

export const replayBackgroundJobItem = (itemId, reason) =>
  rpc('admin_background_job_replay_item', { p_item_id: itemId, p_reason: reason })

/** Default list order (Admin rule 12.1): name A→Z (case-insensitive), then created_at oldest first. */
export function sortBackgroundJobsDefault(jobs = []) {
  return [...jobs].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    || String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

/**
 * Human wording for the common cron shapes; anything else is shown as written. Times are UTC. A database job
 * with no schedule is a manual job (v1352 Slice 3: back-fill, re-index).
 */
export function describeCron(cron, timeBasis = 'utc', kind = null) {
  if (!cron) return kind === 'sql' ? 'Only when run by hand' : 'When work is queued'
  const zone = timeBasis === 'organisation' ? 'organisation time' : 'UTC'
  const parts = String(cron).trim().split(/\s+/)
  if (parts.length !== 5) return cron
  const [min, hour, dom, mon, dow] = parts
  const pad = (n) => String(n).padStart(2, '0')
  const num = (v) => /^\d+$/.test(v)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  if (parts.every((p) => p === '*')) return 'Every minute'
  if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every ${min.slice(2)} minutes`
  if (num(min) && /^\*\/\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${hour.slice(2)} hours at minute ${min}`
  }
  if (num(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') return `Every hour at minute ${min}`
  if (num(min) && num(hour) && mon === '*') {
    const at = `${pad(hour)}:${pad(min)} ${zone}`
    if (dom === '*' && dow === '*') return `Daily at ${at}`
    if (dom === '*' && num(dow)) return `Every ${days[Number(dow)]} at ${at}`
    if (num(dom) && dow === '*') return `Monthly on day ${dom} at ${at}`
  }
  return `${cron} (${zone})`
}

export function formatJobDuration(ms) {
  if (ms === null || ms === undefined || ms === '') return '—'
  const n = Number(ms)
  if (!Number.isFinite(n)) return '—'
  if (n < 1000) return `${n} ms`
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`
  return `${Math.floor(n / 60_000)} min ${Math.round((n % 60_000) / 1000)} s`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Admin's fixed date style (Admin rule 24: D MMM YYYY, 24-hour), in UTC like the job schedules. */
export function formatJobTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** Minutes since the tick last ran, or null when it has never run. */
export function minutesSinceTick(lastTickAt, now = Date.now()) {
  if (!lastTickAt) return null
  const t = new Date(lastTickAt).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / 60_000))
}

// ── v1352 Slice 3 — housekeeping settings (Admin SQL v262; permission system.background_jobs.view / .edit) ──

export const KEEP_DAYS_MIN = 7
export const KEEP_DAYS_MAX = 3650

export const fetchBackgroundJobHousekeeping = async () => {
  const { data, error } = await rpc('admin_background_job_housekeeping')
  return { data: data || { run_history: null, retention_targets: [], storage_buckets: [] }, error }
}

export const setRunHistoryRetention = (successDays, failureDays, reason) =>
  rpc('admin_background_job_set_run_history_retention', {
    p_success_days: Number(successDays), p_failure_days: Number(failureDays), p_reason: reason,
  })

export const setRetentionTarget = (schema, table, retainDays, isActive, reason) =>
  rpc('admin_background_job_set_retention_target', {
    p_table_schema: schema, p_table_name: table, p_retain_days: Number(retainDays), p_is_active: Boolean(isActive), p_reason: reason,
  })

export const setStorageCleanupBucket = (bucketId, minAgeDays, deleteEnabled, isActive, reason) =>
  rpc('admin_background_job_set_storage_bucket', {
    p_bucket_id: bucketId, p_min_age_days: Number(minAgeDays), p_delete_enabled: Boolean(deleteEnabled),
    p_is_active: Boolean(isActive), p_reason: reason,
  })

/** A whole number of days in the range the RPCs accept. */
export function isValidKeepDays(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return false
  const n = Number(text)
  return n >= KEEP_DAYS_MIN && n <= KEEP_DAYS_MAX
}

/** Error text for the run-history form, or null when it can be saved. */
export function validateRunHistoryRetention(successDays, failureDays) {
  if (!isValidKeepDays(successDays) || !isValidKeepDays(failureDays)) {
    return `Enter whole days from ${KEEP_DAYS_MIN} to ${KEEP_DAYS_MAX}.`
  }
  if (Number(failureDays) < Number(successDays)) return 'Keep failed runs at least as long as successful runs.'
  return null
}

export function describeStatusFilter(column, values) {
  if (!column) return 'All rows'
  return `${column}: ${(values || []).join(', ')}`
}

/** Default list order (Admin rule 12.1): label A→Z (case-insensitive), then created_at oldest first. */
export function sortByLabelThenCreated(rows = [], label = (r) => r.name) {
  return [...rows].sort((a, b) =>
    String(label(a) || '').localeCompare(String(label(b) || ''), undefined, { sensitivity: 'base' })
    || String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

/**
 * The record and its editable values for a housekeeping edit route: kind 'run-history', 'retention'
 * (key = schema.table) or 'storage' (key = bucket id). Null when it is not in the data.
 */
export function pickHousekeepingRecord(kind, key, data) {
  if (kind === 'run-history') {
    const r = data?.run_history
    return r ? { record: r, form: { success: String(r.success_retention_days), failure: String(r.failure_retention_days) } } : null
  }
  if (kind === 'retention') {
    const r = (data?.retention_targets || []).find((t) => t.target_key === key)
    return r ? { record: r, form: { days: String(r.retain_days), active: r.is_active ? 'on' : 'off' } } : null
  }
  if (kind === 'storage') {
    const r = (data?.storage_buckets || []).find((b) => b.bucket_id === key)
    return r ? {
      record: r,
      form: { days: String(r.min_age_days), deletion: r.delete_enabled ? 'on' : 'off', active: r.is_active ? 'on' : 'off' },
    } : null
  }
  return null
}
