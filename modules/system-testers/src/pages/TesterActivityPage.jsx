import { useEffect, useState } from 'react'
import {
  enrichTestersWithUsers,
  exportToFile,
  fetchSystemTesters,
  fetchTesterActivity,
  formatDate,
  generateExportFilename,
} from '@nidus-admin/shared'
import { EmptyState, LoadingState, useToast } from '@nidus-admin/ui'
import { toError } from '../utils/testerUi.js'

export default function TesterActivityPage() {
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [testers, setTesters] = useState([])
  const [activity, setActivity] = useState({ audit: [], bugs: [], featureRequests: [] })

  useEffect(() => {
    ;(async () => {
      const { data, error } = await fetchSystemTesters({ limit: 500 })
      if (error) showError(toError(error))
      const enriched = await enrichTestersWithUsers(data || [])
      setTesters(enriched)
      const userIds = enriched.map((t) => t.user_id).filter(Boolean)
      const actRes = await fetchTesterActivity(userIds)
      if (actRes.error) showError(toError(actRes.error))
      setActivity(actRes.data || { audit: [], bugs: [], featureRequests: [] })
      setLoading(false)
    })()
  }, [])

  const exportCsv = () => {
    const rows = testers.map((t) => ({
      email: t.email,
      status: t.status,
      systems: (t.target_systems || []).join(';'),
      moratorium_end: t.moratorium_end,
      bugs_submitted: activity.bugs.filter((b) => b.reporter_id === t.user_id).length,
      features_submitted: activity.featureRequests.filter((f) => f.user_id === t.user_id).length,
    }))
    exportToFile(rows, generateExportFilename('tester-activity', 'csv'), 'csv')
  }

  if (loading) return <LoadingState message="Loading tester activity..." />

  const testerByUserId = Object.fromEntries(testers.map((t) => [t.user_id, t]))

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Tester Activity</h1>
          <p className="text-sm text-gray-500">Feedback, bug reports, and audit signals per tester.</p>
        </div>
        <button type="button" className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-200" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      {!testers.length ? (
        <EmptyState title="No testers" description="Activity appears once testers are granted." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
            <table className="min-w-full text-sm text-gray-200">
              <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">Tester</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Bug reports</th>
                  <th className="px-4 py-3">Feature requests</th>
                </tr>
              </thead>
              <tbody>
                {testers.map((t) => (
                  <tr key={t.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">{t.email}</td>
                    <td className="px-4 py-3 capitalize">{t.status}</td>
                    <td className="px-4 py-3">{activity.bugs.filter((b) => b.reporter_id === t.user_id).length}</td>
                    <td className="px-4 py-3">{activity.featureRequests.filter((f) => f.user_id === t.user_id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-medium text-gray-200">Recent bug reports from testers</h2>
            {!activity.bugs.length ? (
              <p className="text-sm text-gray-500">No bug reports from testers yet.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-300">
                {activity.bugs.slice(0, 15).map((b) => (
                  <li key={b.id} className="rounded border border-gray-800 bg-gray-900 px-3 py-2">
                    <span className="text-gray-400">{formatDate(b.created_at)}</span>
                    {' — '}
                    <strong>{b.title}</strong>
                    {' '}
                    <span className="text-gray-500">({testerByUserId[b.reporter_id]?.email || b.reporter_id})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
