// Background Jobs (monorepo v1352 Slice 0) — Admin service calls and pure helpers.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc }) }))
import {
  describeCron,
  fetchBackgroundJobDetail,
  fetchBackgroundJobs,
  formatJobDuration,
  formatJobTime,
  minutesSinceTick,
  replayBackgroundJobItem,
  rerunBackgroundJobRun,
  runBackgroundJobNow,
  setBackgroundJobEnabled,
  sortBackgroundJobsDefault,
} from '../backgroundJobServices.js'

beforeEach(() => rpc.mockReset())

describe('background job RPC calls', () => {
  it('lists jobs and falls back to an empty shape', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const { data } = await fetchBackgroundJobs()
    expect(rpc).toHaveBeenCalledWith('admin_background_job_list', {})
    expect(data).toEqual({ jobs: [], settings: null, worker_configured: false })
  })

  it('sends the reason with every action and never an admin id', async () => {
    rpc.mockResolvedValue({ data: { status: 'requested' }, error: null })
    await setBackgroundJobEnabled('trial.expiry_check', false, 'Pause for the owner check')
    await runBackgroundJobNow('trial.expiry_check', 'Check after the move')
    await rerunBackgroundJobRun('run-1', 'Cause fixed')
    await replayBackgroundJobItem('item-1', 'Endpoint fixed')
    expect(rpc.mock.calls).toEqual([
      ['admin_background_job_set_enabled', { p_job_code: 'trial.expiry_check', p_enabled: false, p_reason: 'Pause for the owner check' }],
      ['admin_background_job_run_now', { p_job_code: 'trial.expiry_check', p_reason: 'Check after the move' }],
      ['admin_background_job_rerun', { p_run_id: 'run-1', p_reason: 'Cause fixed' }],
      ['admin_background_job_replay_item', { p_item_id: 'item-1', p_reason: 'Endpoint fixed' }],
    ])
  })

  it('returns the error message text', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Permission denied: system.background_jobs.view required' } })
    const { data, error } = await fetchBackgroundJobDetail('ai.embed')
    expect(rpc).toHaveBeenCalledWith('admin_background_job_runs', { p_job_code: 'ai.embed', p_limit: 100 })
    expect(data).toBeNull()
    expect(error).toMatch(/Permission denied/)
  })
})

describe('background job helpers', () => {
  it('sorts by name A→Z, then oldest first', () => {
    const rows = [
      { name: 'trial expiry', created_at: '2026-11-02' },
      { name: 'AI embed', created_at: '2026-11-03' },
      { name: 'ai embed', created_at: '2026-11-01' },
    ]
    expect(sortBackgroundJobsDefault(rows).map((r) => `${r.name}|${r.created_at}`)).toEqual([
      'ai embed|2026-11-01', 'AI embed|2026-11-03', 'trial expiry|2026-11-02',
    ])
  })

  it('describes common schedules', () => {
    expect(describeCron(null)).toBe('When work is queued')
    expect(describeCron('* * * * *')).toBe('Every minute')
    expect(describeCron('*/2 * * * *')).toBe('Every 2 minutes')
    expect(describeCron('0 */6 * * *')).toBe('Every 6 hours at minute 0')
    expect(describeCron('30 2 * * *')).toBe('Daily at 02:30 UTC')
    expect(describeCron('0 9 * * 1', 'organisation')).toBe('Every Monday at 09:00 organisation time')
    expect(describeCron('0 0 1 * *')).toBe('Monthly on day 1 at 00:00 UTC')
    expect(describeCron('5 1-3 * * *')).toBe('5 1-3 * * * (UTC)')
  })

  it('formats times in Admin style, UTC', () => {
    expect(formatJobTime(null)).toBe('—')
    expect(formatJobTime('2026-11-23T05:07:00Z')).toBe('23 Nov 2026 05:07 UTC')
  })

  it('formats durations and tick age', () => {
    expect(formatJobDuration(null)).toBe('—')
    expect(formatJobDuration(250)).toBe('250 ms')
    expect(formatJobDuration(12_300)).toBe('12.3 s')
    expect(formatJobDuration(125_000)).toBe('2 min 5 s')
    expect(minutesSinceTick(null)).toBeNull()
    expect(minutesSinceTick('2026-11-23T10:00:00Z', Date.parse('2026-11-23T10:07:30Z'))).toBe(7)
  })
})

// v1352 Slice 3 — housekeeping settings (Admin SQL v262)
import {
  describeStatusFilter,
  fetchBackgroundJobHousekeeping,
  isValidKeepDays,
  setRetentionTarget,
  setRunHistoryRetention,
  setStorageCleanupBucket,
  sortByLabelThenCreated,
  validateRunHistoryRetention,
} from '../backgroundJobServices.js'

describe('background job housekeeping', () => {
  it('reads the housekeeping settings and falls back to an empty shape', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    const { data } = await fetchBackgroundJobHousekeeping()
    expect(rpc).toHaveBeenCalledWith('admin_background_job_housekeeping', {})
    expect(data).toEqual({ run_history: null, retention_targets: [], storage_buckets: [] })
  })

  it('sends numbers, switches and the reason, never an admin id', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    await setRunHistoryRetention('120', '400', 'Longer history')
    await setRetentionTarget('public', 'email_logs', '200', false, 'Pause')
    await setStorageCleanupBucket('risk-attachments', '45', true, true, 'Counts checked')
    expect(rpc.mock.calls).toEqual([
      ['admin_background_job_set_run_history_retention', { p_success_days: 120, p_failure_days: 400, p_reason: 'Longer history' }],
      ['admin_background_job_set_retention_target', {
        p_table_schema: 'public', p_table_name: 'email_logs', p_retain_days: 200, p_is_active: false, p_reason: 'Pause',
      }],
      ['admin_background_job_set_storage_bucket', {
        p_bucket_id: 'risk-attachments', p_min_age_days: 45, p_delete_enabled: true, p_is_active: true, p_reason: 'Counts checked',
      }],
    ])
  })

  it('validates keep periods', () => {
    expect(isValidKeepDays('90')).toBe(true)
    expect(isValidKeepDays(7)).toBe(true)
    expect(isValidKeepDays(3650)).toBe(true)
    expect(isValidKeepDays('6')).toBe(false)
    expect(isValidKeepDays('12.5')).toBe(false)
    expect(isValidKeepDays('')).toBe(false)
    expect(validateRunHistoryRetention('90', '365')).toBeNull()
    expect(validateRunHistoryRetention('400', '365')).toMatch(/at least as long/)
    expect(validateRunHistoryRetention('2', '365')).toMatch(/7 to 3650/)
  })

  it('describes a status filter and sorts by label then created', () => {
    expect(describeStatusFilter(null, null)).toBe('All rows')
    expect(describeStatusFilter('is_read', ['true'])).toBe('is_read: true')
    expect(describeStatusFilter('status', ['succeeded', 'skipped'])).toBe('status: succeeded, skipped')
    const rows = [
      { key: 'sim.b', created_at: '2026-11-02' },
      { key: 'public.a', created_at: '2026-11-03' },
      { key: 'Public.a', created_at: '2026-11-01' },
    ]
    expect(sortByLabelThenCreated(rows, (r) => r.key).map((r) => r.created_at)).toEqual(['2026-11-01', '2026-11-03', '2026-11-02'])
  })

  it('describes manual database jobs', () => {
    expect(describeCron(null, 'utc', 'sql')).toBe('Only when run by hand')
    expect(describeCron(null, 'utc', 'handler')).toBe('When work is queued')
  })
})

import { pickHousekeepingRecord } from '../backgroundJobServices.js'

describe('housekeeping edit pages', () => {
  const data = {
    run_history: { success_retention_days: 90, failure_retention_days: 365 },
    retention_targets: [{ target_key: 'public.email_logs', retain_days: 365, is_active: true }],
    storage_buckets: [{ bucket_id: 'risk-attachments', min_age_days: 30, delete_enabled: false, is_active: true }],
  }

  it('picks the record and its form values for each kind', () => {
    expect(pickHousekeepingRecord('run-history', '', data).form).toEqual({ success: '90', failure: '365' })
    expect(pickHousekeepingRecord('retention', 'public.email_logs', data).form).toEqual({ days: '365', active: 'on' })
    expect(pickHousekeepingRecord('storage', 'risk-attachments', data).form).toEqual({ days: '30', deletion: 'off', active: 'on' })
  })

  it('returns null for an unknown key or kind', () => {
    expect(pickHousekeepingRecord('retention', 'public.nope', data)).toBeNull()
    expect(pickHousekeepingRecord('storage', 'nope', data)).toBeNull()
    expect(pickHousekeepingRecord('other', 'x', data)).toBeNull()
    expect(pickHousekeepingRecord('run-history', '', {})).toBeNull()
  })
})
