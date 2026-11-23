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
