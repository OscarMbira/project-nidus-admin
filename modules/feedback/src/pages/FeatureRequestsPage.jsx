import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  assignFeatureRequest,
  declineFeatureRequest,
  fetchAdminUsers,
  fetchFeatureRequests,
  formatDate,
  formatDateShort,
  PermissionGate,
  setFeatureRequestStatus,
  updateFeatureRequest,
  useBulkSelection,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminCard,
  AdminField,
  AdminIconActionButton,
  AdminModal,
  AdminRowActions,
  AdminRowManageModal,
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
const STATUS_FILTERS = ['all', 'under_review', 'approved', 'in_progress', 'completed', 'declined']
const PRIORITY_FILTERS = ['all', 'low', 'medium', 'high', 'critical']
const TERMINAL_STATUSES = ['completed', 'declined']
const ASSIGNABLE_ROLES = ['super_admin', 'system_admin', 'support_admin']

const statusVariant = (status) => {
  if (status === 'completed') return 'active'
  if (status === 'declined') return 'rejected'
  if (status === 'in_progress') return 'retrying'
  if (status === 'approved') return 'success'
  if (status === 'under_review') return 'pending'
  return 'default'
}

export default function FeatureRequestsPage() {
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
  const [manageRow, setManageRow] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null)
  const [assigneeId, setAssigneeId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [bulkModal, setBulkModal] = useState({ open: false, status: null })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [requestsRes, adminsRes] = await Promise.all([
      fetchFeatureRequests(),
      fetchAdminUsers({ filters: [{ op: 'eq', col: 'activation_status', val: 'active' }] }),
    ])
    if (requestsRes.error) {
      setError(requestsRes.error.message || String(requestsRes.error))
      setRows([])
    } else {
      setRows(requestsRes.data || [])
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
      return [row.title, row.description, row.status, row.priority, row.category, row.votes]
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
      () => assignFeatureRequest(assignTarget.id, assigneeId),
      'Feature request assigned.',
    )
    setSubmitting(false)
    if (ok) {
      setAssignTarget(null)
      setAssigneeId('')
    }
  }

  const handleStatusAction = (row, status, options = {}) => {
    confirm({
      title: options.title || `Set status to "${status}"?`,
      message: options.message || `Update "${row.title}" to ${status.replace('_', ' ')}.`,
      confirmLabel: options.confirmLabel || 'Confirm',
      danger: options.danger,
      requireReason: options.requireReason,
      onConfirm: async (reason) => {
        if (status === 'declined') {
          await runMutation(() => declineFeatureRequest(row.id, reason), 'Feature request declined.')
          return
        }
        const updates = { status }
        if (reason) updates.implementation_notes = reason
        await runMutation(
          () => updateFeatureRequest(row.id, updates),
          `Feature request marked as ${status.replace('_', ' ')}.`,
        )
      },
    })
  }

  const handleComplete = (row) => {
    confirm({
      title: `Complete "${row.title}"?`,
      message: 'Add implementation notes for audit history.',
      confirmLabel: 'Complete',
      requireReason: true,
      onConfirm: async (reason) => {
        await runMutation(
          () => setFeatureRequestStatus(row.id, 'completed', reason),
          'Feature request completed.',
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
      return setFeatureRequestStatus(row.id, status)
    })
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} feature request(s) updated.`)
    await loadData()
  }

  const openAssignFromManage = (row) => {
    setManageRow(null)
    setAssignTarget(row)
    setAssigneeId('')
  }

  const buildFeatureManageActions = (row) => {
    if (!row || TERMINAL_STATUSES.includes(row.status)) return []
    const actions = [
      {
        key: 'assign',
        label: 'Assign',
        variant: 'cyan',
        onClick: () => openAssignFromManage(row),
      },
    ]
    if (row.status === 'under_review') {
      actions.push({
        key: 'approve',
        label: 'Approve',
        variant: 'success',
        onClick: () => handleStatusAction(row, 'approved', {
          title: `Approve "${row.title}"?`,
          confirmLabel: 'Approve',
        }),
      })
    }
    if (['under_review', 'approved'].includes(row.status)) {
      actions.push({
        key: 'start',
        label: 'Start implementation',
        variant: 'cyan',
        onClick: () => handleStatusAction(row, 'in_progress', {
          title: `Start implementation for "${row.title}"?`,
          confirmLabel: 'Start',
        }),
      })
    }
    if (row.status === 'in_progress') {
      actions.push({
        key: 'complete',
        label: 'Mark complete',
        variant: 'success',
        onClick: () => handleComplete(row),
      })
    }
    actions.push({
      key: 'decline',
      label: 'Decline',
      variant: 'danger',
      onClick: () => handleStatusAction(row, 'declined', {
        title: `Decline "${row.title}"?`,
        message: 'Provide a reason this request will not be implemented.',
        confirmLabel: 'Decline',
        danger: true,
        requireReason: true,
      }),
    })
    return actions
  }

  const renderActions = (row) => {
    const terminal = TERMINAL_STATUSES.includes(row.status)
    return (
      <PermissionGate permission="feedback.requests.manage">
        <AdminRowActions>
          <AdminIconActionButton variant="view" label="View" onClick={() => setDetailRow(row)} />
          {!terminal && (
            <AdminActionButton variant="primary" onClick={() => setManageRow(row)}>
              Manage
            </AdminActionButton>
          )}
        </AdminRowActions>
      </PermissionGate>
    )
  }

  if (loading) return <LoadingState message="Loading feature requests..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Feature Requests</h1>
          <p className="text-sm text-gray-500">Review, approve, and track user-requested product improvements.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search title, status, category, votes..." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total" value={filteredRows.length} />
        <AdminCard title="Under review" value={filteredRows.filter((r) => r.status === 'under_review').length} />
        <AdminCard title="In progress" value={filteredRows.filter((r) => r.status === 'in_progress').length} />
        <AdminCard title="Top votes" value={Math.max(0, ...filteredRows.map((r) => r.votes || 0))} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Priority</label>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={inputClass}>
            {PRIORITY_FILTERS.map((priority) => (
              <option key={priority} value={priority}>{priority === 'all' ? 'All priorities' : priority}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No feature requests found" description="Adjust filters or wait for user submissions." />
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
              {
                key: 'title',
                label: 'Title',
                render: (r) => (
                  <button
                    type="button"
                    className="max-w-xs truncate text-left text-blue-300 hover:underline"
                    onClick={() => setDetailRow(r)}
                    title={r.title || '—'}
                  >
                    {r.title || '—'}
                  </button>
                ),
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={(r.status || 'unknown').replace('_', ' ')} variant={statusVariant(r.status)} />,
              },
              { key: 'votes', label: 'Votes', render: (r) => r.votes ?? 0 },
              { key: 'priority', label: 'Priority', render: (r) => r.priority || '—' },
              { key: 'category', label: 'Category', render: (r) => r.category || '—' },
              {
                key: 'created_at',
                label: 'Created',
                render: (r) => (
                  <span title={formatDate(r.created_at)}>{formatDateShort(r.created_at)}</span>
                ),
              },
              { key: 'actions', label: 'Actions', sortable: false, render: (r) => renderActions(r) },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Next</button>
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
          { key: 'approved', label: 'Approve', onClick: () => setBulkModal({ open: true, status: 'approved' }) },
          { key: 'in_progress', label: 'Start', onClick: () => setBulkModal({ open: true, status: 'in_progress' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={`Set ${bulk.selectedCount} feature request(s) to ${bulkModal.status?.replace('_', ' ')}?`}
        message="Bulk status changes apply to all selected non-terminal requests."
        items={bulk.selectedItems}
        itemLabel={(item) => item.title || item.id}
        confirmLabel="Update"
        onConfirm={confirmBulkStatus}
        onClose={() => setBulkModal({ open: false, status: null })}
        processing={bulk.processing}
      />

      <AdminModal open={Boolean(detailRow)} title={detailRow?.title || 'Feature request'} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Status</dt>
              <dd><AdminBadge label={detailRow.status?.replace('_', ' ')} variant={statusVariant(detailRow.status)} /></dd>
            </div>
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Votes / Priority</dt>
              <dd className="text-gray-100">{detailRow.votes ?? 0} votes · {detailRow.priority} · {detailRow.category}</dd>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.description || '—'}</dd>
            </div>
            {detailRow.implementation_notes && (
              <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Implementation notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.implementation_notes}</dd>
              </div>
            )}
            {(detailRow.estimated_effort || detailRow.estimated_completion_date) && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Estimate</dt>
                <dd className="text-gray-100">
                  {[detailRow.estimated_effort, detailRow.estimated_completion_date].filter(Boolean).join(' · ') || '—'}
                </dd>
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
        title={assignTarget ? `Assign "${assignTarget.title}"` : 'Assign feature request'}
        onClose={() => { setAssignTarget(null); setAssigneeId('') }}
      >
        <form onSubmit={handleAssignSubmit} className="space-y-3">
          <AdminField label="Assignee" required>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass} required>
              <option value="">Select admin...</option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.full_name || admin.email} ({admin.role})
                </option>
              ))}
            </select>
          </AdminField>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setAssignTarget(null); setAssigneeId('') }} className="rounded px-3 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
              {submitting ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage feature request"
        subtitle={manageRow?.title}
        onClose={() => setManageRow(null)}
        actions={buildFeatureManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
