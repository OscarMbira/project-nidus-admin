import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  deleteSubscription,
  extendSubscriptionTrial,
  exportToFile,
  fetchAllSubscriptions,
  fetchSubscriptionPlansCatalog,
  formatDate,
  formatSubscriptionAmount,
  formatSubscriptionPlanLabel,
  generateExportFilename,
  PermissionGate,
  systemLabel,
  updateSubscriptionStatus,
  notifyEmailEvent,
  SUBSCRIPTION_DISPLAY_TABLE,
  useBulkSelection,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminModal,
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
const STATUS_FILTERS = ['all', 'active', 'trialing', 'cancelled', 'expired', 'past_due']
const SYSTEM_FILTERS = ['all', 'platform', 'simulator']
const STATUS_UPDATE_OPTIONS = ['active', 'trialing', 'cancelled', 'expired', 'past_due']

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function computeSubscriptionStats(rows) {
  let active = 0
  let trialing = 0
  let platform = 0
  let simulator = 0
  for (const row of rows) {
    if (row.status === 'active') active += 1
    if (row.status === 'trialing') trialing += 1
    if (row.target_system === 'platform') platform += 1
    if (row.target_system === 'simulator') simulator += 1
  }
  return { total: rows.length, active, trialing, platform, simulator }
}

function enrichSubscriptionRow(row, planCatalog, allRows) {
  return {
    ...row,
    _planLabel: formatSubscriptionPlanLabel(row, planCatalog, allRows),
    _amountLabel: formatSubscriptionAmount(row, planCatalog, allRows),
    _systemLabel: systemLabel(row.target_system || 'platform'),
  }
}

const SubscriptionListActions = memo(function SubscriptionListActions({
  row,
  displayId,
  onView,
  onEdit,
  onCancel,
  onExtendTrial,
  onDelete,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onView(row, displayId)}
        className="rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/70"
      >
        View
      </button>
      <PermissionGate permission="subscriptions.edit">
        <button
          type="button"
          onClick={() => onEdit(row, displayId)}
          className="rounded border border-cyan-700 bg-cyan-900/40 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/70"
        >
          Edit
        </button>
      </PermissionGate>
      <PermissionGate permission="subscriptions.edit">
        <button
          type="button"
          onClick={() => onCancel(row)}
          className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70"
        >
          Cancel
        </button>
      </PermissionGate>
      <PermissionGate permission="subscriptions.edit">
        <button
          type="button"
          onClick={() => onExtendTrial(row)}
          className="rounded border border-amber-700 bg-amber-900/40 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/70"
        >
          Extend Trial
        </button>
      </PermissionGate>
      <PermissionGate permission="subscriptions.delete">
        <button
          type="button"
          onClick={() => onDelete(row)}
          className="rounded border border-rose-800 bg-rose-950/40 px-2 py-1 text-xs text-rose-200 hover:bg-rose-950/70"
        >
          Delete
        </button>
      </PermissionGate>
    </div>
  )
})

export default function SubscriptionListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [planCatalog, setPlanCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get('status')
    return fromUrl && STATUS_FILTERS.includes(fromUrl) ? fromUrl : 'all'
  })
  const [systemFilter, setSystemFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('target_system')
  const [sortDir, setSortDir] = useState('asc')
  const [trialModal, setTrialModal] = useState({
    open: false,
    row: null,
    extensionDays: '7',
    reason: '',
    submitting: false,
  })
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, reason: '', newStatus: 'active' })

  const loadSubscriptions = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else {
      setLoading(true)
      setError(null)
    }

    const { data, error: fetchError } = await fetchAllSubscriptions()
    if (fetchError) {
      setError(toErrorMessage(fetchError, 'Failed to load subscriptions.'))
      setRows([])
    } else {
      setRows(data || [])
    }

    if (silent) setRefreshing(false)
    else setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)
      const [subsRes, catalogRes] = await Promise.all([
        fetchAllSubscriptions(),
        fetchSubscriptionPlansCatalog(),
      ])
      if (cancelled) return

      if (subsRes.error) {
        setError(toErrorMessage(subsRes.error, 'Failed to load subscriptions.'))
        setRows([])
      } else {
        setRows(subsRes.data || [])
      }
      setPlanCatalog(catalogRes.data || [])
      setLoading(false)
    }

    init()

    const onCatalogUpdated = () => {
      fetchSubscriptionPlansCatalog().then(({ data }) => setPlanCatalog(data || []))
    }
    window.addEventListener('nidus:catalog-updated', onCatalogUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('nidus:catalog-updated', onCatalogUpdated)
    }
  }, [])

  const stats = useMemo(() => computeSubscriptionStats(rows), [rows])

  const availablePlans = useMemo(() => {
    const plans = new Set()
    for (const row of rows) {
      if (row.plan_type) plans.add(row.plan_type)
    }
    return ['all', ...Array.from(plans).sort((a, b) => String(a).localeCompare(String(b)))]
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (systemFilter !== 'all' && row.target_system !== systemFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (planFilter !== 'all' && row.plan_type !== planFilter) return false
      if (!query) return true
      return [row.id, row.user_id, row.account_id, row.plan_type, row.target_system]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, systemFilter, planFilter])

  const enrichedRows = useMemo(
    () => filteredRows.map((row) => enrichSubscriptionRow(row, planCatalog, rows)),
    [filteredRows, planCatalog, rows],
  )

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  const displayIdRecordIds = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    const ids = filteredRows.slice(start, start + PAGE_SIZE).map((row) => row.id).filter(Boolean)
    for (const id of bulk.selectedIds) {
      if (id) ids.push(id)
    }
    return [...new Set(ids)]
  }, [filteredRows, page, bulk.selectedIds])

  const { displayIdMap } = useDisplayIdMap(SUBSCRIPTION_DISPLAY_TABLE, displayIdRecordIds)

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, systemFilter, planFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const navigateToDetail = useCallback((row, displayId) => {
    const id = encodeURIComponent(displayId || row.id)
    const system = encodeURIComponent(row.target_system || 'platform')
    navigate(`/subscriptions/subscription-detail?id=${id}&system=${system}`)
  }, [navigate])

  const navigateToEdit = useCallback((row, displayId) => {
    const id = encodeURIComponent(displayId || row.id)
    const system = encodeURIComponent(row.target_system || 'platform')
    navigate(`/subscriptions/subscription-form?id=${id}&system=${system}`)
  }, [navigate])

  const reportBulk = useCallback((outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }, [showError, showSuccess])

  const handleExport = useCallback(() => {
    const exportRows = enrichedRows.map((row) => ({
      ...row,
      display_id: displayIdMap[row.id] || row.id,
      system: row._systemLabel,
      plan: row._planLabel,
      amount: row._amountLabel,
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'display_id', label: 'Display ID' },
        { key: 'system', label: 'System' },
        { key: 'plan', label: 'Plan' },
        { key: 'billing_cycle', label: 'Billing' },
        { key: 'status', label: 'Status' },
        { key: 'amount', label: 'Amount' },
        { key: 'started_at', label: 'Start Date' },
        { key: 'expires_at', label: 'Expires' },
      ],
      generateExportFilename('subscriptions', { status: statusFilter, system: systemFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Subscriptions exported.')
  }, [enrichedRows, displayIdMap, statusFilter, systemFilter, showError, showSuccess])

  const openExtendTrialModal = useCallback((row) => {
    setTrialModal({ open: true, row, extensionDays: '7', reason: '', submitting: false })
  }, [])

  const closeExtendTrialModal = useCallback(() => {
    setTrialModal({ open: false, row: null, extensionDays: '7', reason: '', submitting: false })
  }, [])

  const handleBulkExtendTrial = useCallback(() => {
    if (bulk.selectedCount !== 1) {
      showError('Select exactly one subscription to extend trial.')
      return
    }
    openExtendTrialModal(bulk.selectedItems[0])
    bulk.clearSelection()
  }, [bulk, openExtendTrialModal, showError])

  const confirmBulkAction = useCallback(async () => {
    const { action, reason, newStatus } = bulkModal
    setBulkModal({ open: false, action: null, reason: '', newStatus: 'active' })
    let outcome
    if (action === 'cancel') {
      outcome = await bulk.executeBulk((row) => deleteSubscription(row.id, row.target_system || 'platform', reason))
      reportBulk(outcome, 'subscription(s) cancelled')
    } else if (action === 'updateStatus') {
      outcome = await bulk.executeBulk((row) => updateSubscriptionStatus(
        row.id,
        row.target_system || 'platform',
        newStatus,
        reason || `Bulk status update to ${newStatus}`,
      ))
      reportBulk(outcome, 'subscription(s) updated')
    }
    await loadSubscriptions({ silent: true })
  }, [bulk, bulkModal, loadSubscriptions, reportBulk])

  const submitExtendTrial = useCallback(async () => {
    if (!trialModal.row) return
    const parsedDays = Number.parseInt(trialModal.extensionDays, 10)
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      showError('Extension days must be greater than zero.')
      return
    }
    if (!trialModal.reason.trim()) {
      showError('Reason is required for trial extension.')
      return
    }
    setTrialModal((prev) => ({ ...prev, submitting: true }))
    const { error: mutationError } = await extendSubscriptionTrial(
      trialModal.row.id,
      trialModal.row.target_system || 'platform',
      parsedDays,
      trialModal.reason.trim(),
    )
    if (mutationError) {
      showError(toErrorMessage(mutationError, 'Failed to extend subscription trial.'))
      setTrialModal((prev) => ({ ...prev, submitting: false }))
      return
    }
    showSuccess('Subscription trial extended.')
    closeExtendTrialModal()
    await loadSubscriptions({ silent: true })
  }, [trialModal, closeExtendTrialModal, loadSubscriptions, showError, showSuccess])

  const handleCancel = useCallback((row) => {
    confirm({
      title: `Cancel subscription ${displayIdMap[row.id] || row.id}?`,
      message: 'This marks the subscription as cancelled and will require a reason.',
      confirmLabel: 'Cancel Subscription',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await updateSubscriptionStatus(
          row.id,
          row.target_system || 'platform',
          'cancelled',
          reason,
        )
        if (mutationError) {
          showError(toErrorMessage(mutationError, 'Failed to cancel subscription.'))
          return
        }
        showSuccess('Subscription cancelled.')
        await notifyEmailEvent('subscription_cancelled', row.user_email || row.customer_email, {
          first_name: row.user_name?.split(' ')[0] || 'Customer',
          platform_name: 'Project Nidus',
          plan_name: row.plan_name || row.plan_type || 'subscription',
          cancel_date: new Date().toLocaleDateString(),
          access_until: row.current_period_end ? new Date(row.current_period_end).toLocaleDateString() : '—',
          support_url: 'https://projectnidus.com/support',
        })
        await loadSubscriptions({ silent: true })
      },
    })
  }, [confirm, displayIdMap, loadSubscriptions, showError, showSuccess])

  const handleDelete = useCallback((row) => {
    confirm({
      title: `Delete subscription ${displayIdMap[row.id] || row.id}?`,
      message: 'This permanently removes the subscription record. This cannot be undone.',
      confirmLabel: 'Delete Subscription',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await deleteSubscription(row.id, row.target_system || 'platform', reason)
        if (mutationError) {
          showError(toErrorMessage(mutationError, 'Failed to delete subscription.'))
          return
        }
        showSuccess('Subscription deleted.')
        await loadSubscriptions({ silent: true })
      },
    })
  }, [confirm, displayIdMap, loadSubscriptions, showError, showSuccess])

  const renderActions = useCallback((row) => (
    <SubscriptionListActions
      row={row}
      displayId={displayIdMap[row.id]}
      onView={navigateToDetail}
      onEdit={navigateToEdit}
      onCancel={handleCancel}
      onExtendTrial={openExtendTrialModal}
      onDelete={handleDelete}
    />
  ), [displayIdMap, navigateToDetail, navigateToEdit, handleCancel, openExtendTrialModal, handleDelete])

  const columns = useMemo(() => [
    { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
    {
      key: 'target_system',
      label: 'System',
      render: (r) => (
        <AdminBadge
          label={r._systemLabel}
          variant={r.target_system === 'simulator' ? 'suspended' : 'active'}
        />
      ),
    },
    { key: 'plan_type', label: 'Plan', render: (r) => r._planLabel },
    { key: 'billing_cycle', label: 'Billing', render: (r) => r.billing_cycle || '—' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <AdminBadge label={(r.status || 'unknown').replaceAll('_', ' ')} variant={r.status || 'default'} />,
    },
    { key: 'amount', label: 'Amount', render: (r) => r._amountLabel },
    { key: 'started_at', label: 'Start Date', render: (r) => formatDate(r.started_at) },
    { key: 'expires_at', label: 'Expires', render: (r) => formatDate(r.expires_at) },
    { key: 'actions', label: 'Actions', sortable: false, render: renderActions },
  ], [displayIdMap, renderActions])

  if (loading) return <LoadingState message="Loading subscriptions..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <PermissionGate permission="subscriptions.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-100">Subscriptions</h1>
              {refreshing && <span className="text-xs text-gray-500">Refreshing…</span>}
            </div>
            <p className="text-sm text-gray-500">View and manage Platform and Simulator subscriptions.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-80">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by id, plan, user, or system..." />
            </div>
            <button
              type="button"
              onClick={() => navigate(`/subscriptions/subscription-preview?system=${systemFilter === 'simulator' ? 'simulator' : 'platform'}`)}
              className="rounded border border-violet-700 bg-violet-900/40 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-violet-900/70"
            >
              Subscription Preview
            </button>
            <PermissionGate permission="subscriptions.create">
              <button
                type="button"
                onClick={() => navigate('/subscriptions/subscription-form')}
                className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/70"
              >
                Create Subscription
              </button>
            </PermissionGate>
            <button
              type="button"
              onClick={handleExport}
              className="rounded border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              Export
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {SYSTEM_FILTERS.map((system) => (
            <button
              key={system}
              type="button"
              onClick={() => setSystemFilter(system)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                systemFilter === system
                  ? 'border-violet-500 bg-violet-600/20 text-violet-200'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {system === 'all' ? 'All Systems' : systemLabel(system)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === status
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {status === 'all' ? 'All Statuses' : status.replaceAll('_', ' ')}
            </button>
          ))}
        </div>

        <div className="max-w-xs">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Plan Type</label>
          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {availablePlans.map((plan) => (
              <option key={plan} value={plan}>
                {plan === 'all' ? 'All Plans' : formatSubscriptionPlanLabel({ plan_type: plan }, planCatalog, rows)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <AdminCard title="Total subscriptions" value={stats.total} />
          <AdminCard title="Platform" value={stats.platform} />
          <AdminCard title="Simulator" value={stats.simulator} />
          <AdminCard title="Active" value={stats.active} />
          <AdminCard title="Trialing" value={stats.trialing} />
        </div>

        {filteredRows.length === 0 ? (
          <div className="space-y-4">
            <EmptyState title="No subscriptions found" description="Try adjusting filters or create a new subscription." />
            <PermissionGate permission="subscriptions.create">
              <button
                type="button"
                onClick={() => navigate('/subscriptions/subscription-form')}
                className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/70"
              >
                Create Subscription
              </button>
            </PermissionGate>
          </div>
        ) : (
          <>
            <AdminTable
              rows={enrichedRows}
              page={page}
              pageSize={PAGE_SIZE}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(key, dir) => {
                setSortKey(dir ? key : 'target_system')
                setSortDir(dir || 'asc')
              }}
              selectable
              selectedIds={bulk.selectedIds}
              onSelectionChange={bulk.setSelectedIds}
              columns={columns}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Previous</button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Next</button>
              </div>
            </div>
          </>
        )}

        <AdminModal
          open={trialModal.open}
          title={`Extend trial${trialModal.row ? ` (${displayIdMap[trialModal.row.id] || trialModal.row.id})` : ''}`}
          onClose={closeExtendTrialModal}
          onConfirm={submitExtendTrial}
          confirmLabel={trialModal.submitting ? 'Saving...' : 'Extend Trial'}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Provide extension details for this trial subscription.</p>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Extension Days</label>
              <input type="number" min={1} value={trialModal.extensionDays} onChange={(event) => setTrialModal((prev) => ({ ...prev, extensionDays: event.target.value }))} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Reason</label>
              <textarea rows={3} value={trialModal.reason} onChange={(event) => setTrialModal((prev) => ({ ...prev, reason: event.target.value }))} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100" placeholder="Explain why this trial should be extended..." />
            </div>
          </div>
        </AdminModal>

        <BulkActionBar
          selectedCount={bulk.selectedCount}
          processing={bulk.processing}
          progressCurrent={bulk.progress.current}
          progressTotal={bulk.progress.total}
          onClearSelection={bulk.clearSelection}
          actions={[
            { key: 'cancel', label: 'Cancel', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'cancel', reason: '', newStatus: 'active' }) },
            { key: 'extendTrial', label: 'Extend Trial', onClick: handleBulkExtendTrial },
            { key: 'updateStatus', label: 'Update Status', onClick: () => setBulkModal({ open: true, action: 'updateStatus', reason: '', newStatus: 'active' }) },
          ]}
        />

        <BulkConfirmModal
          open={bulkModal.open && bulkModal.action === 'cancel'}
          title={`Cancel ${bulk.selectedCount} subscription(s)?`}
          message="This permanently removes the selected subscription records."
          items={bulk.selectedItems}
          itemLabel={(item) => displayIdMap[item.id] || item.id}
          confirmLabel="Cancel Subscriptions"
          danger
          requireReason
          reason={bulkModal.reason}
          onReasonChange={(value) => setBulkModal((prev) => ({ ...prev, reason: value }))}
          onConfirm={confirmBulkAction}
          onClose={() => setBulkModal({ open: false, action: null, reason: '', newStatus: 'active' })}
          processing={bulk.processing}
        />

        <AdminModal
          open={bulkModal.open && bulkModal.action === 'updateStatus'}
          title={`Update status for ${bulk.selectedCount} subscription(s)`}
          onClose={() => setBulkModal({ open: false, action: null, reason: '', newStatus: 'active' })}
          onConfirm={confirmBulkAction}
          confirmLabel="Update Status"
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Choose the new status to apply to all selected subscriptions.</p>
            <select
              value={bulkModal.newStatus}
              onChange={(event) => setBulkModal((prev) => ({ ...prev, newStatus: event.target.value }))}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            >
              {STATUS_UPDATE_OPTIONS.map((status) => (
                <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
              ))}
            </select>
            <textarea
              rows={2}
              value={bulkModal.reason}
              onChange={(event) => setBulkModal((prev) => ({ ...prev, reason: event.target.value }))}
              className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              placeholder="Optional reason for audit log..."
            />
          </div>
        </AdminModal>

        {modal}
      </div>
    </PermissionGate>
  )
}
