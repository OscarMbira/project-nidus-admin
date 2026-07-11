import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchTestRunById, fetchTestResultById, formatDate } from '@nidus-admin/shared'
import { AdminBadge, LoadingState } from '@nidus-admin/ui'

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

function DetailField({ label, children }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 text-sm text-gray-200">{children}</div>
    </div>
  )
}

export default function TestResultDetailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const runId = params.get('runId')
  const resultId = params.get('resultId')
  const [loading, setLoading] = useState(true)
  const [run, setRun] = useState(null)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!runId || !resultId) {
      setLoading(false)
      return
    }
    Promise.all([
      fetchTestRunById(runId),
      fetchTestResultById(resultId, runId),
    ]).then(([runRes, resultRes]) => {
      setRun(runRes.data)
      setResult(resultRes.data)
      setLoading(false)
    })
  }, [runId, resultId])

  if (loading) return <LoadingState message="Loading test result..." />

  if (!runId || !resultId) {
    return <div className="p-6 text-gray-400">Missing run or result identifier.</div>
  }

  if (!result) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <button
          type="button"
          onClick={() => navigate(runId ? `/system/test-run-detail?runId=${runId}` : '/system/test-dashboard')}
          className="text-sm text-blue-400 hover:underline"
        >
          ← Back to Run
        </button>
        <div className="text-gray-400">Test result not found.</div>
      </div>
    )
  }

  const caseLabel = result.case_name || result.case_key || 'Unknown test case'

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button
        type="button"
        onClick={() => navigate(`/system/test-run-detail?runId=${runId}`)}
        className="text-sm text-blue-400 hover:underline"
      >
        ← Back to Run
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{caseLabel}</h1>
        <p className="text-sm text-gray-500">
          {run?.run_name || 'Test run'} · {result.system || '—'} · {result.module || '—'}
        </p>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-4 text-lg font-medium text-gray-200">Result Details</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailField label="Status">
            <AdminBadge label={result.status} variant={RESULT_VARIANT[result.status] || 'neutral'} />
          </DetailField>
          <DetailField label="Duration">
            {result.duration_ms ? `${result.duration_ms}ms` : '—'}
          </DetailField>
          <DetailField label="Executed At">
            {result.executed_at ? formatDate(result.executed_at) : '—'}
          </DetailField>
          <DetailField label="Case Key">{result.case_key || '—'}</DetailField>
          <DetailField label="Suite">{result.suite_name || '—'}</DetailField>
          <DetailField label="System">{result.system || '—'}</DetailField>
          <DetailField label="Module">{result.module || '—'}</DetailField>
        </div>
      </div>

      {(result.error_message || result.error_stack) && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-medium text-gray-200">Error</h2>
          {result.error_message && (
            <p className="text-sm text-red-300">{stripAnsi(result.error_message)}</p>
          )}
          {result.error_stack && (
            <pre className="mt-3 overflow-x-auto rounded bg-gray-950 p-3 text-xs text-red-300">
              {stripAnsi(result.error_stack)}
            </pre>
          )}
        </div>
      )}

      {(result.screenshot_url || result.trace_url) && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="mb-3 text-lg font-medium text-gray-200">Artifacts</h2>
          <div className="space-y-2 text-sm">
            {result.screenshot_url && (
              <p className="text-gray-300">
                Screenshot:{' '}
                <code className="rounded bg-gray-800 px-2 py-1 text-blue-300">{result.screenshot_url}</code>
              </p>
            )}
            {result.trace_url && (
              <p className="text-gray-300">
                Trace:{' '}
                <code className="rounded bg-gray-800 px-2 py-1 text-blue-300">{result.trace_url}</code>
              </p>
            )}
          </div>
        </div>
      )}

      {!result.error_message && !result.error_stack && !result.screenshot_url && !result.trace_url && (
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
          No error output or artifacts were recorded for this result.
        </div>
      )}
    </div>
  )
}
