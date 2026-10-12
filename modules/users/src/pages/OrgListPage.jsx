import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  exportToFile,
  fetchAccounts,
  formatDate,
  formatDateShort,
  generateExportFilename,
  navId,
  suspendOrganisation,
  useBulkSelection,
  useCurrentAdmin,
  useDisplayIdMap,
  verifyOrganisation,
  changeAccountEdition,
  filterByEdition,
  EDITION_LABELS,
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
  const { hasPermission } = useCurrentAdmin()
  const [rows, setRows] = useState([])
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '' })
  const [manageRow, setManageRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [search, setSearch] = useState('')
  const [verificationFilter, setVerificationFilter] = useState('all')
  // v211 (monorepo v1239): Full PMIS vs Project Planner edition filter.
  const [editionFilter, setEditionFilter] = useState('all')

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
    return filterByEdition(rows, editionFilter).filter((row) => {
      const matchesSearch = !query || [row.account_name, row.id]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
      if (!matchesSearch) return false
      if (verificationFilter === 'all') return true
      if (verificationFilter === 'verified') return !!row.is_verified && !row.is_suspended
      if (verificationFilter === 'unverified') return !row.is_verified && !row.is_suspended
      return !!row.is_suspended
    })
  }, [rows, search, verificationFilter, editionFilter])

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

  const viewOrgDetail = (row) => {
    navigate(`/users/org-detail?id=${navId(displayIdMap, row.id)}`)
  }

  const buildOrgManageActions = (row) => {
    if (!row) return []
    const actions = []
    if (hasPermission('orgs.verify') && !row.is_verified) {
      actions.push({
        key: 'verify',
        label: 'Verify',
        variant: 'success',
        onClick: () => handleVerify(row),
      })
    }
    if (hasPermission('accounts.edition.change')) {
      const target = (row.product_edition || 'platform') === 'planner' ? 'platform' : 'planner'
      actions.push({
        key: 'edition',
        label: `Change edition to ${EDITION_LABELS[target]}`,
        variant: 'default',
        onClick: () => handleChangeEdition(row, target),
      })
    }
    if (hasPermission('orgs.suspend')) {
      actions.push({
        key: 'suspend',
        label: 'Suspend',
        variant: 'danger',
        onClick: () => handleSuspend(row),
      })
    }
    return actions
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

  const handleChangeEdition = (row, target) => {
    confirm({
      title: `Switch ${row.account_name || row.id} to ${EDITION_LABELS[target]}?`,
      message: target === 'planner'
        ? 'Members will only see the planning menus. No data is deleted; switching back restores everything.'
        : 'Members will see the full PMIS. Their plans and records carry over unchanged.',
      confirmLabel: 'Change edition',
      requireReason: true,
      onConfirm: async (reason) => {
        setActionError(null)
        const { error: mutationError } = await changeAccountEdition(row.id, target, reason)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        showSuccess(`${row.account_name || row.id} now uses ${EDITION_LABELS[target]}.`)
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
        <span className="mx-1 self-center text-xs text-gray-500 dark:text-gray-400">Edition:</span>
        {[['all', 'All'], ['platform', EDITION_LABELS.platform], ['planner', EDITION_LABELS.planner]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setEditionFilter(key)}
            aria-pressed={editionFilter === key}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              editionFilter === key
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-600/20 dark:text-blue-200'
                : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-200'
            }`}
          >
            {label}
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
            { key: 'account_name', label: 'Account Name', render: (r) => (
              <button
                type="button"
                className="text-left text-blue-300 hover:underline"
                onClick={() => viewOrgDetail(r)}
              >
                {r.account_name || '—'}
              </button>
            ) },
            {
              key: 'edition',
              label: 'Edition',
              sortable: false,
              render: (r) => (
                <AdminBadge
                  label={EDITION_LABELS[r.product_edition || 'platform']}
                  variant={(r.product_edition || 'platform') === 'planner' ? 'pending_activation' : 'active'}
                />
              ),
            },
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
            { key: 'created_at', label: 'Created', render: (r) => (
              <span title={formatDate(r.created_at)}>{formatDateShort(r.created_at)}</span>
            ) },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <AdminIconActionButton variant="view" label="View" onClick={() => viewOrgDetail(r)} />
                  {buildOrgManageActions(r).length > 0 && (
                    <AdminActionButton variant="default" onClick={() => setManageRow(r)}>
                      Manage
                    </AdminActionButton>
                  )}
                </AdminRowActions>
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

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage organisation"
        subtitle={manageRow?.account_name}
        onClose={() => setManageRow(null)}
        actions={buildOrgManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
