import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { fetchTestSuiteById, fetchTestCases, fetchTestRuns, formatDate } from '@nidus-admin/shared'
import { AdminBadge, LoadingState, AdminTable } from '@nidus-admin/ui'

export default function TestSuiteDetailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const suiteId = params.get('suiteId')
  const [loading, setLoading] = useState(true)
  const [suite, setSuite] = useState(null)
  const [cases, setCases] = useState([])
  const [runs, setRuns] = useState([])

  useEffect(() => {
    if (!suiteId) { setLoading(false); return }
    Promise.all([
      fetchTestSuiteById(suiteId),
      fetchTestCases(suiteId),
      fetchTestRuns({ limit: 20 }),
    ]).then(([suiteRes, casesRes, runsRes]) => {
      setSuite(suiteRes.data)
      setCases(casesRes.data || [])
      setRuns(runsRes.data || [])
      setLoading(false)
    })
  }, [suiteId])

  if (loading) return <LoadingState message="Loading suite..." />
  if (!suite) return <div className="p-6 text-gray-400">Suite not found.</div>

  const caseColumns = [
    { key: 'case_name', label: 'Test Case' },
    { key: 'test_type', label: 'Type' },
    { key: 'priority', label: 'Priority', render: (row) => <AdminBadge label={row.priority} variant={row.priority} /> },
    { key: 'page_path', label: 'Path' },
    { key: 'operation', label: 'Operation' },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/system/test-dashboard')} className="text-sm text-blue-400 hover:underline">
        ← Back to Dashboard
      </button>
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{suite.suite_name}</h1>
        <p className="text-sm text-gray-500">
          {suite.system} · {suite.module} · {suite.target_role} · {suite.test_count} cases
        </p>
      </div>
      <AdminTable columns={caseColumns} rows={cases} />
      <div>
        <h2 className="mb-2 text-lg text-gray-200">Run History</h2>
        <AdminTable
          columns={[
            { key: 'run_name', label: 'Run' },
            { key: 'status', label: 'Status' },
            { key: 'created_at', label: 'Date', render: (row) => formatDate(row.created_at) },
            { key: 'id', label: '', render: (row) => (
              <button type="button" className="text-blue-400 hover:underline" onClick={() => navigate(`/system/test-run-detail?runId=${row.id}`)}>
                View
              </button>
            ) },
          ]}
          rows={runs}
        />
      </div>
    </div>
  )
}
