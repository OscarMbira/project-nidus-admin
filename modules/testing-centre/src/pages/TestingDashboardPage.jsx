import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CLI_COMMANDS,
  fetchTcDiagnosticSessions,
  fetchTestDashboardStats,
  fetchTestRuns,
  formatDate,
} from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, LoadingState } from '@nidus-admin/ui'

const STATUS_VARIANT = { completed: 'success', running: 'info', failed: 'danger', pending: 'warning', cancelled: 'neutral' }

export default function TestingDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [runs, setRuns] = useState([])
  const [diag, setDiag] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchTestDashboardStats(),
      fetchTestRuns({ limit: 10 }),
      fetchTcDiagnosticSessions(1),
    ]).then(([s, r, d]) => {
      setStats(s.data)
      setRuns(r.data || [])
      setDiag(d.data?.[0] || null)
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading testing centre..." />

  const columns = [
    { key: 'run_name', label: 'Run' },
    { key: 'status', label: 'Status', render: (row) => <AdminBadge label={row.status} variant={STATUS_VARIANT[row.status] || 'neutral'} /> },
    { key: 'passed_count', label: 'Pass' },
    { key: 'failed_count', label: 'Fail' },
    { key: 'created_at', label: 'Date', render: (row) => formatDate(row.created_at) },
    { key: 'id', label: '', render: (row) => <Link to={`/testing-centre/runs/${row.id}`} className="text-blue-400 text-sm">Detail</Link> },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Testing Centre</h1>
        <p className="text-sm text-gray-500">E2E automation, evidence, diagnostics, and defect tracking</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminCard title="Test Cases" value={stats?.totalCases ?? 0} />
        <AdminCard title="Suites" value={stats?.totalSuites ?? 0} />
        <AdminCard title="Pass Rate" value={`${stats?.passRate ?? 0}%`} />
        <AdminCard title="Coverage" value={`${stats?.coveragePercent ?? 0}%`} />
        <AdminCard title="Last Diagnostic" value={diag?.overall_status || '—'} />
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-2 text-lg text-gray-200">Run via CLI</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(CLI_COMMANDS).map(([k, cmd]) => (
            <code key={k} className="block rounded bg-gray-950 p-2 text-xs text-blue-300">{cmd}</code>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-lg text-gray-200">Recent Runs</h2>
        <AdminTable columns={columns} rows={runs} />
      </div>
    </div>
  )
}
