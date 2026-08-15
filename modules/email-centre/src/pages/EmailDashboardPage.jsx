import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchEnhancedEmailSendLog, getEmailAnalytics } from '@nidus-admin/shared'
import { AdminCard, LoadingState } from '@nidus-admin/ui'

export default function EmailDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    Promise.all([getEmailAnalytics(30), fetchEnhancedEmailSendLog({ limit: 10 })]).then(([a, r]) => {
      setStats(a.data || {})
      setRecent(r.data || [])
      setLoading(false)
    })
  }, [])

  if (loading) return <LoadingState message="Loading email dashboard..." />

  const cards = [
    { label: 'Sent (30d)', value: stats.total_sent ?? 0, to: '/email-centre/send-log?status=sent' },
    { label: 'Failed', value: stats.total_failed ?? 0, to: '/email-centre/send-log?status=failed' },
    { label: 'Bounced', value: stats.total_bounced ?? 0, to: '/email-centre/send-log?status=bounced' },
    // Delivery rate is a percentage — no target (v206 rule 17).
    { label: 'Delivery rate', value: `${stats.delivery_rate_pct ?? 0}%` },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Email Centre</h1>
          <p className="text-sm text-gray-500">Admin-initiated email dispatch, campaigns, and delivery analytics.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/email-centre/compose" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Compose</Link>
          <Link to="/email-centre/campaigns" className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-200">Campaigns</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <AdminCard key={c.label} title={c.label} onClick={c.to ? () => navigate(c.to) : undefined}>
            <p className="text-3xl font-semibold text-gray-100">{c.value}</p>
          </AdminCard>
        ))}
      </div>

      <AdminCard title="Recent sends">
        {!recent.length ? (
          <p className="text-sm text-gray-500">No sends yet.</p>
        ) : (
          <ul className="divide-y divide-gray-800 text-sm">
            {recent.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 py-2">
                <span className="truncate text-gray-200">{row.recipient_email}</span>
                <span className="shrink-0 text-gray-500">{row.status}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/email-centre/send-log" className="mt-3 inline-block text-sm text-blue-400">View full send log</Link>
      </AdminCard>
    </div>
  )
}
