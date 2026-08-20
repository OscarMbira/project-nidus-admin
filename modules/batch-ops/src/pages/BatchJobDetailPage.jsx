import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  cancelBatchJob,
  completeBatchJob,
  createBatchJob,
  executeBulkOperation,
  fetchBatchJobDetail,
  formatDate,
  getAdminDb,
  getDisplayIdForRecord,
  getPublicDb,
  getSimDb,
  inviteAdminUser,
  updateBatchJobItem,
  useDisplayId,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
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
  pending: 'pending_activation',
  processing: 'system_admin',
  succeeded: 'active',
  skipped: 'content_admin',
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function downloadErrorCsv(items) {
  const failed = (items || []).filter((item) => item.status === 'failed')
  if (!failed.length) return
  const csv = [
    'record_id,record_label,error_message',
    ...failed.map((item) => [
      JSON.stringify(item.record_id ?? ''),
      JSON.stringify(item.record_label ?? ''),
      JSON.stringify(item.error_message ?? ''),
    ].join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `batch_job_errors_${Date.now()}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function getTableClient(tableRef) {
  const [schemaName] = String(tableRef || '').split('.')
  if (schemaName === 'public') return getPublicDb()
  if (schemaName === 'sim') return getSimDb()
  return getAdminDb()
}

async function retryImportItem(row, schema, jobId, itemId) {
  try {
    if (schema?.rpc === 'invite_admin_user') {
      const { error } = await inviteAdminUser(row.email, row.role, null)
      if (error) throw new Error(error)
    } else if (schema?.table) {
      const [, tableName] = schema.table.split('.')
      const db = getTableClient(schema.table)
      if (!db) throw new Error('Database not configured')
      const payload = {}
      ;(schema.fields || []).forEach((field) => {
        if (row[field.key] != null && row[field.key] !== '') payload[field.key] = row[field.key]
      })
      const { error } = await db.from(tableName).insert(payload)
      if (error) throw new Error(error.message)
    } else {
      throw new Error('No import handler configured for this job type')
    }
    await updateBatchJobItem(jobId, itemId, 'succeeded')
    return {}
  } catch (err) {
    const message = err?.message || String(err)
    await updateBatchJobItem(jobId, itemId, 'failed', message)
    return { error: message }
  }
}

export default function BatchJobDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const { uuid: jobId, loading: resolving } = useDisplayId('admin.batch_jobs', idParam)
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [job, setJob] = useState(null)
  const [retrying, setRetrying] = useState(false)

  const loadJob = async () => {
    if (!jobId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await fetchBatchJobDetail(jobId)
    if (error) {
      showError(toErrorMessage(error, 'Failed to load batch job.'))
      setJob(null)
      setLoading(false)
      return
    }
    setJob(data)
    setLoading(false)
  }

  useEffect(() => { loadJob() }, [jobId])

  const items = job?.items || []
  const failedItems = useMemo(() => items.filter((item) => item.status === 'failed'), [items])
  const skippedCount = useMemo(
    () => items.filter((item) => item.status === 'skipped').length,
    [items],
  )

  const itemColumns = useMemo(() => [
    {
      key: 'record_label',
      label: 'Record',
      render: (row) => (
        <div>
          <div>{row.record_label || row.record_id || '—'}</div>
          {row.record_label && row.record_id && (
            <div className="text-xs text-gray-500">{row.record_id}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <AdminBadge label={row.status} variant={STATUS_VARIANT[row.status] || 'system_admin'} />
      ),
    },
    {
      key: 'error_message',
      label: 'Error',
      render: (row) => (
        <span className={row.error_message ? 'text-red-300' : 'text-gray-500'}>
          {row.error_message || '—'}
        </span>
      ),
    },
    {
      key: 'processed_at',
      label: 'Processed',
      render: (row) => formatDate(row.processed_at),
    },
  ], [])

  const handleCancel = () => {
    confirm({
      title: 'Cancel batch job?',
      message: 'Remaining items will be skipped.',
      confirmLabel: 'Cancel Job',
      danger: true,
      onConfirm: async () => {
        const { error } = await cancelBatchJob(jobId)
        if (error) {
          showError(toErrorMessage(error, 'Failed to cancel job.'))
          return
        }
        showSuccess('Batch job cancelled.')
        await loadJob()
      },
    })
  }

  const handleRetryFailed = () => {
    if (!failedItems.length) {
      showError('No failed items to retry.')
      return
    }
    confirm({
      title: `Retry ${failedItems.length} failed item(s)?`,
      message: 'A new batch job will be created and failed records will be reprocessed.',
      confirmLabel: 'Retry Failed',
      onConfirm: async () => {
        setRetrying(true)
        const schema = job?.parameters?.schema
        const storedRows = job?.parameters?.rows || []
        const recordIds = failedItems.map((item) => item.record_id)
        const recordLabels = failedItems.map((item) => item.record_label || item.record_id)
        const { data: newJobId, error: createError } = await createBatchJob(
          `retry_${job.job_type}`,
          { ...job.parameters, retriedFrom: jobId },
          recordIds,
          recordLabels,
        )
        if (createError) {
          setRetrying(false)
          showError(toErrorMessage(createError, 'Failed to create retry job.'))
          return
        }
        const { data: detail, error: detailError } = await fetchBatchJobDetail(newJobId)
        if (detailError) {
          setRetrying(false)
          showError(toErrorMessage(detailError, 'Failed to load retry job items.'))
          return
        }
        const detailItems = detail?.items || []
        await executeBulkOperation({
          items: failedItems,
          operation: async (item, index) => {
            const detailItem = detailItems[index]
            const rowPayload = storedRows[index] || {
              record_id: item.record_id,
              record_label: item.record_label,
            }
            if (schema) {
              return retryImportItem(rowPayload, schema, newJobId, detailItem?.id)
            }
            await updateBatchJobItem(newJobId, detailItem?.id, 'failed', 'Retry handler not available for this job type')
            return { error: 'Retry handler not available for this job type' }
          },
          onProgress: () => {},
        })
        await completeBatchJob(newJobId)
        setRetrying(false)
        showSuccess('Retry job completed.')
        const newDisplayId = await getDisplayIdForRecord('admin.batch_jobs', newJobId).catch(() => null)
        navigate(`/batch-ops/batch-job-detail?id=${encodeURIComponent(newDisplayId || newJobId)}`)
      },
    })
  }

  if (loading || resolving) return <LoadingState message="Loading batch job..." />

  if (!idParam) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="No job selected" description="Open a batch job from the list to view details." />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="Batch job not found" description="The requested job could not be loaded." />
      </div>
    )
  }

  const canCancel = job.status === 'running' || job.status === 'queued'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/batch-ops/batch-jobs')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to batch jobs
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">{job.job_type?.replace(/_/g, ' ')}</h1>
          <p className="text-sm text-gray-500">
            Job ID: <span className="font-mono text-xs">{job.id}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200 hover:bg-red-900/50"
            >
              Cancel Job
            </button>
          )}
          {failedItems.length > 0 && (
            <button
              type="button"
              disabled={retrying}
              onClick={handleRetryFailed}
              className="rounded border border-amber-700 bg-amber-900/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/50 disabled:opacity-60"
            >
              {retrying ? 'Retrying...' : `Retry Failed (${failedItems.length})`}
            </button>
          )}
          {failedItems.length > 0 && (
            <button
              type="button"
              onClick={() => {
                downloadErrorCsv(items)
                showSuccess('Error report downloaded.')
              }}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              Download Error Report
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <AdminBadge label={job.status} variant={STATUS_VARIANT[job.status] || 'system_admin'} />
        <span className="text-sm text-gray-400">Created {formatDate(job.created_at)}</span>
        {job.created_by_email && (
          <span className="text-sm text-gray-400">by {job.created_by_email}</span>
        )}
        {job.started_at && <span className="text-sm text-gray-400">Started {formatDate(job.started_at)}</span>}
        {job.completed_at && <span className="text-sm text-gray-400">Completed {formatDate(job.completed_at)}</span>}
      </div>

      <ProgressIndicator
        label="Overall progress"
        current={job.processed_records ?? 0}
        total={job.total_records ?? 0}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={job.total_records ?? 0} />
        <AdminCard title="Succeeded" value={job.succeeded_count ?? 0} />
        <AdminCard title="Failed" value={job.failed_count ?? 0} />
        <AdminCard title="Skipped" value={skippedCount} />
      </div>

      {!items.length ? (
        <EmptyState title="No job items" description="This batch job has no item records yet." />
      ) : (
        <AdminTable columns={itemColumns} rows={items} pageSize={25} />
      )}

      {modal}
    </div>
  )
}
