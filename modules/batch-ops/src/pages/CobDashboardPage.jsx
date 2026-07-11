import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  executeCobStep,
  fetchCobRunDetail,
  fetchCobRuns,
  fetchCurrentBusinessDate,
  formatDate,
  startCobRun,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminTable,
  EmptyState,
  LoadingState,
  useToast,
} from '@nidus-admin/ui'

const STATUS_VARIANT = {
  pending: 'pending_activation',
  running: 'system_admin',
  completed: 'active',
  failed: 'suspended',
  rolled_back: 'suspended',
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m ${rem}s`
}

async function runAllCobSteps(runId, onStep) {
  let detail = null
  const { data, error } = await fetchCobRunDetail(runId)
  if (error) return { error }
  detail = data
  const steps = detail?.steps || []
  for (const step of steps) {
    if (step.status === 'completed' || step.status === 'skipped') continue
    onStep?.(step)
    const { error: stepError } = await executeCobStep(runId, step.id)
    if (stepError) return { error: stepError, step }
    const refresh = await fetchCobRunDetail(runId)
    if (refresh.error) return { error: refresh.error }
    detail = refresh.data
    const updated = (detail?.steps || []).find((item) => item.id === step.id)
    if (updated?.status === 'failed') {
      return { error: updated.error_message || 'COB step failed', step: updated }
    }
  }
  return { data: detail }
}

export default function CobDashboardPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [businessDate, setBusinessDate] = useState(null)
  const [runs, setRuns] = useState([])
  const [running, setRunning] = useState(false)
  const [currentStep, setCurrentStep] = useState(null)

  const loadData = async () => {
    setLoading(true)
    const [dateRes, runsRes] = await Promise.all([
      fetchCurrentBusinessDate(),
      fetchCobRuns({ limit: 50 }),
    ])
    if (dateRes.error) showError(toErrorMessage(dateRes.error, 'Failed to load business date.'))
    else setBusinessDate(dateRes.data)
    if (runsRes.error) showError(toErrorMessage(runsRes.error, 'Failed to load COB runs.'))
    else setRuns(runsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleRunCob = async () => {
    setRunning(true)
    setCurrentStep(null)
    const { data: runId, error } = await startCobRun(businessDate, 'manual')
    if (error) {
      setRunning(false)
      showError(toErrorMessage(error, 'Failed to start COB run.'))
      return
    }
    showSuccess('COB run started.')
    const outcome = await runAllCobSteps(runId, (step) => setCurrentStep(step.process_name))
    setRunning(false)
    setCurrentStep(null)
    if (outcome.error) {
      showError(toErrorMessage(outcome.error, 'COB run encountered an error.'))
    } else {
      showSuccess('COB run completed.')
    }
    await loadData()
    navigate(`/batch-ops/cob-run-detail?id=${encodeURIComponent(runId)}`)
  }

  const columns = [
    {
      key: 'business_date',
      label: 'Business Date',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/batch-ops/cob-run-detail?id=${encodeURIComponent(row.id)}`)}
          className="font-medium text-blue-300 hover:text-blue-200"
        >
          {row.business_date}
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <AdminBadge label={row.status} variant={STATUS_VARIANT[row.status] || 'system_admin'} />
      ),
    },
    { key: 'trigger_type', label: 'Trigger' },
    {
      key: 'triggered_by_email',
      label: 'Triggered By',
      render: (row) => row.triggered_by_email || '—',
    },
    {
      key: 'started_at',
      label: 'Started',
      render: (row) => formatDate(row.started_at),
    },
    {
      key: 'duration',
      label: 'Duration',
      sortable: false,
      render: (row) => formatDuration(row.started_at, row.completed_at),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/batch-ops/cob-run-detail?id=${encodeURIComponent(row.id)}`)}
          className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
        >
          View
        </button>
      ),
    },
  ]

  const lastRun = runs[0]

  if (loading) return <LoadingState message="Loading COB dashboard..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">COB Dashboard</h1>
          <p className="text-sm text-gray-500">Run close-of-business processing and review historical runs.</p>
        </div>
        <button
          type="button"
          disabled={running}
          onClick={handleRunCob}
          className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
        >
          {running ? 'Running COB...' : 'Run COB'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard
          title="Current Business Date"
          value={businessDate || '—'}
          className="lg:col-span-1"
        />
        <AdminCard
          title="Last COB Status"
          value={lastRun?.status?.replace(/_/g, ' ') || 'No runs yet'}
          trend={lastRun?.started_at ? `Started ${formatDate(lastRun.started_at)}` : undefined}
        />
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Auto-run (read-only)</p>
          <p className="mt-2 text-sm text-gray-300">
            Scheduled COB is managed via <span className="font-mono text-xs text-amber-300">pg_cron</span> on the database.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-gray-500">
            <li>Setting: <span className="text-gray-400">cob.auto_run_enabled</span></li>
            <li>Time: <span className="text-gray-400">cob.auto_run_time</span> (default 17:00)</li>
            <li>Configure auto-run in system settings or Supabase cron jobs — not editable from this UI.</li>
          </ul>
        </div>
      </div>

      {running && currentStep && (
        <div className="rounded-lg border border-blue-800 bg-blue-950/30 p-4 text-sm text-blue-200">
          Executing step: <span className="font-medium">{currentStep}</span>
        </div>
      )}

      {!runs.length ? (
        <EmptyState title="No COB runs yet" description="Click Run COB to start the first close-of-business cycle." />
      ) : (
        <AdminTable columns={columns} rows={runs} pageSize={15} />
      )}
    </div>
  )
}
