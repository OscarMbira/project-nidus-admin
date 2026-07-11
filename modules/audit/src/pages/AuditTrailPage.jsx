import { Fragment, useEffect, useMemo, useState } from 'react'
import { exportToFile, fetchAdminUsers, fetchAuditLog, formatDate, generateExportFilename } from '@nidus-admin/shared'
import {
  EmptyState,
  AuditRecordDiffPanel,
  formatAuditActionLabel,
  LoadingState,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 20

export default function AuditTrailPage() {
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [targetFilter, setTargetFilter] = useState('all')
  const [adminUserFilter, setAdminUserFilter] = useState('all')
  const [expandedRowId, setExpandedRowId] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])

  const loadRows = async (exportAll = false, format = 'csv') => {
    setLoading(!exportAll)
    setError(null)

    const filters = []
    if (dateFrom) filters.push({ op: 'gte', col: 'created_at', val: `${dateFrom}T00:00:00` })
    if (dateTo) filters.push({ op: 'lte', col: 'created_at', val: `${dateTo}T23:59:59` })
    if (actionFilter !== 'all') filters.push({ op: 'eq', col: 'action', val: actionFilter })
    if (targetFilter !== 'all') filters.push({ op: 'eq', col: 'target_type', val: targetFilter })
    if (adminUserFilter !== 'all') filters.push({ op: 'eq', col: 'admin_user_id', val: adminUserFilter })

    const range = exportAll ? undefined : { from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 }

    const [auditRes, usersRes] = await Promise.all([
      fetchAuditLog({
        filters,
        range,
        limit: exportAll ? 5000 : PAGE_SIZE,
        count: !exportAll,
      }),
      fetchAdminUsers({ limit: 500 }),
    ])

    if (usersRes.data) setAdminUsers(usersRes.data || [])

    if (auditRes.error) {
      const message = auditRes.error.message || String(auditRes.error)
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
      const exportRows = (auditRes.data || []).map((row) => ({
        id: row.id,
        action: row.action,
        admin_user: exportAdminMap[row.admin_user_id] || row.admin_user_id || '—',
        admin_role: row.admin_role || '—',
        target_type: row.target_type || '—',
        target_id: row.target_id || '—',
        created_at: row.created_at,
      }))
      const { error: exportError } = exportToFile(
        exportRows,
        [
          { key: 'id', label: 'ID' },
          { key: 'action', label: 'Action' },
          { key: 'admin_user', label: 'Admin User' },
          { key: 'admin_role', label: 'Admin Role' },
          { key: 'target_type', label: 'Target Type' },
          { key: 'target_id', label: 'Target ID' },
          { key: 'created_at', label: 'Created At' },
        ],
        generateExportFilename('audit_trail', { action: actionFilter, target: targetFilter }, format),
        format,
      )
      if (exportError) showError(exportError)
      else showSuccess(`Audit trail exported as ${format.toUpperCase()}.`)
      setLoading(false)
      return
    }

    setRows(auditRes.data || [])
    setCount(auditRes.count || 0)
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [page, dateFrom, dateTo, actionFilter, targetFilter, adminUserFilter])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, actionFilter, targetFilter, adminUserFilter])

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  const actionOptions = useMemo(
    () => [...new Set(rows.map((row) => row.action).filter(Boolean))],
    [rows],
  )

  const targetOptions = useMemo(
    () => [...new Set(rows.map((row) => row.target_type).filter(Boolean))],
    [rows],
  )

  if (loading) return <LoadingState message="Loading audit trail..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Audit Trail</h1>
          <p className="text-sm text-gray-500">Filter audit events, inspect before/after diffs, and export full filtered history.</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All actions</option>
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
        <label className="text-sm">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Target Type</span>
          <select
            value={targetFilter}
            onChange={(event) => setTargetFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All targets</option>
            {targetOptions.map((target) => (
              <option key={target} value={target}>{target}</option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No audit logs found" description="No rows match the current filter set." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Admin User</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Diff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isExpanded = expandedRowId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <div className="text-gray-100">{formatAuditActionLabel(row.action)}</div>
                        <div className="text-xs text-gray-500">{row.action || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-100">{adminNameMap[row.admin_user_id] || row.admin_user_id || '—'}</div>
                        <div className="text-xs text-gray-500">{row.admin_role || '—'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.target_type || '—'}</div>
                        <div className="text-xs text-gray-500">{row.target_id || '—'}</div>
                      </td>
                      <td className="px-4 py-3">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedRowId((prev) => (prev === row.id ? null : row.id))}
                          className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700"
                        >
                          {isExpanded ? 'Hide Diff' : 'Expand Diff'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-gray-800 bg-gray-950/70">
                        <td colSpan={5} className="px-4 py-4">
                          <AuditRecordDiffPanel
                            action={row.action}
                            previousValue={row.previous_value}
                            newValue={row.new_value}
                            targetDetails={row.target_details}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
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
