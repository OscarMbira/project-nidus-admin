import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTestRuns, formatDate } from '@nidus-admin/shared'
import { AdminBadge, EmptyState, LoadingState } from '@nidus-admin/ui'

const VARIANT = { completed: 'success', running: 'info', failed: 'danger', pending: 'warning' }

export default function TestRunsPage() {
  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState([])

  useEffect(() => {
    fetchTestRuns({ limit: 50 }).then(({ data }) => {
      setRuns(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading runs..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-100">Test Runs</h1>
      {!runs.length ? <EmptyState title="No runs yet" /> : (
        <table className="min-w-full text-sm text-gray-200 rounded-lg border border-gray-700 overflow-hidden">
          <thead className="bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Run</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Pass/Fail/Skip</th>
              <th className="px-4 py-3 text-left">Environment</th>
              <th className="px-4 py-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-t border-gray-800">
                <td className="px-4 py-3"><Link to={`/testing-centre/runs/${r.id}`} className="text-blue-400">{r.run_name}</Link></td>
                <td className="px-4 py-3"><AdminBadge label={r.status} variant={VARIANT[r.status] || 'neutral'} /></td>
                <td className="px-4 py-3">{r.passed_count}/{r.failed_count}/{r.skipped_count}</td>
                <td className="px-4 py-3">{r.environment}</td>
                <td className="px-4 py-3">{formatDate(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
