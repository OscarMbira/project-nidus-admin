import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deactivatePlatformUser,
  exportToFile,
  fetchUsers,
  formatDate,
  formatDateShort,
  generateExportFilename,
  navId,
  reactivatePlatformUser,
  resetUserPassword,
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
  { key: 'inactive', label: 'Inactive' },
]

function userStatusLabel(row) {
  if (row.is_suspended) return 'Suspended'
  if (row.is_active) return 'Active'
  return 'Inactive'
}

function userStatusVariant(row) {
  if (row.is_suspended) return 'suspended'
  if (row.is_active) return 'active'
  return 'inactive'
}

const USER_EXPORT_COLUMNS = [
  { key: 'display_id', label: 'Display ID' },
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email' },
  { key: 'status', label: 'Status' },
  { key: 'last_login_at', label: 'Last Login' },
]

export default function UserListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useCurrentAdmin()
  const [rows, setRows] = useState([])
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [manageRow, setManageRow] = useState(null)
  const [actionError, setActionError] = useState(null)

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('public.users', rowIds)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchUsers()
    if (fetchError) setError(fetchError.message || String(fetchError))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase().trim()
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? row.is_active && !row.is_suspended
          : statusFilter === 'suspended'
            ? !!row.is_suspended
            : !row.is_active && !row.is_suspended
      if (!matchesStatus) return false
      if (!query) return true
      return [row.full_name, row.email]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const buildUserManageActions = (row) => {
    if (!row) return []
    const actions = []
    if (row.is_active && !row.is_suspended && hasPermission('users.deactivate')) {
      actions.push({
        key: 'deactivate',
        label: 'Deactivate',
        variant: 'danger',
        onClick: () => handleDeactivate(row),
      })
    }
    if (row.is_active && !row.is_suspended && hasPermission('users.suspend')) {
      actions.push({
        key: 'suspend',
        label: 'Suspend',
        variant: 'warning',
        onClick: () => handleSuspend(row),
      })
    }
    if (row.is_suspended && hasPermission('users.reactivate')) {
      actions.push({
        key: 'reactivate',
        label: 'Reactivate',
        variant: 'success',
        onClick: () => handleReactivate(row),
      })
    }
    if (hasPermission('users.password_reset')) {
      actions.push({
        key: 'resetPassword',
        label: 'Reset password',
        variant: 'warning',
        onClick: () => handleResetPassword(row),
      })
    }
    return actions
  }

  const viewUserDetail = (row) => {
    navigate(`/users/user-detail?id=${navId(displayIdMap, row.id)}`)
  }

  const handleSuspend = (row) => {
    navigate(`/users/user-suspend?id=${navId(displayIdMap, row.id)}`)
  }

  const handleReactivate = (row) => {
    confirm({
      title: `Reactivate ${row.full_name || row.email}?`,
      message: 'The user will regain access to the platform.',
      confirmLabel: 'Reactivate',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await reactivatePlatformUser(row.id)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadUsers()
      },
    })
  }

  const handleDeactivate = (row) => {
    confirm({
      title: `Deactivate ${row.full_name || row.email}?`,
      message: 'The user will lose access until reactivated by admin action.',
      confirmLabel: 'Deactivate',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setActionError(null)
        const { error: mutationError } = await deactivatePlatformUser(row.id, reason)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadUsers()
      },
    })
  }

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const handleExport = () => {
    const exportRows = filteredRows.map((row) => ({
      ...row,
      display_id: displayIdMap[row.id] || row.id,
      status: userStatusLabel(row),
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      USER_EXPORT_COLUMNS,
      generateExportFilename('users', { status: statusFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Users exported.')
  }

  const handleBulkSuspend = () => {
    if (bulk.selectedCount === 1) {
      const row = bulk.selectedItems[0]
      navigate(`/users/user-suspend?id=${navId(displayIdMap, row.id)}`)
      bulk.clearSelection()
      return
    }
    showError('Select exactly one user to suspend via the suspend form.')
  }

  const confirmBulkAction = async () => {
    const { action, reason } = bulkModal
    setBulkModal({ open: false, action: null, reason: '' })
    let outcome
    if (action === 'deactivate') {
      outcome = await bulk.executeBulk((row) => {
        if (!row.is_active || row.is_suspended) return { error: 'User is not eligible for deactivation' }
        return deactivatePlatformUser(row.id, reason)
      })
      reportBulk(outcome, 'user(s) deactivated')
      await loadUsers()
    } else if (action === 'reactivate') {
      outcome = await bulk.executeBulk((row) => {
        if (!row.is_suspended) return { error: 'User is not suspended' }
        return reactivatePlatformUser(row.id)
      })
      reportBulk(outcome, 'user(s) reactivated')
      await loadUsers()
    } else if (action === 'resetPassword') {
      outcome = await bulk.executeBulk((row) => resetUserPassword(row.id))
      reportBulk(outcome, 'password reset(s) issued')
    }
  }

  const handleResetPassword = (row) => {
    confirm({
      title: `Reset password for ${row.full_name || row.email}?`,
      message: 'A password reset request will be issued for this user.',
      confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await resetUserPassword(row.id)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
      },
    })
  }

  if (loading) return <LoadingState message="Loading users..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Users</h1>
          <p className="text-sm text-gray-500">Search, filter, and manage platform users.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email..." />
          <button
            type="button"
            onClick={handleExport}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Export
          </button>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <AdminCard title="Total users" value={rows.length} />
        <AdminCard title="Filtered users" value={filteredRows.length} />
        <AdminCard title="Active users" value={rows.filter((r) => r.is_active && !r.is_suspended).length} />
        <AdminCard title="Suspended users" value={rows.filter((r) => r.is_suspended).length} />
        <AdminCard title="Inactive users" value={rows.filter((r) => !r.is_active && !r.is_suspended).length} />
      </div>

      {actionError && <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">{actionError}</div>}

      {filteredRows.length === 0 ? (
        <EmptyState title="No users found" description="Try changing filters or search terms." />
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
              { key: 'full_name', label: 'Full Name', render: (r) => (
                <button
                  type="button"
                  className="text-left text-blue-300 hover:underline"
                  onClick={() => viewUserDetail(r)}
                >
                  {r.full_name || '—'}
                </button>
              ) },
              { key: 'email', label: 'Email' },
              {
                key: 'status',
                label: 'Status',
                sortable: false,
                render: (r) => (
                  <AdminBadge
                    label={userStatusLabel(r)}
                    variant={userStatusVariant(r)}
                  />
                ),
              },
              {
                key: 'last_login_at',
                label: 'Last Login',
                render: (r) => (
                  <span title={formatDate(r.last_login_at)}>{formatDateShort(r.last_login_at)}</span>
                ),
              },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => viewUserDetail(r)} />
                    {buildUserManageActions(r).length > 0 && (
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
          { key: 'deactivate', label: 'Deactivate', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'deactivate', reason: '' }) },
          { key: 'suspend', label: 'Suspend', onClick: handleBulkSuspend },
          { key: 'reactivate', label: 'Reactivate', onClick: () => setBulkModal({ open: true, action: 'reactivate', reason: '' }) },
          { key: 'resetPassword', label: 'Reset Password', onClick: () => setBulkModal({ open: true, action: 'resetPassword', reason: '' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={
          bulkModal.action === 'deactivate' ? `Deactivate ${bulk.selectedCount} user(s)?`
            : bulkModal.action === 'reactivate' ? `Reactivate ${bulk.selectedCount} user(s)?`
              : `Reset password for ${bulk.selectedCount} user(s)?`
        }
        message={
          bulkModal.action === 'deactivate' ? 'Selected users will lose access until reactivated.'
            : bulkModal.action === 'reactivate' ? 'Selected users will regain platform access.'
              : 'A password reset request will be issued for each selected user.'
        }
        items={bulk.selectedItems}
        itemLabel={(item) => item.full_name || item.email || item.id}
        confirmLabel={
          bulkModal.action === 'deactivate' ? 'Deactivate'
            : bulkModal.action === 'reactivate' ? 'Reactivate'
              : 'Reset Password'
        }
        danger={bulkModal.action === 'deactivate'}
        requireReason={bulkModal.action === 'deactivate'}
        reason={bulkModal.reason}
        onReasonChange={(value) => setBulkModal((prev) => ({ ...prev, reason: value }))}
        onConfirm={confirmBulkAction}
        onClose={() => setBulkModal({ open: false, action: null, reason: '' })}
        processing={bulk.processing}
      />

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage user"
        subtitle={manageRow ? (manageRow.full_name || manageRow.email) : ''}
        onClose={() => setManageRow(null)}
        actions={buildUserManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
