import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { AdminCard, LoadingState } from '@nidus-admin/ui'
import { ROLE_LABELS, fetchDashboardStats, ReleaseReadinessBannerGate } from '@nidus-admin/shared'

const QUICK_LINKS = {
  super_admin: [
    { label: 'Pending Activations', to: '/admin-mgmt/pending-activations' },
    { label: 'Unassigned Tickets', to: '/support/support-ticket-list' },
    { label: 'Critical Errors', to: '/errors/error-dashboard' },
  ],
  system_admin: [
    { label: 'User List', to: '/users/user-list' },
    { label: 'Subscriptions', to: '/subscriptions/subscription-list' },
    { label: 'System Settings', to: '/system/system-settings' },
  ],
  support_admin: [
    { label: 'Open Tickets', to: '/support/support-ticket-list' },
    { label: 'Impersonation', to: '/support/user-impersonation' },
    { label: 'Announcements', to: '/support/announcements' },
  ],
  content_admin: [
    { label: 'Scenarios', to: '/simulator/sim-scenario-admin' },
    { label: 'Certificates', to: '/simulator/sim-certificate-admin' },
    { label: 'Leaderboard', to: '/simulator/sim-leaderboard-admin' },
  ],
}

function formatValue(key, value) {
  if (value == null) return '—'
  if (key === 'mrr' || key === 'monthly_mrr') return `$${Number(value).toLocaleString()}`
  if (Array.isArray(value)) return String(value.length)
  if (typeof value === 'object') return '—'
  return String(value)
}

// Count/sum cards get a `to` target (v893/rule 17); average/percentage/blended cards and
// windowed "last N" samples (recent_errors, recent_certificates, leaderboard_top all cap at
// 10 via LIMIT in get_dashboard_stats() — not a true filterable total) are left without one.
function buildCards(role, stats) {
  if (!stats) return []
  if (role === 'super_admin') {
    return [
      { title: 'Active Users', value: stats.active_users, trend: 'Platform auth users', to: '/users/user-list' },
      { title: 'MRR Estimate', value: formatValue('mrr', stats.mrr), trend: 'Monthly recurring revenue' },
      { title: 'Pending Activations', value: stats.pending_activations, trend: 'Awaiting approval', to: '/admin-mgmt/pending-activations' },
      { title: 'Critical Errors', value: stats.critical_errors, trend: 'Unresolved critical', to: '/errors/error-dashboard?severity=critical' },
    ]
  }
  if (role === 'system_admin') {
    const sub = stats.subscription_summary || {}
    return [
      { title: 'Active Users', value: stats.active_users, trend: 'Platform users', to: '/users/user-list' },
      { title: 'Active Subscriptions', value: sub.active, trend: `${sub.trialing ?? 0} trialing`, to: '/subscriptions/subscription-list?status=active' },
      { title: 'Open Tickets', value: stats.open_tickets, trend: 'Needs attention', to: '/support/support-ticket-list?filter=open' },
      { title: 'Feature Flags', value: stats.feature_flags_count, trend: 'Total configured', to: '/system/feature-flags' },
    ]
  }
  if (role === 'support_admin') {
    return [
      { title: 'Open Tickets', value: stats.open_tickets, trend: 'All open statuses', to: '/support/support-ticket-list?filter=open' },
      { title: 'Assigned Tickets', value: stats.assigned_tickets, trend: 'Currently assigned', to: '/support/support-ticket-list?filter=assigned_open' },
      { title: 'Recent Errors', value: (stats.recent_errors || []).length, trend: 'Last 10 aggregations' },
      { title: 'Impersonations (30d)', value: stats.impersonation_count, trend: 'Audit log entries', to: '/support/user-impersonation' },
    ]
  }
  return [
    { title: 'Total Scenarios', value: stats.scenario_count, trend: 'All scenarios', to: '/simulator/sim-scenario-admin' },
    { title: 'Active Scenarios', value: stats.active_scenarios, trend: 'Currently active', to: '/simulator/sim-scenario-admin?status=active' },
    { title: 'Recent Certificates', value: (stats.recent_certificates || []).length, trend: 'Last 10 issued' },
    { title: 'Leaderboard Top', value: (stats.leaderboard_top || []).length, trend: 'Top entries' },
  ]
}

function RecentList({ title, items, renderItem }) {
  if (!items?.length) return null
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">{title}</h2>
      <ul className="space-y-2 text-sm">
        {items.slice(0, 5).map((item) => (
          <li key={item.id} className="rounded border border-gray-800 bg-gray-950 px-3 py-2 text-gray-300">
            {renderItem(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AdminDashboard() {
  const { role, adminUser } = useAdminAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!role) return
    setLoading(true)
    fetchDashboardStats(role)
      .then(({ data, error: err }) => {
        if (err) setError(typeof err === 'string' ? err : err?.message)
        else setStats(data)
        setLoading(false)
      })
      .catch((e) => { setError(e.message); setLoading(false) })
  }, [role])

  const cards = buildCards(role, stats)
  const links = QUICK_LINKS[role] || QUICK_LINKS.system_admin

  if (loading) return <LoadingState message="Loading dashboard..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Welcome, {adminUser?.full_name} — {ROLE_LABELS[role]}
        </p>
        {error && <p className="mt-1 text-sm text-amber-400">Stats unavailable: {error}</p>}
      </div>

      <ReleaseReadinessBannerGate variant="card" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <AdminCard key={c.title} title={c.title} value={c.value ?? '—'} trend={c.trend} to={c.to} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {role === 'super_admin' && (
          <RecentList
            title="Recent Admin Activity"
            items={stats?.recent_audit}
            renderItem={(e) => (
              <span>
                <span className="text-gray-500">{new Date(e.created_at).toLocaleString()}</span>
                {' · '}
                {e.action}
              </span>
            )}
          />
        )}
        {role === 'support_admin' && (
          <RecentList
            title="Recent Issues"
            items={stats?.recent_errors}
            renderItem={(e) => (
              <span>
                <span className={`mr-2 uppercase text-xs ${e.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`}>
                  {e.severity}
                </span>
                {e.error_message?.slice(0, 80)}
              </span>
            )}
          />
        )}
        {role === 'content_admin' && (
          <RecentList
            title="Recently Issued Certificates"
            items={stats?.recent_certificates}
            renderItem={(c) => (
              <span>{c.certificate_name} — {new Date(c.issue_date).toLocaleDateString()}</span>
            )}
          />
        )}
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">Quick Links</h2>
        <div className="flex flex-wrap gap-3">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:border-blue-600 hover:text-blue-300"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
