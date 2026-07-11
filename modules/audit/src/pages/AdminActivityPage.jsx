import { useEffect, useMemo, useState } from 'react'
import { exportToFile, fetchAdminActivity, fetchAdminUsers, formatDate, generateExportFilename } from '@nidus-admin/shared'
import { AdminTable, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

const PAGE_SIZE = 20

export default function AdminActivityPage() {
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionTypeFilter, setActionTypeFilter] = useState('all')
  const [adminUserFilter, setAdminUserFilter] = useState('all')
  const [adminUsers, setAdminUsers] = useState([])

  const loadRows = async (exportAll = false, format = 'csv') => {
    setLoading(!exportAll)
    setError(null)

    const filters = []
    if (dateFrom) filters.push({ op: 'gte', col: 'created_at', val: `${dateFrom}T00:00:00` })
    if (dateTo) filters.push({ op: 'lte', col: 'created_at', val: `${dateTo}T23:59:59` })
    if (actionTypeFilter !== 'all') filters.push({ op: 'eq', col: 'action_type', val: actionTypeFilter })
    if (adminUserFilter !== 'all') filters.push({ op: 'eq', col: 'admin_user_id', val: adminUserFilter })

    const range = exportAll ? undefined : { from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 }
    const [activityRes, usersRes] = await Promise.all([
      fetchAdminActivity({
        filters,
        range,
        limit: exportAll ? 5000 : PAGE_SIZE,
        count: !exportAll,
      }),
      fetchAdminUsers({ limit: 500 }),
    ])

    if (usersRes.data) setAdminUsers(usersRes.data || [])

    if (activityRes.error) {
      const message = activityRes.error.message || String(activityRes.error)
      if (!exportAll) {
        setError(message)
        setRows([])
      } else {
        showError(message)
      }
      setLoading(false)
      return
    }

    if (exportAll) {
      const exportAdminMap = Object.fromEntries(
        (usersRes.data || []).map((user) => [user.id, user.full_name || user.email || user.id]),
      )
      const exportRows = (activityRes.data || []).map((row) => ({
        id: row.id,
        action_type: row.action_type || '—',
        action_category: row.action_category || '—',
        admin_user: exportAdminMap[row.admin_user_id] || row.admin_user_id || '—',
        target_type: row.target_type || '—',
        target_name: row.target_name || '—',
        created_at: row.created_at,
      }))
      const { error: exportError } = exportToFile(
        exportRows,
        [
          { key: 'id', label: 'ID' },
          { key: 'action_type', label: 'Action Type' },
          { key: 'action_category', label: 'Category' },
          { key: 'admin_user', label: 'Admin User' },
          { key: 'target_type', label: 'Target Type' },
          { key: 'target_name', label: 'Target Name' },
          { key: 'created_at', label: 'Created At' },
        ],
        generateExportFilename('admin_activity', { action: actionTypeFilter }, format),
        format,
      )
      if (exportError) showError(exportError)
      else showSuccess(`Admin activity exported as ${format.toUpperCase()}.`)
      setLoading(false)
      return
    }

    setRows(activityRes.data || [])
    setCount(activityRes.count || 0)
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [page, dateFrom, dateTo, actionTypeFilter, adminUserFilter])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, actionTypeFilter, adminUserFilter])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const actionOptions = useMemo(
    () => [...new Set(rows.map((row) => row.action_type).filter(Boolean))],
    [rows],
  )
  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  if (loading) return <LoadingState message="Loading admin activity..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Admin Activity</h1>
          <p className="text-sm text-gray-500">Review high-level admin actions and export the filtered activity log.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => loadRows(true, 'csv')}
            className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => loadRows(true, 'json')}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Export JSON
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Action Type</span>
          <select
            value={actionTypeFilter}
            onChange={(event) => setActionTypeFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All action types</option>
            {actionOptions.map((action) => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Admin User</span>
          <select
            value={adminUserFilter}
            onChange={(event) => setAdminUserFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All admins</option>
            {adminUsers.map((user) => (
              <option key={user.id} value={user.id}>{user.full_name || user.email || user.id}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No activity records" description="No admin activity rows match the current filters." />
      ) : (
        <AdminTable
          rows={rows}
          columns={[
            { key: 'action_type', label: 'Action Type', render: (r) => r.action_type || '—' },
            { key: 'action_category', label: 'Category', render: (r) => r.action_category || '—' },
            { key: 'admin_user_id', label: 'Admin User', render: (r) => adminNameMap[r.admin_user_id] || r.admin_user_id || '—' },
            { key: 'target_type', label: 'Target Type', render: (r) => r.target_type || '—' },
            { key: 'target_name', label: 'Target Name', render: (r) => r.target_name || '—' },
            { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
          ]}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Showing {count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, count)} of {count}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
