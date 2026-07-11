import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const clean = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) clean[key] = value
  }
  const { data, error } = await db.rpc(fn, clean)
  return { data, error: error?.message || error || null }
}

async function q(table, select, opts = {}) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  let query = db.from(table).select(select)
  if (opts.order) query = query.order(opts.order.column, { ascending: opts.order.asc ?? true })
  if (opts.range) {
    query = query.range(opts.range.from, opts.range.to)
  }
  const { data, error } = await query
  return { data: data || [], error: error?.message || error || null }
}

async function attachAdminEmails(rows, idKey = 'triggered_by', emailKey = 'triggered_by_email') {
  if (!rows?.length) return rows
  const db = getAdminDb()
  if (!db) return rows
  const ids = [...new Set(rows.map((row) => row[idKey]).filter(Boolean))]
  if (!ids.length) {
    return rows.map((row) => ({ ...row, [emailKey]: null }))
  }
  const { data: admins } = await db.from('admin_users').select('id, email').in('id', ids)
  const emailById = Object.fromEntries((admins || []).map((admin) => [admin.id, admin.email]))
  return rows.map((row) => ({
    ...row,
    [emailKey]: row[idKey] ? emailById[row[idKey]] ?? null : null,
  }))
}

export async function fetchCurrentBusinessDate() {
  return rpc('get_current_business_date')
}

export async function fetchBusinessCalendar(startDate, endDate) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db
    .from('business_calendar')
    .select('*')
    .gte('calendar_date', startDate)
    .lte('calendar_date', endDate)
    .order('calendar_date')
  return { data: data || [], error: error?.message || error || null }
}

export async function upsertCalendarEntry(date, dayType, holidayName, countryCode = 'ZA') {
  return rpc('upsert_calendar_entry', {
    p_calendar_date: date,
    p_day_type: dayType,
    p_holiday_name: holidayName || undefined,
    p_country_code: countryCode,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteCalendarEntry(date) {
  return rpc('delete_calendar_entry', {
    p_calendar_date: date,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function fetchCobProcesses() {
  return q('cob_processes', '*', { order: { column: 'process_order' } })
}

export async function updateCobProcess(processId, updates) {
  return rpc('update_cob_process', {
    p_process_id: processId,
    p_process_name: updates.process_name,
    p_description: updates.description,
    p_process_order: updates.process_order,
    p_is_active: updates.is_active,
    p_target_system: updates.target_system,
    p_parameters: updates.parameters,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function fetchCobRuns(opts = {}) {
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  const { data, error } = await q('cob_runs', '*', {
    order: { column: 'created_at', asc: false },
    range: { from: offset, to: offset + limit - 1 },
  })
  if (error) return { data: [], error }
  const rows = await attachAdminEmails(data)
  return { data: rows, error: null }
}

export async function fetchCobRunDetail(runId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }

  const { data: run, error: runError } = await db
    .from('cob_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()

  if (runError) return { data: null, error: runError.message || String(runError) }
  if (!run) return { data: null, error: 'COB run not found' }

  const { data: steps, error: stepsError } = await db
    .from('cob_run_steps')
    .select('*, cob_processes(process_key)')
    .eq('cob_run_id', runId)
    .order('step_order')

  if (stepsError) return { data: null, error: stepsError.message || String(stepsError) }

  const normalizedSteps = (steps || []).map((step) => ({
    ...step,
    process_key: step.cob_processes?.process_key ?? null,
    cob_processes: undefined,
  }))

  const [enriched] = await attachAdminEmails([run])
  return {
    data: {
      ...enriched,
      steps: normalizedSteps,
    },
    error: null,
  }
}

export async function startCobRun(businessDate, triggerType = 'manual') {
  const params = {
    p_trigger_type: triggerType,
    p_admin_user_id: await getCurrentAdminUserId(),
  }
  if (businessDate) params.p_business_date = businessDate
  return rpc('start_cob_run', params)
}

export async function executeCobStep(runId, stepId) {
  return rpc('execute_cob_step', {
    p_run_id: runId,
    p_step_id: stepId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelCobRun(runId) {
  return rpc('cancel_cob_run', {
    p_run_id: runId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function advanceBusinessDate() {
  return rpc('advance_business_date', {
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}
