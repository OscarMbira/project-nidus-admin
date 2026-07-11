import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchTestRunById, fetchTestRunResults, logTestDefect } from '@nidus-admin/shared'
import { AdminBadge, LoadingState, useToast } from '@nidus-admin/ui'

export default function TestRunDetailPage() {
  const { runId } = useParams()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [run, setRun] = useState(null)
  const [results, setResults] = useState([])

  useEffect(() => {
    Promise.all([fetchTestRunById(runId), fetchTestRunResults(runId)]).then(([r, res]) => {
      setRun(r.data)
      setResults(res.data || [])
      setLoading(false)
    })
  }, [runId])

  const logDefect = async (row) => {
    const { error } = await logTestDefect({
      title: `Failed: ${row.case_name || row.case_key || 'test case'}`,
      description: row.error_message || 'Logged from test run detail',
      testRunId: runId,
      testCaseId: row.case_id,
      testResultId: row.result_id,
      severity: 'high',
    })
    if (error) showError(error)
    else showSuccess('Defect logged.')
  }

  if (loading) return <LoadingState message="Loading run..." />
  if (!run) return <p className="p-6 text-gray-500">Run not found.</p>

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Link to="/testing-centre/runs" className="text-sm text-blue-400">← Runs</Link>
      <h1 className="text-2xl font-semibold text-gray-100">{run.run_name}</h1>
      <p className="text-sm text-gray-500">Pass {run.passed_count} · Fail {run.failed_count} · Skip {run.skipped_count}</p>

      <table className="min-w-full text-sm text-gray-200 rounded-lg border border-gray-700">
        <thead className="bg-gray-800 text-xs uppercase text-gray-400">
          <tr>
            <th className="px-4 py-3 text-left">Case</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Duration</th>
            <th className="px-4 py-3 text-left">Error</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row) => (
            <tr key={row.result_id} className="border-t border-gray-800">
              <td className="px-4 py-3">{row.case_name}</td>
              <td className="px-4 py-3"><AdminBadge label={row.status} variant={row.status === 'passed' ? 'success' : row.status === 'failed' ? 'danger' : 'neutral'} /></td>
              <td className="px-4 py-3">{row.duration_ms ? `${row.duration_ms}ms` : '—'}</td>
              <td className="px-4 py-3 max-w-md truncate text-red-400">{row.error_message || '—'}</td>
              <td className="px-4 py-3 text-right">
                {row.status === 'failed' && (
                  <button type="button" className="text-xs text-amber-400" onClick={() => logDefect(row)}>Log defect</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
