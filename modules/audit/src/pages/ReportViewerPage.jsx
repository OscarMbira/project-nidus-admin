import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchReportRun, formatDate } from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  useToast,
} from '@nidus-admin/ui'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function extractTableRows(resultData) {
  if (!resultData) return []
  if (Array.isArray(resultData)) return resultData
  if (Array.isArray(resultData.rows)) return resultData.rows
  if (Array.isArray(resultData.data)) return resultData.data
  if (typeof resultData === 'object') return [resultData]
  return []
}

export default function ReportViewerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('id')
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [run, setRun] = useState(null)
  const [viewMode, setViewMode] = useState('table')

  const loadRun = async () => {
    if (!runId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await fetchReportRun(runId)
    if (error) {
      showError(toErrorMessage(error, 'Failed to load report run.'))
      setRun(null)
      setLoading(false)
      return
    }
    setRun(data)
    setLoading(false)
  }

  useEffect(() => { loadRun() }, [runId])

  const tableRows = useMemo(() => extractTableRows(run?.result_data), [run])
  const tableColumns = useMemo(() => {
    if (!tableRows.length) return []
    const keys = new Set()
    tableRows.forEach((row) => {
      if (row && typeof row === 'object') Object.keys(row).forEach((key) => keys.add(key))
    })
    return Array.from(keys)
  }, [tableRows])

  const exportJson = () => {
    const payload = run?.result_data ?? run
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `report-run-${runId || Date.now()}.json`)
    showSuccess('Report exported as JSON.')
  }

  const exportCsv = () => {
    if (!tableRows.length || !tableColumns.length) {
      showError('No tabular data available to export as CSV.')
      return
    }
    const csv = [
      tableColumns.join(','),
      ...tableRows.map((row) => tableColumns.map((col) => JSON.stringify(row?.[col] ?? '')).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    downloadBlob(blob, `report-run-${runId || Date.now()}.csv`)
    showSuccess('Report exported as CSV.')
  }

  if (loading) return <LoadingState message="Loading report results..." />

  if (!runId) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="No report run selected" description="Run a report from the Reports list to view results." />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="Report run not found" description="The requested run could not be loaded." />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate('/audit/reports')} className="mb-2 text-xs text-gray-400 hover:text-gray-200">
            ← Back to reports
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">Report Results</h1>
          <p className="text-sm text-gray-500">Run ID: <span className="font-mono text-xs">{run.id}</span></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setViewMode('table')} className={`rounded border px-3 py-1.5 text-xs ${viewMode === 'table' ? 'border-blue-600 bg-blue-900/40 text-blue-200' : 'border-gray-600 text-gray-300'}`}>
            Table
          </button>
          <button type="button" onClick={() => setViewMode('json')} className={`rounded border px-3 py-1.5 text-xs ${viewMode === 'json' ? 'border-blue-600 bg-blue-900/40 text-blue-200' : 'border-gray-600 text-gray-300'}`}>
            JSON
          </button>
          <button type="button" onClick={exportCsv} className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
            Export CSV
          </button>
          <button type="button" onClick={exportJson} className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600">
            Export JSON
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="text-xs uppercase text-gray-500">Status</div>
          <div className="mt-1">
            <AdminBadge label={run.status || 'unknown'} variant={run.status === 'completed' ? 'active' : run.status === 'failed' ? 'suspended' : 'pending_activation'} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="text-xs uppercase text-gray-500">Row Count</div>
          <div className="mt-1 text-lg text-gray-100">{run.row_count ?? tableRows.length}</div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="text-xs uppercase text-gray-500">Started</div>
          <div className="mt-1 text-sm text-gray-200">{formatDate(run.started_at)}</div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <div className="text-xs uppercase text-gray-500">Completed</div>
          <div className="mt-1 text-sm text-gray-200">{formatDate(run.completed_at)}</div>
        </div>
      </div>

      {viewMode === 'json' ? (
        <pre className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-950 p-4 text-xs text-gray-200">
          {JSON.stringify(run.result_data ?? {}, null, 2)}
        </pre>
      ) : tableRows.length && tableColumns.length ? (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                {tableColumns.map((col) => (
                  <th key={col} className="px-4 py-3">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => (
                <tr key={index} className="border-t border-gray-800">
                  {tableColumns.map((col) => (
                    <td key={col} className="px-4 py-3">
                      {typeof row?.[col] === 'object' ? JSON.stringify(row[col]) : String(row?.[col] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No tabular rows" description="This run returned metadata only. Switch to JSON view for full result_data." />
      )}

      {run.file_url && (
        <p className="text-sm text-gray-400">
          Generated file:{' '}
          <a href={run.file_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
            Download
          </a>
        </p>
      )}
    </div>
  )
}
