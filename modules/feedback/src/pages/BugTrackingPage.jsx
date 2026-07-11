import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assignBugReport,
  fetchAdminUsers,
  fetchBugReports,
  formatDate,
  PermissionGate,
  rejectBugReport,
  setBugReportStatus,
  updateBugReport,
  useBulkSelection,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminField,
  AdminModal,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12
const STATUS_FILTERS = ['all', 'new', 'assigned', 'in_progress', 'fixed', 'verified', 'closed', 'rejected']
const PRIORITY_FILTERS = ['all', 'p0', 'p1', 'p2', 'p3']
const TERMINAL_STATUSES = ['closed', 'rejected']
const ASSIGNABLE_ROLES = ['super_admin', 'system_admin', 'support_admin']

const statusVariant = (status) => {
  if (status === 'closed' || status === 'verified') return 'active'
  if (status === 'rejected') return 'rejected'
  if (status === 'fixed') return 'success'
  if (status === 'in_progress') return 'retrying'
  if (status === 'assigned' || status === 'new') return 'pending'
  return 'default'
}

export default function BugTrackingPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [detailRow, setDetailRow] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null)
  const [assigneeId, setAssigneeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [bulkModal, setBulkModal] = useState({ open: false, status: null })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [bugsRes, adminsRes] = await Promise.all([
      fetchBugReports(),
      fetchAdminUsers({ filters: [{ op: 'eq', col: 'activation_status', val: 'active' }] }),
    ])
    if (bugsRes.error) {
      setError(bugsRes.error.message || String(bugsRes.error))
      setRows([])
    } else {
      setRows(bugsRes.data || [])
    }
    if (!adminsRes.error) {
      setAdmins((adminsRes.data || []).filter((a) => ASSIGNABLE_ROLES.includes(a.role)))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (priorityFilter !== 'all' && row.priority !== priorityFilter) return false
      if (!query) return true
      return [row.title, row.description, row.status, row.priority, row.severity]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, priorityFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, priorityFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const runMutation = async (action, successMessage) => {
    const { error: mutationError } = await action()
    if (mutationError) {
      showError(mutationError.message || String(mutationError))
      return false
    }
    showSuccess(successMessage)
    await loadData()
    return true
  }

  const handleAssignSubmit = async (event) => {
    event.preventDefault()
    if (!assignTarget || !assigneeId) {
      showError('Select an assignee.')
      return
    }
    setSubmitting(true)
    const ok = await runMutation(
      () => assignBugReport(assignTarget.id, assigneeId),
      'Bug report assigned.',
    )
    setSubmitting(false)
    if (ok) {
      setAssignTarget(null)
      setAssigneeId('')
    }
  }

  const handleStatusAction = (row, status, options = {}) => {
    const { title, message, confirmLabel, requireReason, danger } = options
    confirm({
      title: title || `Set status to "${status}"?`,
      message: message || `Update "${row.title}" to ${status}.`,
      confirmLabel: confirmLabel || 'Confirm',
      danger,
      requireReason,
      onConfirm: async (reason) => {
        const updates = { status }
        if (reason) updates.resolution_notes = reason
        if (options.resolutionNotes) updates.resolution_notes = options.resolutionNotes
        await runMutation(
          () => (status === 'rejected' ? rejectBugReport(row.id, reason) : updateBugReport(row.id, updates)),
          `Bug report marked as ${status}.`,
        )
      },
    })
  }

  const handleResolve = (row, targetStatus) => {
    confirm({
      title: targetStatus === 'fixed' ? `Mark "${row.title}" as fixed?` : `Close "${row.title}"?`,
      message: 'Add resolution notes for audit history.',
      confirmLabel: targetStatus === 'fixed' ? 'Mark fixed' : 'Close',
      requireReason: true,
      onConfirm: async (reason) => {
        await runMutation(
          () => setBugReportStatus(row.id, targetStatus, reason),
          `Bug report ${targetStatus}.`,
        )
      },
    })
  }

  const confirmBulkStatus = async () => {
    const { status } = bulkModal
    setBulkModal({ open: false, status: null })
    const outcome = await bulk.executeBulk((row) => {
      if (TERMINAL_STATUSES.includes(row.status)) {
        return { error: 'Already terminal' }
      }
      return setBugReportStatus(row.id, status)
    })
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} bug report(s) updated.`)
    await loadData()
  }

  const renderActions = (row) => {
    const terminal = TERMINAL_STATUSES.includes(row.status)
    return (
      <PermissionGate permission="feedback.bugs.manage">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDetailRow(row)}
            className="rounded border border-gray-600 bg-gray-800/60 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
          >
            View
          </button>
          {!terminal && (
            <>
              <button
                type="button"
                onClick={() => {
                  setAssignTarget(row)
                  setAssigneeId('')
                }}
                className="rounded border border-blue-700 bg-blue-900/30 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/60"
              >
                Assign
              </button>
              {['new', 'assigned'].includes(row.status) && (
                <button
                  type="button"
                  onClick={() => handleStatusAction(row, 'in_progress', {
                    title: `Start work on "${row.title}"?`,
                    confirmLabel: 'Start',
                  })}
                  className="rounded border border-cyan-700 bg-cyan-900/30 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/60"
                >
                  Start
                </button>
              )}
              {row.status === 'in_progress' && (
                <button
                  type="button"
                  onClick={() => handleResolve(row, 'fixed')}
                  className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/60"
                >
                  Fix
                </button>
              )}
              {row.status === 'fixed' && (
                <button
                  type="button"
                  onClick={() => handleStatusAction(row, 'verified', {
                    title: `Verify fix for "${row.title}"?`,
                    confirmLabel: 'Verify',
                  })}
                  className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/60"
                >
                  Verify
                </button>
              )}
              {row.status === 'verified' && (
                <button
                  type="button"
                  onClick={() => handleResolve(row, 'closed')}
                  className="rounded border border-gray-600 bg-gray-800/60 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
                >
                  Close
                </button>
              )}
              <button
                type="button"
                onClick={() => handleStatusAction(row, 'rejected', {
                  title: `Reject "${row.title}"?`,
                  message: 'Provide a reason this report is invalid or duplicate.',
                  confirmLabel: 'Reject',
                  danger: true,
                  requireReason: true,
                })}
                className="rounded border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </PermissionGate>
    )
  }

  if (loading) return <LoadingState message="Loading bug reports..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Bug Reports</h1>
          <p className="text-sm text-gray-500">Triage user-submitted bugs — assign, progress, resolve, and close.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search title, status, priority, severity..." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={filteredRows.length} />
        <AdminCard title="Open" value={filteredRows.filter((r) => !TERMINAL_STATUSES.includes(r.status)).length} />
        <AdminCard title="In progress" value={filteredRows.filter((r) => r.status === 'in_progress').length} />
        <AdminCard title="Critical / P0" value={filteredRows.filter((r) => r.severity === 'critical' || r.priority === 'p0').length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClass}
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Priority</label>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className={inputClass}
          >
            {PRIORITY_FILTERS.map((priority) => (
              <option key={priority} value={priority}>{priority === 'all' ? 'All priorities' : priority}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No bug reports found" description="Adjust filters or wait for user submissions." />
      ) : (
        <>
          <AdminTable
            rows={filteredRows}
            page={page}
            pageSize={PAGE_SIZE}
            selectable
            selectedIds={bulk.selectedIds}
            onSelectionChange={bulk.setSelectedIds}
            columns={[
              { key: 'title', label: 'Title', render: (r) => r.title || '—' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={r.status || 'unknown'} variant={statusVariant(r.status)} />,
              },
              { key: 'priority', label: 'Priority', render: (r) => r.priority || '—' },
              { key: 'severity', label: 'Severity', render: (r) => r.severity || '—' },
              { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => renderActions(r),
              },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        processing={bulk.processing}
        progressCurrent={bulk.progress.current}
        progressTotal={bulk.progress.total}
        onClearSelection={bulk.clearSelection}
        actions={[
          { key: 'in_progress', label: 'Start', onClick: () => setBulkModal({ open: true, status: 'in_progress' }) },
          { key: 'closed', label: 'Close', variant: 'danger', onClick: () => setBulkModal({ open: true, status: 'closed' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={`Set ${bulk.selectedCount} bug report(s) to ${bulkModal.status}?`}
        message="Bulk status changes apply to all selected non-terminal reports."
        items={bulk.selectedItems}
        itemLabel={(item) => item.title || item.id}
        confirmLabel="Update"
        danger={bulkModal.status === 'closed'}
        onConfirm={confirmBulkStatus}
        onClose={() => setBulkModal({ open: false, status: null })}
        processing={bulk.processing}
      />

      <AdminModal open={Boolean(detailRow)} title={detailRow?.title || 'Bug report'} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Status</dt>
              <dd><AdminBadge label={detailRow.status} variant={statusVariant(detailRow.status)} /></dd>
            </div>
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Priority / Severity</dt>
              <dd className="text-gray-100">{detailRow.priority} / {detailRow.severity}</dd>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.description || '—'}</dd>
            </div>
            {detailRow.steps_to_reproduce && (
              <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Steps to reproduce</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.steps_to_reproduce}</dd>
              </div>
            )}
            {(detailRow.expected_behavior || detailRow.actual_behavior) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                  <dt className="text-gray-500">Expected</dt>
                  <dd className="mt-1 text-gray-100">{detailRow.expected_behavior || '—'}</dd>
                </div>
                <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                  <dt className="text-gray-500">Actual</dt>
                  <dd className="mt-1 text-gray-100">{detailRow.actual_behavior || '—'}</dd>
                </div>
              </div>
            )}
            {detailRow.page_url && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Page URL</dt>
                <dd className="truncate text-blue-300">{detailRow.page_url}</dd>
              </div>
            )}
            {detailRow.resolution_notes && (
              <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Resolution notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.resolution_notes}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-100">{formatDate(detailRow.created_at)}</dd>
            </div>
          </dl>
        )}
      </AdminModal>

      <AdminModal
        open={Boolean(assignTarget)}
        title={assignTarget ? `Assign "${assignTarget.title}"` : 'Assign bug report'}
        onClose={() => { setAssignTarget(null); setAssigneeId('') }}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-3">
          <AdminField label="Assignee" required>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className={inputClass}
              required
            >
              <option value="">Select admin...</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.full_name || admin.email} ({admin.role})
                </option>
              ))}
            </select>
          </AdminField>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => { setAssignTarget(null); setAssigneeId('') }}
              className="rounded px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {submitting ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </AdminModal>

      {modal}
    </div>
  )
}
