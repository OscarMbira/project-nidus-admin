import { useEffect, useState } from 'react'
import { PermissionGate, activateAdminUser, fetchPendingActivations, formatDate, rejectAdminUser, ROLE_LABELS, useBulkSelection } from '@nidus-admin/shared'
import { AdminBadge, AdminTable, BulkActionBar, BulkConfirmModal, EmptyState, LoadingState, useConfirmAction, useToast } from '@nidus-admin/ui'

export default function PendingActivationsPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '' })

  const bulk = useBulkSelection({ rows, idKey: 'id' })

  const loadPending = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchPendingActivations()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadPending()
  }, [])

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const confirmBulkAction = async () => {
    const { action, reason } = bulkModal
    setBulkModal({ open: false, action: null, reason: '' })
    let outcome
    if (action === 'activate') {
      outcome = await bulk.executeBulk((row) => activateAdminUser(row.id))
      reportBulk(outcome, 'admin(s) activated')
    } else if (action === 'reject') {
      outcome = await bulk.executeBulk((row) => rejectAdminUser(row.id, reason))
      reportBulk(outcome, 'activation(s) rejected')
    }
    await loadPending()
  }

  const handleActivate = (row) => {
    confirm({
      title: `Activate ${row.full_name || row.email}?`,
      message: 'This admin user will be able to sign in immediately.',
      confirmLabel: 'Activate',
      onConfirm: async () => {
        const { error: mutationError } = await activateAdminUser(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Admin user activated.')
        await loadPending()
      },
    })
  }

  const handleReject = (row) => {
    confirm({
      title: `Reject ${row.full_name || row.email}?`,
      message: 'Rejected activations require a reason for audit logging.',
      confirmLabel: 'Reject',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await rejectAdminUser(row.id, reason)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Pending activation rejected.')
        await loadPending()
      },
    })
  }

  if (loading) return <LoadingState message="Loading pending activations..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Pending Activations</h1>
        <p className="text-sm text-gray-500">Approve or reject newly registered admin accounts.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No pending activations" description="New pending admin users will appear here." />
      ) : (
        <AdminTable
          rows={rows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          columns={[
            { key: 'full_name', label: 'Name', render: (r) => r.full_name || '—' },
            { key: 'email', label: 'Email' },
            {
              key: 'role',
              label: 'Role',
              render: (r) => <AdminBadge label={ROLE_LABELS[r.role] || r.role} variant={r.role} />,
            },
            { key: 'created_by', label: 'Invited By', render: (r) => r.created_by || '—' },
            { key: 'created_at', label: 'Requested At', render: (r) => formatDate(r.created_at) },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <div className="flex flex-wrap gap-2">
                  <PermissionGate permission="admins.activate">
                    <button
                      type="button"
                      className="rounded border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/70"
                      onClick={() => handleActivate(r)}
                    >
                      Activate
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="admins.reject">
                    <button
                      type="button"
                      className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70"
                      onClick={() => handleReject(r)}
                    >
                      Reject
                    </button>
                  </PermissionGate>
                </div>
              ),
            },
          ]}
        />
      )}

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        processing={bulk.processing}
        progressCurrent={bulk.progress.current}
        progressTotal={bulk.progress.total}
        onClearSelection={bulk.clearSelection}
        actions={[
          { key: 'activate', label: 'Activate', onClick: () => setBulkModal({ open: true, action: 'activate', reason: '' }) },
          { key: 'reject', label: 'Reject', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'reject', reason: '' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={bulkModal.action === 'activate' ? `Activate ${bulk.selectedCount} admin(s)?` : `Reject ${bulk.selectedCount} activation(s)?`}
        message={bulkModal.action === 'activate' ? 'Selected admins will be able to sign in immediately.' : 'Rejected activations require a reason for audit logging.'}
        items={bulk.selectedItems}
        itemLabel={(item) => item.full_name || item.email || item.id}
        confirmLabel={bulkModal.action === 'activate' ? 'Activate' : 'Reject'}
        danger={bulkModal.action === 'reject'}
        requireReason={bulkModal.action === 'reject'}
        reason={bulkModal.reason}
        onReasonChange={(value) => setBulkModal((prev) => ({ ...prev, reason: value }))}
        onConfirm={confirmBulkAction}
        onClose={() => setBulkModal({ open: false, action: null, reason: '' })}
        processing={bulk.processing}
      />

      {modal}
    </div>
  )
}
