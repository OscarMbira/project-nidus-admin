import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLinkedTestDefects, formatDate } from '@nidus-admin/shared'
import { EmptyState, LoadingState } from '@nidus-admin/ui'

export default function DefectsPage() {
  const [loading, setLoading] = useState(true)
  const [bugs, setBugs] = useState([])

  useEffect(() => {
    fetchLinkedTestDefects().then(({ data }) => {
      setBugs(data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading defects..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-semibold text-gray-100">Defect Tracker</h1>
      <p className="text-sm text-gray-500">Bugs linked to test runs from the Testing Centre.</p>
      {!bugs.length ? <EmptyState title="No linked defects" description="Log defects from a failed test run detail page." /> : (
        <table className="min-w-full text-sm text-gray-200 border border-gray-700 rounded-lg overflow-hidden">
          <thead className="bg-gray-800 text-xs uppercase text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Severity</th>
              <th className="px-4 py-3 text-left">Run</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {bugs.map((b) => (
              <tr key={b.id} className="border-t border-gray-800">
                <td className="px-4 py-3">
                  <Link to={`/feedback/bug-tracking?bug=${b.id}`} className="text-blue-400">{b.title}</Link>
                </td>
                <td className="px-4 py-3">{b.status}</td>
                <td className="px-4 py-3">{b.severity}</td>
                <td className="px-4 py-3">
                  {b.linked_test_run_id && (
                    <Link to={`/testing-centre/runs/${b.linked_test_run_id}`} className="text-blue-400 text-xs">View run</Link>
                  )}
                </td>
                <td className="px-4 py-3">{formatDate(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
