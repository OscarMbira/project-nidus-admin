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

/** Human wording for the common cron shapes; anything else is shown as written. Times are UTC. */
export function describeCron(cron, timeBasis = 'utc') {
  if (!cron) return 'When work is queued'
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
