import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  ADMIN_ROLES,
  ACTIVATION_STATUSES,
  ROLE_LABELS,
  deactivateAdminUser,
  fetchAdminUsers,
  formatDate,
  formatDateShort,
  navId,
  reactivateAdminUser,
  suspendAdminUser,
  useBulkSelection,
  useCurrentAdmin,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
  AdminRowActions,
  AdminRowManageModal,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'deactivated', label: 'Deactivated' },
  { key: 'invited', label: 'Invited' },
]

export default function AdminUserListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useCurrentAdmin()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [manageRow, setManageRow] = useState(null)
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '' })

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('admin.admin_users', rowIds)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchAdminUsers()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.activation_status !== statusFilter) return false
      if (roleFilter !== 'all' && row.role !== roleFilter) return false
      if (!query) return true
      return [row.full_name, row.email].some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, roleFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, roleFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

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
    if (action === 'suspend') {
      outcome = await bulk.executeBulk((row) => {
        if (row.activation_status !== 'active') return { error: 'Not active' }
        return suspendAdminUser(row.id, reason)
      })
      reportBulk(outcome, 'admin(s) suspended')
    } else if (action === 'reactivate') {
      outcome = await bulk.executeBulk((row) => {
        if (!['suspended', 'deactivated', 'rejected'].includes(row.activation_status)) return { error: 'Not eligible' }
        return reactivateAdminUser(row.id)
      })
      reportBulk(outcome, 'admin(s) reactivated')
    } else if (action === 'deactivate') {
      outcome = await bulk.executeBulk((row) => {
        if (['deactivated', 'rejected'].includes(row.activation_status)) return { error: 'Already deactivated' }
        return deactivateAdminUser(row.id)
      })
      reportBulk(outcome, 'admin(s) deactivated')
    }
    await loadUsers()
  }

  const handleSuspend = (row) => {
    confirm({
      title: `Suspend ${row.full_name || row.email}?`,
      message: 'This admin account will be blocked from signing in until it is reactivated.',
      confirmLabel: 'Suspend',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await suspendAdminUser(row.id, reason)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Admin user suspended.')
        await loadUsers()
      },
    })
  }

  const handleReactivate = (row) => {
    confirm({
      title: `Reactivate ${row.full_name || row.email}?`,
      message: 'This will restore account access for the selected admin user.',
      confirmLabel: 'Reactivate',
      onConfirm: async () => {
        const { error: mutationError } = await reactivateAdminUser(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Admin user reactivated.')
        await loadUsers()
      },
    })
  }

  const handleDeactivate = (row) => {
    confirm({
      title: `Deactivate ${row.full_name || row.email}?`,
      message: 'Deactivated admins cannot be activated again without explicit reactivation.',
      confirmLabel: 'Deactivate',
      danger: true,
      onConfirm: async () => {
        const { error: mutationError } = await deactivateAdminUser(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Admin user deactivated.')
        await loadUsers()
      },
    })
  }

  const buildAdminManageActions = (row) => {
    if (!row) return []
    const actions = []
    if (row.activation_status === 'active' && hasPermission('admins.suspend')) {
      actions.push({
        key: 'suspend',
        label: 'Suspend',
        variant: 'warning',
        onClick: () => handleSuspend(row),
      })
    }
    if (['suspended', 'deactivated', 'rejected'].includes(row.activation_status) && hasPermission('admins.reactivate')) {
      actions.push({
        key: 'reactivate',
        label: 'Reactivate',
        variant: 'success',
        onClick: () => handleReactivate(row),
      })
    }
    if (!['deactivated', 'rejected'].includes(row.activation_status) && hasPermission('admins.deactivate')) {
      actions.push({
        key: 'deactivate',
        label: 'Deactivate',
        variant: 'danger',
        onClick: () => handleDeactivate(row),
      })
    }
    return actions
  }

  const activeCount = rows.filter((row) => row.activation_status === 'active').length
  const invitedCount = rows.filter((row) => row.activation_status === 'invited').length
  const suspendedCount = rows.filter((row) => row.activation_status === 'suspended').length

  if (loading) return <LoadingState message="Loading admin users..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Admin Users</h1>
          <p className="text-sm text-gray-500">Manage access, account status, and role assignments.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email..." />
          <PermissionGate permission="admins.invite">
            <button
              type="button"
              className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
              onClick={() => navigate('../admin-user-invite', { relative: 'path' })}
            >
              Invite Admin
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === filter.key
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Role Filter</label>
        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All Roles</option>
          {ADMIN_ROLES.filter((role) => role !== 'super_admin').map((role) => (
            <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>
          ))}
          <option value="super_admin">{ROLE_LABELS.super_admin}</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total admins" value={rows.length} />
        <AdminCard title="Active admins" value={activeCount} />
        <AdminCard title="Invited" value={invitedCount} />
        <AdminCard title="Suspended" value={suspendedCount} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No admin users found" description="Try adjusting search or filters." />
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
              { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
              { key: 'full_name', label: 'Full Name', render: (r) => r.full_name || '—' },
              { key: 'email', label: 'Email' },
              {
                key: 'role',
                label: 'Role',
                render: (r) => <AdminBadge label={ROLE_LABELS[r.role] || r.role} variant={r.role} />,
              },
              {
                key: 'activation_status',
                label: 'Status',
                render: (r) => (
                  <AdminBadge
                    label={ACTIVATION_STATUSES.includes(r.activation_status) ? r.activation_status.replaceAll('_', ' ') : (r.activation_status || 'unknown')}
                    variant={r.activation_status}
                  />
                ),
              },
              { key: 'last_login_at', label: 'Last Login', render: (r) => (
                <span title={formatDate(r.last_login_at)}>{formatDateShort(r.last_login_at)}</span>
              ) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`../admin-user-edit?id=${navId(displayIdMap, r.id)}&view=1`, { relative: 'path' })} />
                    <PermissionGate permission="admins.edit">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`../admin-user-edit?id=${navId(displayIdMap, r.id)}`, { relative: 'path' })} />
                    </PermissionGate>
                    {buildAdminManageActions(r).length > 0 && (
                      <AdminActionButton variant="default" onClick={() => setManageRow(r)}>
                        Manage
                      </AdminActionButton>
                    )}
                  </AdminRowActions>
                ),
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
          { key: 'suspend', label: 'Suspend', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'suspend', reason: '' }) },
          { key: 'reactivate', label: 'Reactivate', onClick: () => setBulkModal({ open: true, action: 'reactivate', reason: '' }) },
          { key: 'deactivate', label: 'Deactivate', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'deactivate', reason: '' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={
          bulkModal.action === 'suspend' ? `Suspend ${bulk.selectedCount} admin(s)?`
            : bulkModal.action === 'reactivate' ? `Reactivate ${bulk.selectedCount} admin(s)?`
              : `Deactivate ${bulk.selectedCount} admin(s)?`
        }
        message={
          bulkModal.action === 'suspend' ? 'Selected admins will be blocked from signing in.'
            : bulkModal.action === 'reactivate' ? 'Selected admins will regain account access.'
              : 'Deactivated admins cannot sign in until explicitly reactivated.'
        }
        items={bulk.selectedItems}
        itemLabel={(item) => item.full_name || item.email || item.id}
        confirmLabel={bulkModal.action === 'suspend' ? 'Suspend' : bulkModal.action === 'reactivate' ? 'Reactivate' : 'Deactivate'}
        danger={bulkModal.action !== 'reactivate'}
        requireReason={bulkModal.action === 'suspend'}
        reason={bulkModal.reason}
        onReasonChange={(value) => setBulkModal((prev) => ({ ...prev, reason: value }))}
        onConfirm={confirmBulkAction}
        onClose={() => setBulkModal({ open: false, action: null, reason: '' })}
        processing={bulk.processing}
      />

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage admin user"
        subtitle={manageRow ? (manageRow.full_name || manageRow.email) : ''}
        onClose={() => setManageRow(null)}
        actions={buildAdminManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
