import { useEffect, useMemo, useState } from 'react'
import { fetchAdminSessions, fetchAdminUsers, formatDate } from '@nidus-admin/shared'
import { AdminCard, AdminTable, EmptyState, LoadingState } from '@nidus-admin/ui'

function formatDuration(startedAt, endedAt, isActive) {
  if (!startedAt) return '—'
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const suffix = isActive && !endedAt ? ' (active)' : ''
  return `${hours}h ${minutes}m ${seconds}s${suffix}`
}

export default function SessionHistoryPage() {
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [adminUserFilter, setAdminUserFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    const [sessionsRes, usersRes] = await Promise.all([
      fetchAdminSessions({ limit: 1000 }),
      fetchAdminUsers({ limit: 500 }),
    ])
    if (sessionsRes.error) {
      setError(sessionsRes.error.message || String(sessionsRes.error))
      setRows([])
      setLoading(false)
      return
    }
    setRows(sessionsRes.data || [])
    setUsers(usersRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [])

  const adminNameMap = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user.full_name || user.email || user.id])),
    [users],
  )

  const filteredRows = useMemo(() => {
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null
    return rows.filter((row) => {
      if (adminUserFilter !== 'all' && row.admin_user_id !== adminUserFilter) return false
      if (statusFilter === 'active' && !row.is_active) return false
      if (statusFilter === 'expired' && row.is_active) return false
      const startedTime = row.started_at ? new Date(row.started_at).getTime() : null
      if (fromDate && startedTime && startedTime < fromDate) return false
      if (toDate && startedTime && startedTime > toDate) return false
      return true
    })
  }, [rows, adminUserFilter, statusFilter, dateFrom, dateTo])

  const activeCount = filteredRows.filter((row) => row.is_active).length

  if (loading) return <LoadingState message="Loading admin session history..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Session History</h1>
        <p className="text-sm text-gray-500">Inspect admin login sessions with status and session duration metrics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Admin User</span>
          <select
            value={adminUserFilter}
            onChange={(event) => setAdminUserFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All admins</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.full_name || user.email || user.id}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Date From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Date To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Session State</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="expired">Expired/Ended</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Visible sessions" value={filteredRows.length} />
        <AdminCard title="Active" value={activeCount} />
        <AdminCard title="Expired/Ended" value={filteredRows.length - activeCount} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No sessions found" description="No session records match the selected filters." />
      ) : (
        <AdminTable
          rows={filteredRows}
          columns={[
            { key: 'admin_user_id', label: 'Admin User', render: (r) => adminNameMap[r.admin_user_id] || r.admin_user_id || '—' },
            { key: 'ip_address', label: 'IP Address', render: (r) => r.ip_address || '—' },
            { key: 'started_at', label: 'Started', render: (r) => formatDate(r.started_at) },
            { key: 'expires_at', label: 'Expires', render: (r) => formatDate(r.expires_at) },
            { key: 'ended_at', label: 'Ended', render: (r) => formatDate(r.ended_at) },
            {
              key: 'status',
              label: 'State',
              render: (r) => (r.is_active ? 'Active' : (r.ended_at ? 'Ended' : 'Expired')),
            },
            {
              key: 'duration',
              label: 'Session Duration',
              sortable: false,
              render: (r) => formatDuration(r.started_at, r.ended_at || r.expires_at, r.is_active),
            },
          ]}
        />
      )}
    </div>
  )
}
