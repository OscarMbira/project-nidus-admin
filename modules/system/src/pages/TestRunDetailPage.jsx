import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import {
  fetchTestRunById,
  fetchTestRunResults,
  fetchAutoFixSummary,
  formatDate,
} from '@nidus-admin/shared'
import { AdminBadge, AdminCard, LoadingState, AdminTable } from '@nidus-admin/ui'

const RESULT_VARIANT = {
  passed: 'success',
  failed: 'danger',
  skipped: 'neutral',
  error: 'danger',
  running: 'info',
  pending: 'warning',
}

function stripAnsi(text) {
  if (!text) return text
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

export default function TestRunDetailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const runId = params.get('runId')
  const [loading, setLoading] = useState(true)
  const [run, setRun] = useState(null)
  const [results, setResults] = useState([])
  const [autoFix, setAutoFix] = useState(null)

  useEffect(() => {
    if (!runId) { setLoading(false); return }
    Promise.all([
      fetchTestRunById(runId),
      fetchTestRunResults(runId),
      fetchAutoFixSummary(runId),
    ]).then(([runRes, resultsRes, fixRes]) => {
      setRun(runRes.data)
      setResults(resultsRes.data || [])
      setAutoFix(fixRes.data)
      setLoading(false)
    })
  }, [runId])

  if (loading) return <LoadingState message="Loading run results..." />
  if (!run) return <div className="p-6 text-gray-400">Run not found.</div>

  const derived = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})
  const passed = run.passed_count || derived.passed || 0
  const failed = run.failed_count || derived.failed || derived.error || 0
  const skipped = run.skipped_count || derived.skipped || 0

  const resultColumns = [
    { key: 'case_name', label: 'Case', render: (row) => row.case_name || row.case_key || '—' },
    { key: 'module', label: 'Module' },
    { key: 'status', label: 'Status', render: (row) => <AdminBadge label={row.status} variant={RESULT_VARIANT[row.status] || 'neutral'} /> },
    { key: 'duration_ms', label: 'Duration', render: (row) => row.duration_ms ? `${row.duration_ms}ms` : '—' },
    { key: 'error_message', label: 'Error', render: (row) => row.error_message ? <span className="truncate text-red-400">{stripAnsi(row.error_message)}</span> : '—' },
    { key: 'result_id', label: '', render: (row) => (
      <button
        type="button"
        className="text-blue-400 hover:underline"
        onClick={() => navigate(`/system/test-result-detail?runId=${runId}&resultId=${row.result_id}`)}
      >
        Details
      </button>
    ) },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/system/test-dashboard')} className="text-sm text-blue-400 hover:underline">
        ← Back to Dashboard
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{run.run_name}</h1>
        <p className="text-sm text-gray-500">
          {run.trigger_type} · {run.status} · {formatDate(run.started_at || run.created_at)}
          {run.duration_ms ? ` · ${Math.round(run.duration_ms / 1000)}s` : ''}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminCard title="Passed" value={passed} />
        <AdminCard title="Failed" value={failed} />
        <AdminCard title="Skipped" value={skipped} />
        <AdminCard title="Auto-Fixed" value={autoFix?.resolved_count ?? 0} />
        <AdminCard title="Manual Required" value={autoFix?.manual_required_count ?? 0} />
      </div>

      <div className="flex gap-3">
        <code className="rounded bg-gray-800 px-3 py-2 text-sm text-blue-300">pnpm test:e2e --grep @failed</code>
        <Link to="/system/test-fix-patterns" className="rounded bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">
          View Fix Patterns
        </Link>
      </div>

      <AdminTable columns={resultColumns} rows={results} idKey="result_id" />
    </div>
  )
}
