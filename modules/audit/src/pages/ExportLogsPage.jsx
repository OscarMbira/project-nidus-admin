import { useEffect, useState } from 'react'
import { exportAuditLog, fetchAdminActivity, fetchAuditLog, formatDate } from '@nidus-admin/shared'
import { AdminCard, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

export default function ExportLogsPage() {
  const { showSuccess } = useToast()
  const [auditRows, setAuditRows] = useState([])
  const [activityRows, setActivityRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const buildDateFilters = () => {
    const filters = []
    if (dateFrom) filters.push({ op: 'gte', col: 'created_at', val: `${dateFrom}T00:00:00` })
    if (dateTo) filters.push({ op: 'lte', col: 'created_at', val: `${dateTo}T23:59:59` })
    return filters
  }

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    const filters = buildDateFilters()
    const [auditRes, activityRes] = await Promise.all([
      fetchAuditLog({ filters, limit: 5000 }),
      fetchAdminActivity({ filters, limit: 5000 }),
    ])

    if (auditRes.error) {
      setError(auditRes.error.message || String(auditRes.error))
      setLoading(false)
      return
    }
    if (activityRes.error) {
      setError(activityRes.error.message || String(activityRes.error))
      setLoading(false)
      return
    }

    setAuditRows(auditRes.data || [])
    setActivityRows(activityRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [dateFrom, dateTo])

  const exportAudit = (format) => {
    exportAuditLog(auditRows, format)
    showSuccess(`Audit trail exported as ${format.toUpperCase()}.`)
  }

  const exportActivity = (format) => {
    const rows = activityRows.map((row) => ({
      id: row.id,
      action: row.action_type || row.action_category || 'activity',
      admin_role: row.action_category || '—',
      target_type: row.target_type || 'admin_activity',
      target_id: row.target_name || row.id,
      created_at: row.created_at,
    }))
    exportAuditLog(rows, format)
    showSuccess(`Admin activity exported as ${format.toUpperCase()}.`)
  }

  const lastAuditCreatedAt = auditRows[0]?.created_at
  const lastActivityCreatedAt = activityRows[0]?.created_at

  if (loading) return <LoadingState message="Loading Export Logs..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-gray-100">Export Logs</h1>
        <span className="text-sm text-gray-500">Centralized exports for audit and admin activity logs.</span>
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Audit events" value={auditRows.length} />
        <AdminCard title="Activity events" value={activityRows.length} />
        <AdminCard title="Latest audit" value={formatDate(lastAuditCreatedAt)} />
        <AdminCard title="Latest activity" value={formatDate(lastActivityCreatedAt)} />
      </div>

      {auditRows.length === 0 && activityRows.length === 0 ? (
        <EmptyState title="No logs available" description="No rows match the selected date range." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-lg font-medium text-gray-100">Audit Trail Exports</h2>
            <p className="mt-1 text-sm text-gray-500">Includes action, role, target, and timestamp fields from `admin_audit_log`.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => exportAudit('csv')}
                className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => exportAudit('json')}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                Export JSON
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-lg font-medium text-gray-100">Admin Activity Exports</h2>
            <p className="mt-1 text-sm text-gray-500">Exports transformed admin activity rows through the shared audit export utility.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => exportActivity('csv')}
                className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => exportActivity('json')}
                className="rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                Export JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
