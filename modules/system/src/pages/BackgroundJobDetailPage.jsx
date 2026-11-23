/**
 * Admin plan v219 (monorepo v1352 Slice 0, D3 / A1) — one background job: details, run history, waiting
 * and failed work items, and the Audit tab (Admin rules 16.1, 18). Routed page /system/background-jobs/:code.
 * Run now, re-run, turn on / off and replay ask for a reason in a confirm dialog and are audited (SQL v255).
 * Database jobs started with Run now begin at the next scheduler minute; worker jobs are queued at once.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  BACKGROUND_JOB_KIND_LABELS,
  BACKGROUND_JOB_OWNER_LABELS,
  BACKGROUND_JOB_TRIGGER_LABELS,
  describeCron,
  fetchBackgroundJobDetail,
  formatJobDuration,
  formatJobTime,
  replayBackgroundJobItem,
  rerunBackgroundJobRun,
  runBackgroundJobNow,
  setBackgroundJobEnabled,
  useCurrentAdmin,
} from '@nidus-admin/shared'
import {
  AdminFieldLabelWithHelp,
  AdminTable,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { JobStatusPill } from './backgroundJobUi.jsx'

const TABS = [
  { value: 'details', label: 'Details' },
  { value: 'runs', label: 'Run history' },
  { value: 'items', label: 'Work items' },
  { value: 'audit', label: 'Audit details' },
]

function Fact({ helpKey, label, children }) {
  return (
    <div>
      <AdminFieldLabelWithHelp as="dt" helpKey={helpKey} className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</AdminFieldLabelWithHelp>
      <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  )
}

const buttonClass = 'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'

export default function BackgroundJobDetailPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useCurrentAdmin()
  const canRun = hasPermission('system.background_jobs.run')
  const canEdit = hasPermission('system.background_jobs.edit')
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [tab, setTab] = useState('details')
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetchBackgroundJobDetail(code)
    setDetail(res.data)
    setError(res.error)
    setLoading(false)
  }, [code])

  useEffect(() => { load() }, [load])

  const act = async (call, success) => {
    const { data, error: err } = await call()
    if (err) { showError(err); return }
    showSuccess(typeof success === 'function' ? success(data) : success)
    await load()
  }

  const job = detail?.job
  const runs = detail?.runs || []
  const items = detail?.queue_items || []

  const runNow = () => confirm({
    title: `Run "${job.name}" now?`,
    message: job.kind === 'sql'
      ? 'The job starts at the next scheduler minute. Its result appears in Run history.'
      : 'One work item is queued and the worker is woken now.',
    confirmLabel: 'Run now',
    requireReason: true,
    reasonLabel: 'Reason for running now (required)',
    onConfirm: (reason) => act(() => runBackgroundJobNow(job.code, reason),
      (d) => (d?.status === 'requested' ? `Run of ${job.code} requested — it starts within a minute.` : `Run of ${job.code} queued.`)),
  })

  const toggle = () => confirm({
    title: job.enabled ? `Turn off "${job.name}"?` : `Turn on "${job.name}"?`,
    message: job.enabled
      ? 'The job stops running on its schedule until it is turned on again. Queued work waits.'
      : 'The job runs on its schedule again from the next scheduler minute.',
    confirmLabel: job.enabled ? 'Turn off' : 'Turn on',
    danger: job.enabled,
    requireReason: true,
    reasonLabel: job.enabled ? 'Reason for turning off (required)' : 'Reason for turning on (required)',
    onConfirm: (reason) => act(() => setBackgroundJobEnabled(job.code, !job.enabled, reason),
      `${job.code} turned ${job.enabled ? 'off' : 'on'}.`),
  })

  const rerun = (run) => confirm({
    title: 'Re-run this run?',
    message: `A new run of ${job.code} is started and linked to the run from ${formatJobTime(run.started_at)}.`,
    confirmLabel: 'Re-run',
    requireReason: true,
    reasonLabel: 'What was fixed (required)',
    onConfirm: (reason) => act(() => rerunBackgroundJobRun(run.id, reason), `Re-run of ${job.code} requested.`),
  })

  const replay = (item) => confirm({
    title: 'Replay this work item?',
    message: 'The item is tried again from the start, with a fresh set of attempts.',
    confirmLabel: 'Replay',
    requireReason: true,
    reasonLabel: 'What was fixed (required)',
    onConfirm: (reason) => act(() => replayBackgroundJobItem(item.id, reason), 'Work item queued again.'),
  })

  if (loading) return <LoadingState message="Loading job..." />

  const back = (
    <button type="button" onClick={() => navigate(-1)}
      className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
      <ArrowLeft className="h-4 w-4" />
      Back to Background Jobs
    </button>
  )

  if (!job) {
    return (
      <div className="p-4 md:p-6">
        {back}
        <EmptyState title="Job not found" description={error || `There is no background job with the code ${code}.`} />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        {back}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{job.name}</h1>
            <p className="font-mono text-sm text-gray-500 dark:text-gray-400">{job.code}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <JobStatusPill status={job.enabled ? 'on' : 'off'} />
              {job.last_status && <JobStatusPill status={job.last_status} />}
              {job.alert_open && <JobStatusPill status={job.alert_kind === 'late' ? 'late' : 'alert'} />}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canRun && (
              <button type="button" onClick={runNow} disabled={!job.enabled || Boolean(job.run_requested_at)}
                title={!job.enabled ? 'Turn the job on first' : job.run_requested_at ? 'A run is already requested' : undefined}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                {job.run_requested_at ? 'Run requested' : 'Run now'}
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={toggle} className={buttonClass}>{job.enabled ? 'Turn off' : 'Turn on'}</button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <DetailAuditTabList activeTab={tab} onChange={setTab} tabs={TABS} />

      {tab === 'details' && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 md:p-6 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm text-gray-700 dark:text-gray-300">{job.description || '—'}</p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact helpKey="admin.background_jobs.code" label="Job code"><span className="font-mono">{job.code}</span></Fact>
            <Fact helpKey="admin.background_jobs.owner_system" label="Owner">{BACKGROUND_JOB_OWNER_LABELS[job.owner_system] || job.owner_system}</Fact>
            <Fact helpKey="admin.background_jobs.kind" label="Runs as">{BACKGROUND_JOB_KIND_LABELS[job.kind] || job.kind}</Fact>
            <Fact helpKey="admin.background_jobs.cron" label="Schedule">
              {describeCron(job.cron, job.time_basis)}
              {job.cron && <span className="block font-mono text-xs text-gray-500 dark:text-gray-400">{job.cron}</span>}
            </Fact>
            <Fact helpKey="admin.background_jobs.time_basis" label="Time basis">{job.time_basis === 'organisation' ? 'Each organisation’s time zone' : 'UTC'}</Fact>
            <Fact helpKey="admin.background_jobs.enabled" label="Status">{job.enabled ? 'On' : 'Off'}{job.enabled_reason ? ` — ${job.enabled_reason}` : ''}</Fact>
            <Fact helpKey="admin.background_jobs.next_run_at" label="Next run">{formatJobTime(job.next_run_at)}</Fact>
            <Fact helpKey="admin.background_jobs.last_success_at" label="Last success">{formatJobTime(job.last_success_at)}</Fact>
            <Fact helpKey="admin.background_jobs.alert_open" label="Alert">
              {job.alert_open ? `${job.alert_kind === 'late' ? 'Late' : 'Failed'} since ${formatJobTime(job.alert_raised_at)}` : 'None'}
            </Fact>
            <Fact helpKey="admin.background_jobs.timeout_seconds" label="Time-out">{job.timeout_seconds} seconds</Fact>
            {job.kind === 'sql' ? (
              <>
                <Fact helpKey="admin.background_jobs.max_retries" label="Retries">{job.max_retries}</Fact>
                <Fact helpKey="admin.background_jobs.retry_delay_seconds" label="Retry delay">{job.retry_delay_seconds} seconds</Fact>
              </>
            ) : (
              <>
                <Fact helpKey="admin.background_jobs.max_attempts" label="Attempts per item">{job.max_attempts}</Fact>
                <Fact helpKey="admin.background_jobs.backoff_schedule" label="Wait between attempts">
                  {(job.backoff_schedule || []).map((s) => formatJobDuration(Number(s) * 1000)).join(', ')}
                </Fact>
                <Fact helpKey="admin.background_jobs.batch_size" label="Batch size">{job.batch_size}</Fact>
                <Fact helpKey="admin.background_jobs.per_org_batch_cap" label="Per organisation">{job.per_org_batch_cap ?? 'No limit'}</Fact>
              </>
            )}
          </dl>
        </div>
      )}

      {tab === 'runs' && (runs.length === 0 ? (
        <EmptyState title="No runs yet" description="Runs appear here once the job has started." />
      ) : (
        <AdminTable rows={runs} pageSize={25} columns={[
          { key: 'started_at', label: 'Started', render: (r) => <span className="text-gray-700 dark:text-gray-300">{formatJobTime(r.started_at)}</span> },
          { key: 'status', label: 'Result', render: (r) => <JobStatusPill status={r.status} /> },
          { key: 'triggered_by', label: 'Started by', render: (r) => (
            <div className="text-gray-700 dark:text-gray-300">
              {BACKGROUND_JOB_TRIGGER_LABELS[r.triggered_by] || r.triggered_by}
              {r.triggered_by_email && <p className="text-xs text-gray-500 dark:text-gray-400">{r.triggered_by_email}</p>}
              {r.reason && <p className="text-xs text-gray-500 dark:text-gray-400">{r.reason}</p>}
            </div>
          ) },
          { key: 'duration_ms', label: 'Took', render: (r) => <span className="text-gray-700 dark:text-gray-300">{formatJobDuration(r.duration_ms)}</span> },
          { key: 'records_processed', label: 'Processed', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.records_processed ?? '—'}</span> },
          { key: 'error', label: 'Error', render: (r) => <span className="break-words text-xs text-red-700 dark:text-red-300">{r.error || ''}</span> },
          { key: 'actions', label: 'Actions', sortable: false, render: (r) => (canRun && ['failed', 'partial', 'skipped'].includes(r.status) ? (
            <button type="button" onClick={() => rerun(r)} disabled={!job.enabled} className={buttonClass}>Re-run</button>
          ) : null) },
        ]} />
      ))}

      {tab === 'items' && (items.length === 0 ? (
        <EmptyState title="No waiting or failed work items" description={job.kind === 'sql' ? 'Database jobs do not use the work queue.' : 'Everything queued for this job has been done.'} />
      ) : (
        <AdminTable rows={items} pageSize={25} columns={[
          { key: 'created_at', label: 'Queued', render: (r) => <span className="text-gray-700 dark:text-gray-300">{formatJobTime(r.created_at)}</span> },
          { key: 'status', label: 'Status', render: (r) => <JobStatusPill status={r.status} /> },
          { key: 'attempts', label: 'Attempts', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.attempts} of {r.max_attempts}</span> },
          { key: 'run_after', label: 'Next try', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.status === 'dead' ? '—' : formatJobTime(r.run_after)}</span> },
          { key: 'last_error', label: 'Last error', render: (r) => <span className="break-words text-xs text-red-700 dark:text-red-300">{r.last_error || ''}</span> },
          { key: 'replay_count', label: 'Replays', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.replay_count || 0}</span> },
          { key: 'actions', label: 'Actions', sortable: false, render: (r) => (canRun && r.status === 'dead' ? (
            <button type="button" onClick={() => replay(r)} className={buttonClass}>Replay</button>
          ) : null) },
        ]} />
      ))}

      {tab === 'audit' && (
        <AuditDetailsPanel description="When this job was registered and last changed. Every action is also in the admin audit log.">
          <AuditCard title="Identity" description="How the job is named.">
            <AuditField label="Job code" value={job.code} />
            <AuditField label="Name" value={job.name} />
          </AuditCard>
          <AuditCard title="Classification" description="Where it belongs and how it runs.">
            <AuditField label="Owner" value={BACKGROUND_JOB_OWNER_LABELS[job.owner_system] || job.owner_system} />
            <AuditField label="Runs as" value={BACKGROUND_JOB_KIND_LABELS[job.kind] || job.kind} />
          </AuditCard>
          <AuditCard title="Record history" description="Registration and the last change made in Admin.">
            <AuditTimestampPair dateLabel="Registered at" value={job.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={job.updated_at} />
            <AuditField label="Last changed by" value={job.updated_by_email || '—'} />
            <AuditTimestampPair dateLabel="Turned on / off at" value={job.enabled_changed_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {modal}
    </div>
  )
}
