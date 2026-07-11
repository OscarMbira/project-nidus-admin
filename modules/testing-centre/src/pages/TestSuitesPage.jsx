import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTestCases, fetchTestSuites, createTestRun } from '@nidus-admin/shared'
import { EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

export default function TestSuitesPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [suites, setSuites] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [cases, setCases] = useState([])

  useEffect(() => {
    fetchTestSuites().then(({ data }) => {
      setSuites(data || [])
      setLoading(false)
    })
  }, [])

  const loadCases = async (suiteId) => {
    setExpanded(suiteId)
    const { data } = await fetchTestCases(suiteId)
    setCases(data || [])
  }

  const triggerRun = async (suite) => {
    const { error } = await createTestRun(`Suite: ${suite.suite_name}`, [suite.id], suite.target_role)
    if (error) showError(error)
    else showSuccess('Test run created — execute CLI to run Playwright.')
  }

  if (loading) return <LoadingState message="Loading suites..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-100">Test Suites</h1>
      {!suites.length ? <EmptyState title="No suites" /> : (
        <div className="space-y-3">
          {suites.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-100">{s.suite_name}</p>
                  <p className="text-xs text-gray-500">{s.system} / {s.module} / {s.target_role} — {s.test_count} cases</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-sm text-blue-400" onClick={() => loadCases(s.id)}>View cases</button>
                  <button type="button" className="rounded bg-emerald-700 px-2 py-1 text-xs text-white" onClick={() => triggerRun(s)}>Trigger run</button>
                </div>
              </div>
              {expanded === s.id && (
                <ul className="mt-3 space-y-1 border-t border-gray-800 pt-3 text-sm text-gray-400">
                  {cases.map((c) => <li key={c.id}>{c.case_name}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500">Runs are recorded in admin.test_runs; execute <Link to="/testing-centre" className="text-blue-400">CLI commands</Link> to populate results.</p>
    </div>
  )
}
