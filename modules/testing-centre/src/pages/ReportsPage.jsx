import { useEffect, useState } from 'react'
import {
  exportToFile,
  fetchFlakyTests,
  fetchTestDashboardStats,
  fetchTestRuns,
  generateExportFilename,
} from '@nidus-admin/shared'
import { AdminCard, LoadingState } from '@nidus-admin/ui'

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [runs, setRuns] = useState([])
  const [flaky, setFlaky] = useState([])

  useEffect(() => {
    Promise.all([
      fetchTestDashboardStats(),
      fetchTestRuns({ limit: 30 }),
      fetchFlakyTests(),
    ]).then(([s, r, f]) => {
      setStats(s.data)
      setRuns(r.data || [])
      setFlaky(f.data || [])
      setLoading(false)
    })
  }, [])

  const exportCsv = () => {
    exportToFile(
      runs.map((r) => ({
        run_name: r.run_name,
        status: r.status,
        passed: r.passed_count,
        failed: r.failed_count,
        created_at: r.created_at,
      })),
      generateExportFilename('test-runs', 'csv'),
      'csv',
    )
  }

  if (loading) return <LoadingState message="Loading reports..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-100">Reports</h1>
        <button type="button" onClick={exportCsv} className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-200">Export CSV</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title="Coverage" value={`${stats?.coveragePercent ?? 0}%`} />
        <AdminCard title="Pass rate (last run)" value={`${stats?.passRate ?? 0}%`} />
        <AdminCard title="Flaky cases (10 runs)" value={flaky.length} />
      </div>

      <div>
        <h2 className="mb-2 text-lg text-gray-200">Pass rate trend (last 30 runs)</h2>
        <div className="flex h-24 items-end gap-1">
          {runs.slice(0, 30).reverse().map((r) => {
            const pct = r.total_tests ? (r.passed_count / r.total_tests) * 100 : 0
            return (
              <div
                key={r.id}
                title={`${r.run_name}: ${Math.round(pct)}%`}
                className="flex-1 bg-blue-600/80 rounded-t"
                style={{ height: `${Math.max(4, pct)}%` }}
              />
            )
          })}
        </div>
      </div>

      {stats?.coverageMatrix?.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg text-gray-200">Role coverage heatmap</h2>
          <table className="text-sm text-gray-300">
            <tbody>
              {stats.coverageMatrix.map((row) => (
                <tr key={`${row.module}-${row.target_role}`}>
                  <td className="pr-4 py-1">{row.module}</td>
                  <td className="pr-4">{row.target_role}</td>
                  <td>
                    <span className={`inline-block h-3 w-16 rounded ${row.pass_rate >= 80 ? 'bg-emerald-600' : row.pass_rate >= 50 ? 'bg-amber-600' : 'bg-red-600'}`} />
                    {' '}{row.pass_rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
