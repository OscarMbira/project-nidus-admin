import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cancelCobRun, fetchCobRunDetail, formatDate } from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import StepTimeline from './CobRunDetailStepTimeline.jsx'

const STATUS_VARIANT = {
  pending: 'pending_activation',
  running: 'system_admin',
  completed: 'active',
  failed: 'suspended',
  skipped: 'content_admin',
  rolled_back: 'suspended',
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return null
  const start = new Date(startedAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  return `${minutes}m ${rem}s`
}

function jsonPreview(value) {
  if (!value) return '—'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

export default function CobRunDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('id')
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [run, setRun] = useState(null)

  const loadRun = async () => {
    if (!runId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await fetchCobRunDetail(runId)
    if (error) {
      showError(toErrorMessage(error, 'Failed to load COB run.'))
      setRun(null)
      setLoading(false)
      return
    }
    setRun(data)
    setLoading(false)
  }

  useEffect(() => { loadRun() }, [runId])

  const steps = useMemo(
    () => [...(run?.steps || [])].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)),
    [run],
  )

  const handleCancel = () => {
    confirm({
      title: 'Cancel COB run?',
      message: 'Remaining steps will be skipped and the COB lock will be released.',
      confirmLabel: 'Cancel Run',
      danger: true,
      onConfirm: async () => {
        const { error } = await cancelCobRun(runId)
        if (error) {
          showError(toErrorMessage(error, 'Failed to cancel COB run.'))
          return
        }
        showSuccess('COB run cancelled.')
        await loadRun()
      },
    })
  }

  if (loading) return <LoadingState message="Loading COB run..." />

  if (!runId) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="No COB run selected" description="Open a run from the COB dashboard to view details." />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="COB run not found" description="The requested run could not be loaded." />
      </div>
    )
  }

  const canCancel = run.status === 'running' || run.status === 'pending'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/batch-ops/cob-dashboard')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to COB dashboard
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">COB Run — {run.business_date}</h1>
          <p className="text-sm text-gray-500">
            Run ID: <span className="font-mono text-xs">{run.id}</span>
          </p>
        </div>
        {canCancel && (
          <button
            type="button"
            onClick={handleCancel}
            className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200 hover:bg-red-900/50"
          >
            Cancel Run
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
        <AdminBadge label={run.status} variant={STATUS_VARIANT[run.status] || 'system_admin'} />
        <span>Trigger: {run.trigger_type || '—'}</span>
        {run.triggered_by_email && <span>By {run.triggered_by_email}</span>}
        {run.started_at && <span>Started {formatDate(run.started_at)}</span>}
        {run.completed_at && <span>Completed {formatDate(run.completed_at)}</span>}
        {run.next_business_date && <span>Next date: {run.next_business_date}</span>}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium text-gray-100">Process Timeline</h2>
        <StepTimeline steps={steps} />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-gray-100">COB Report</h2>
        {run.cob_report ? (
          <pre className="max-h-[480px] overflow-auto rounded-lg border border-gray-700 bg-gray-950 p-4 text-xs text-gray-300">
            {jsonPreview(run.cob_report)}
          </pre>
        ) : (
          <p className="text-sm text-gray-500">No COB report generated yet.</p>
        )}
      </div>

      {modal}
    </div>
  )
}
