import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  exportToFile,
  fetchAccounts,
  formatDate,
  generateExportFilename,
  navId,
  suspendOrganisation,
  useBulkSelection,
  useDisplayIdMap,
  verifyOrganisation,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const VERIFICATION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'suspended', label: 'Suspended' },
]

export default function OrgListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [search, setSearch] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('all')

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('public.accounts', rowIds)

  const loadAccounts = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchAccounts()
    if (fetchError) setError(fetchError.message || String(fetchError))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.toLowerCase().trim()
    return rows.filter((row) => {
      const matchesSearch = !query || [row.account_name, row.id]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
      if (!matchesSearch) return false
      if (verificationFilter === 'all') return true
      if (verificationFilter === 'verified') return !!row.is_verified && !row.is_suspended
      if (verificationFilter === 'unverified') return !row.is_verified && !row.is_suspended
      return !!row.is_suspended
    })
  }, [rows, search, verificationFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

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
      verification: row.is_verified ? 'Verified' : 'Unverified',
      suspension: row.is_suspended ? 'Suspended' : 'Active',
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'display_id', label: 'Display ID' },
        { key: 'account_name', label: 'Account Name' },
        { key: 'verification', label: 'Verification' },
        { key: 'suspension', label: 'Suspension' },
        { key: 'created_at', label: 'Created' },
      ],
      generateExportFilename('organisations', { verification: verificationFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Organisations exported.')
  }

  const confirmBulkAction = async () => {
    const { action, reason } = bulkModal
    setBulkModal({ open: false, action: null, reason: '' })
    let outcome
    if (action === 'verify') {
      outcome = await bulk.executeBulk((row) => {
        if (row.is_verified) return { error: 'Already verified' }
        return verifyOrganisation(row.id)
      })
      reportBulk(outcome, 'organisation(s) verified')
    } else if (action === 'suspend') {
      outcome = await bulk.executeBulk((row) => suspendOrganisation(row.id, reason))
      reportBulk(outcome, 'organisation(s) suspended')
    }
    await loadAccounts()
  }

  const handleVerify = (row) => {
    confirm({
      title: `Verify ${row.account_name || row.id}?`,
      message: 'The organisation will be marked as verified.',
      confirmLabel: 'Verify',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await verifyOrganisation(row.id)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadAccounts()
      },
    })
  }

  const handleSuspend = (row) => {
    confirm({
      title: `Suspend ${row.account_name || row.id}?`,
      message: 'Suspending an organisation can impact all member access.',
      confirmLabel: 'Suspend',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setActionError(null)
        const { error: mutationError } = await suspendOrganisation(row.id, reason)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadAccounts()
      },
    })
  }

  if (loading) return <LoadingState message="Loading organisations..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Organisations</h1>
          <p className="text-sm text-gray-500">Review verification and enforcement status across accounts.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by organisation name..." />
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
        {VERIFICATION_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setVerificationFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              verificationFilter === filter.key
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total orgs" value={rows.length} />
        <AdminCard title="Verified" value={rows.filter((r) => r.is_verified).length} />
        <AdminCard title="Unverified" value={rows.filter((r) => !r.is_verified).length} />
        <AdminCard title="Suspended" value={rows.filter((r) => r.is_suspended).length} />
      </div>

      {actionError && <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">{actionError}</div>}

      {filteredRows.length === 0 ? (
        <EmptyState title="No organisations found" description="Try a different filter or search term." />
      ) : (
        <AdminTable
          rows={filteredRows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'account_name', label: 'Account Name', render: (r) => r.account_name || '—' },
            {
              key: 'verification',
              label: 'Verification',
              sortable: false,
              render: (r) => (
                <AdminBadge label={r.is_verified ? 'Verified' : 'Unverified'} variant={r.is_verified ? 'active' : 'pending_activation'} />
              ),
            },
            {
              key: 'suspension',
              label: 'Suspension',
              sortable: false,
              render: (r) => (
                <AdminBadge label={r.is_suspended ? 'Suspended' : 'Active'} variant={r.is_suspended ? 'suspended' : 'active'} />
              ),
            },
            { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/70"
                    onClick={() => navigate(`/users/org-detail?id=${navId(displayIdMap, r.id)}`)}
                  >
                    View Detail
                  </button>
                  <PermissionGate permission="orgs.verify">
                    <button
                      type="button"
                      className="rounded border border-emerald-700 bg-emerald-900/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50"
                      onClick={() => handleVerify(r)}
                      disabled={r.is_verified}
                    >
                      Verify
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="orgs.suspend">
                    <button
                      type="button"
                      className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70"
                      onClick={() => handleSuspend(r)}
                    >
                      Suspend
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
          { key: 'verify', label: 'Verify', onClick: () => setBulkModal({ open: true, action: 'verify', reason: '' }) },
          { key: 'suspend', label: 'Suspend', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'suspend', reason: '' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={bulkModal.action === 'verify' ? `Verify ${bulk.selectedCount} organisation(s)?` : `Suspend ${bulk.selectedCount} organisation(s)?`}
        message={bulkModal.action === 'verify' ? 'Selected organisations will be marked as verified.' : 'Suspending organisations can impact all member access.'}
        items={bulk.selectedItems}
        itemLabel={(item) => item.account_name || item.id}
        confirmLabel={bulkModal.action === 'verify' ? 'Verify' : 'Suspend'}
        danger={bulkModal.action === 'suspend'}
        requireReason={bulkModal.action === 'suspend'}
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
