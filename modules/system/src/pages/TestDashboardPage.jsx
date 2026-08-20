import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchTestDashboardStats,
  fetchTestRuns,
  CLI_COMMANDS,
  formatDate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
  AdminTable,
  LoadingState,
} from '@nidus-admin/ui'

const STATUS_VARIANT = {
  completed: 'success',
  running: 'info',
  failed: 'danger',
  pending: 'warning',
  cancelled: 'neutral',
}

function CoverageCell({ status }) {
  const colors = { green: 'bg-green-600', yellow: 'bg-yellow-600', red: 'bg-red-600', none: 'bg-gray-600' }
  return <span className={`inline-block h-3 w-3 rounded-full ${colors[status] || colors.none}`} title={status} />
}

export default function TestDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [runs, setRuns] = useState([])

  useEffect(() => {
    Promise.all([fetchTestDashboardStats(), fetchTestRuns({ limit: 10 })])
      .then(([statsRes, runsRes]) => {
        setStats(statsRes.data)
        setRuns(runsRes.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState message="Loading test dashboard..." />

  const runColumns = [
    { key: 'run_name', label: 'Run' },
    { key: 'status', label: 'Status', render: (row) => <AdminBadge label={row.status} variant={STATUS_VARIANT[row.status] || 'neutral'} /> },
    { key: 'trigger_type', label: 'Trigger' },
    { key: 'passed_count', label: 'Passed' },
    { key: 'failed_count', label: 'Failed' },
    { key: 'duration_ms', label: 'Duration', render: (row) => row.duration_ms ? `${Math.round(row.duration_ms / 1000)}s` : '—' },
    { key: 'created_at', label: 'Started', render: (row) => formatDate(row.created_at) },
    { key: 'id', label: '', render: (row) => (
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/test-run-detail?runId=${row.id}`)} />
    ) },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Test Dashboard</h1>
        <p className="text-sm text-gray-500">E2E automation across Admin, Platform, and Simulator</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminCard title="Total Suites" value={stats?.totalSuites ?? 0} />
        <AdminCard title="Total Cases" value={stats?.totalCases ?? 0} />
        <AdminCard title="Last Pass Rate" value={`${stats?.passRate ?? 0}%`} />
        <AdminCard title="Coverage" value={`${stats?.coveragePercent ?? 0}%`} />
        <AdminCard title="Auto-Fix Success" value={`${stats?.autoFixSuccessRate ?? 0}%`} />
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-medium text-gray-200">Run Tests</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(CLI_COMMANDS).map(([key, cmd]) => (
            <div key={key} className="rounded border border-gray-700 bg-gray-800/50 p-3">
              <p className="mb-1 text-xs uppercase text-gray-500">{key}</p>
              <code className="block truncate text-sm text-blue-300">{cmd}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-medium text-gray-200">Coverage Matrix</h2>
        {(stats?.coverageMatrix || []).length === 0 ? (
          <p className="text-sm text-gray-500">No coverage data yet. Run tests and seed the catalog.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="p-2">System</th>
                  <th className="p-2">Module</th>
                  <th className="p-2">Role</th>
                  <th className="p-2">Cases</th>
                  <th className="p-2">Pass Rate</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.coverageMatrix.map((row) => (
                  <tr key={`${row.system}-${row.module}-${row.target_role}`} className="border-b border-gray-800">
                    <td className="p-2 text-gray-300">{row.system}</td>
                    <td className="p-2 text-gray-300">{row.module}</td>
                    <td className="p-2 text-gray-300">{row.target_role}</td>
                    <td className="p-2 text-gray-300">{row.total_cases}</td>
                    <td className="p-2 text-gray-300">{row.pass_rate}%</td>
                    <td className="p-2"><CoverageCell status={row.coverage_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-gray-200">Recent Runs</h2>
        <AdminTable columns={runColumns} rows={runs} />
      </div>
    </div>
  )
}
