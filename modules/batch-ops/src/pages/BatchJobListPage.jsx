import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cancelBatchJob, fetchBatchJobs, formatDate } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  LoadingState,
  ProgressIndicator,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const STATUS_VARIANT = {
  queued: 'pending_activation',
  running: 'system_admin',
  completed: 'active',
  failed: 'suspended',
  cancelled: 'suspended',
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

export default function BatchJobListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchBatchJobs({
      status: statusFilter === 'all' ? null : statusFilter,
      limit: 100,
    })
    if (error) {
      showError(toErrorMessage(error, 'Failed to load batch jobs.'))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [statusFilter])

  const handleCancel = useCallback((job) => {
    confirm({
      title: 'Cancel batch job?',
      message: `Stop processing for "${job.job_type}" (${job.processed_records ?? 0}/${job.total_records ?? 0} processed).`,
      confirmLabel: 'Cancel Job',
      danger: true,
      onConfirm: async () => {
        setBusyId(job.id)
        const { error } = await cancelBatchJob(job.id)
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, 'Failed to cancel job.'))
          return
        }
        showSuccess('Batch job cancelled.')
        await loadData()
      },
    })
  }, [confirm, showError, showSuccess])

  const columns = useMemo(() => [
    {
      key: 'job_type',
      label: 'Job Type',
      render: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/batch-ops/batch-job-detail?id=${encodeURIComponent(row.id)}`)}
          className="font-medium text-blue-300 hover:text-blue-200"
        >
          {row.job_type?.replace(/_/g, ' ') || '—'}
        </button>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <AdminBadge
          label={row.status || 'unknown'}
          variant={STATUS_VARIANT[row.status] || 'system_admin'}
        />
      ),
    },
    {
      key: 'progress',
      label: 'Progress',
      sortable: false,
      render: (row) => (
        <div className="min-w-[160px]">
          <ProgressIndicator
            label=""
            current={row.processed_records ?? 0}
            total={row.total_records ?? 0}
          />
        </div>
      ),
    },
    {
      key: 'created_by_email',
      label: 'Created By',
      render: (row) => row.created_by_email || row.created_by || '—',
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
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate(`/batch-ops/batch-job-detail?id=${encodeURIComponent(row.id)}`)}
            className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
          >
            View
          </button>
          {(row.status === 'running' || row.status === 'queued') && (
            <button
              type="button"
              disabled={busyId === row.id}
              onClick={() => handleCancel(row)}
              className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ], [busyId, navigate, handleCancel])

  if (loading) return <LoadingState message="Loading batch jobs..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Batch Jobs</h1>
          <p className="text-sm text-gray-500">Monitor bulk operations and CSV import jobs with live progress.</p>
        </div>
        <div className="flex gap-3">
          <select
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            type="button"
            onClick={() => navigate('/batch-ops/batch-import')}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Import
          </button>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="No batch jobs found" description="Start a CSV import or bulk operation to see jobs here." />
      ) : (
        <AdminTable columns={columns} rows={rows} pageSize={20} />
      )}

      {modal}
    </div>
  )
}
