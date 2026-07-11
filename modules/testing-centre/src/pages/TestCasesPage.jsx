import { useEffect, useMemo, useState } from 'react'
import { fetchAllTestCases, fetchTestSuites } from '@nidus-admin/shared'
import { EmptyState, inputClass, LoadingState } from '@nidus-admin/ui'

export default function TestCasesPage() {
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState([])
  const [filter, setFilter] = useState({ module: '', type: '', priority: '' })

  useEffect(() => {
    fetchAllTestCases().then(({ data }) => {
      setCases(data || [])
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => cases.filter((c) => {
    const suite = c.test_suites
    if (filter.module && suite?.module !== filter.module) return false
    if (filter.type && c.test_type !== filter.type) return false
    if (filter.priority && c.priority !== filter.priority) return false
    return true
  }), [cases, filter])

  if (loading) return <LoadingState message="Loading test cases..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-100">Test Case Library</h1>
      <div className="flex flex-wrap gap-2">
        <select className={inputClass} value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
          <option value="">All types</option>
          {['e2e', 'api', 'unit', 'access_control'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={inputClass} value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
          <option value="">All priorities</option>
          {['critical', 'high', 'medium', 'low'].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {!filtered.length ? <EmptyState title="No test cases" description="Seed the test catalog or run Playwright to populate cases." /> : (
        <div className="overflow-x-auto rounded-lg border border-gray-700">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Path</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{c.case_name}</td>
                  <td className="px-4 py-3">{c.test_suites?.module || '—'}</td>
                  <td className="px-4 py-3">{c.test_type}</td>
                  <td className="px-4 py-3">{c.priority}</td>
                  <td className="px-4 py-3 text-gray-500">{c.page_path || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
