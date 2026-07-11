import { useEffect, useMemo, useState } from 'react'
import {
  fetchAllSubscriptions,
  fetchPricingChangeHistory,
  fetchSubscriptionPlans,
  formatCurrency,
  formatDate,
  PermissionGate,
  setSubscriptionPlanCatalogActive,
  updatePricingPlan,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminModal,
  AdminTable,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const todayIsoDate = () => new Date().toISOString().slice(0, 10)

export default function PricingPlansPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [plans, setPlans] = useState([])
  const [historyRows, setHistoryRows] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editModal, setEditModal] = useState({
    open: false,
    plan: null,
    newPrice: '',
    effectiveDate: todayIsoDate(),
    submitting: false,
  })

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const [plansRes, historyRes, subscriptionsRes] = await Promise.all([
      fetchSubscriptionPlans(),
      fetchPricingChangeHistory(),
      fetchAllSubscriptions(),
    ])

    const nextError = plansRes.error || historyRes.error || subscriptionsRes.error
    if (nextError) {
      setError(toErrorMessage(nextError, 'Failed to load pricing plans.'))
      setLoading(false)
      return
    }

    setPlans(plansRes.data || [])
    setHistoryRows(historyRes.data || [])
    setSubscriptions(subscriptionsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredPlans = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plans.filter((plan) => {
      if (!query) return true
      return [plan.plan_name, plan.plan_code, plan.plan_type, plan.id]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [plans, search])

  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const openEditModal = (plan) => {
    setEditModal({
      open: true,
      plan,
      newPrice: String(plan.price ?? plan.price_monthly ?? ''),
      effectiveDate: todayIsoDate(),
      submitting: false,
    })
  }

  const closeEditModal = () => {
    setEditModal({
      open: false,
      plan: null,
      newPrice: '',
      effectiveDate: todayIsoDate(),
      submitting: false,
    })
  }

  const getAffectedSubscribers = (plan) => {
    if (!plan) return 0
    const targetSystem = plan.catalog_scope === 'simulator' ? 'simulator' : 'platform'
    return subscriptions.filter((subscription) =>
      (subscription.target_system || 'platform') === targetSystem
      && plan.plan_type
      && subscription.plan_type === plan.plan_type
    ).length
  }

  const resolvePlanTargetSystem = (plan) => (
    plan?.catalog_scope === 'simulator' ? 'simulator' : 'platform'
  )

  const toggleCatalogVisibility = (plan) => {
    const nextActive = !plan.is_active
    confirm({
      title: `${nextActive ? 'Activate' : 'Deactivate'} ${plan.plan_name || plan.plan_type}?`,
      message: nextActive
        ? 'This plan will appear on the public pricing page for its system.'
        : 'This plan will be hidden from the public pricing page. Existing subscriptions are not affected.',
      confirmLabel: nextActive ? 'Activate Plan' : 'Deactivate Plan',
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await setSubscriptionPlanCatalogActive(plan.id, nextActive, reason)
        if (mutationError) {
          showError(toErrorMessage(mutationError, 'Failed to update plan visibility.'))
          return
        }
        showSuccess(`Plan ${nextActive ? 'activated' : 'deactivated'}.`)
        window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
        await loadData()
      },
    })
  }

  const submitPricingUpdate = () => {
    if (!editModal.plan) return
    const parsedPrice = Number.parseFloat(editModal.newPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      showError('New monthly price must be a valid non-negative number.')
      return
    }
    if (!editModal.effectiveDate) {
      showError('Effective date is required.')
      return
    }

    const affectedCount = getAffectedSubscribers(editModal.plan)
    confirm({
      title: `Update pricing for ${editModal.plan.plan_name || editModal.plan.plan_code}?`,
      message: `This change affects approximately ${affectedCount} active subscriptions. Continue?`,
      confirmLabel: 'Confirm Price Update',
      requireReason: true,
      onConfirm: async (reason) => {
        setEditModal((prev) => ({ ...prev, submitting: true }))
        const { error: mutationError } = await updatePricingPlan(
          editModal.plan.id,
          resolvePlanTargetSystem(editModal.plan),
          parsedPrice,
          editModal.effectiveDate,
          reason,
        )
        if (mutationError) {
          showError(toErrorMessage(mutationError, 'Failed to update pricing plan.'))
          setEditModal((prev) => ({ ...prev, submitting: false }))
          return
        }
        showSuccess('Pricing plan update recorded.')
        window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
        closeEditModal()
        await loadData()
      },
    })
  }

  const activePlansCount = plans.filter((plan) => plan.is_active).length

  if (loading) return <LoadingState message="Loading pricing plans..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <PermissionGate permission="pricing.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Pricing Plans</h1>
            <p className="text-sm text-gray-500">Manage subscription pricing and review historical changes.</p>
          </div>
          <div className="w-full sm:w-80">
            <SearchBar value={search} onChange={setSearch} placeholder="Search plan by name, code, type..." />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard title="Total plans" value={plans.length} />
          <AdminCard title="Active plans" value={activePlansCount} />
          <AdminCard title="Price updates" value={historyRows.length} />
          <AdminCard title="Tracked subscriptions" value={subscriptions.length} />
        </div>

        {filteredPlans.length === 0 ? (
          <EmptyState title="No pricing plans found" description="Try adjusting your search filter." />
        ) : (
          <>
            <AdminTable
              rows={filteredPlans}
              page={page}
              pageSize={PAGE_SIZE}
              columns={[
                { key: 'plan_name', label: 'Plan Name', render: (r) => r.plan_name || '—' },
                { key: 'plan_code', label: 'Plan Code', render: (r) => r.plan_code || '—' },
                { key: 'plan_type', label: 'Type', render: (r) => r.plan_type || '—' },
                {
                  key: 'catalog_scope',
                  label: 'System',
                  render: (r) => r.catalog_scope || (r.simulator_included && !r.platform_included ? 'simulator' : 'platform'),
                },
                { key: 'billing_cycle', label: 'Billing', render: (r) => r.billing_cycle || '—' },
                { key: 'price', label: 'Price', render: (r) => formatCurrency(r.price ?? r.price_monthly, r.currency || 'USD') },
                {
                  key: 'is_active',
                  label: 'Status',
                  render: (r) => <AdminBadge label={r.is_active ? 'active' : 'inactive'} variant={r.is_active ? 'active' : 'inactive'} />,
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  sortable: false,
                  render: (plan) => (
                    <PermissionGate permission="pricing.edit">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(plan)}
                          className="rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/70"
                        >
                          Edit Pricing
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCatalogVisibility(plan)}
                          className="rounded border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/50"
                        >
                          {plan.is_active ? 'Hide from Pricing' : 'Show on Pricing'}
                        </button>
                      </div>
                    </PermissionGate>
                  ),
                },
              ]}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredPlans.length)} of {filteredPlans.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page <= 1}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Pricing Change History</h2>
          <div className="mt-4">
            {historyRows.length === 0 ? (
              <EmptyState title="No pricing history yet" description="Recorded pricing updates will appear here." />
            ) : (
              <AdminTable
                rows={historyRows}
                columns={[
                  { key: 'plan_id', label: 'Plan ID', render: (r) => r.plan_id || '—' },
                  { key: 'old_price', label: 'Old Price', render: (r) => formatCurrency(r.old_price, r.currency || 'USD') },
                  { key: 'new_price', label: 'New Price', render: (r) => formatCurrency(r.new_price, r.currency || 'USD') },
                  { key: 'effective_date', label: 'Effective', render: (r) => formatDate(r.effective_date) },
                  { key: 'change_reason', label: 'Reason', render: (r) => r.change_reason || r.reason || '—' },
                  { key: 'created_at', label: 'Recorded At', render: (r) => formatDate(r.created_at) },
                ]}
              />
            )}
          </div>
        </div>

        <AdminModal
          open={editModal.open}
          title={`Edit Pricing${editModal.plan ? ` — ${editModal.plan.plan_name || editModal.plan.plan_code}` : ''}`}
          onClose={closeEditModal}
          onConfirm={submitPricingUpdate}
          confirmLabel={editModal.submitting ? 'Saving...' : 'Continue'}
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-400">
              Update monthly price and effective date. A reason will be required on confirmation.
            </p>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">New Monthly Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editModal.newPrice}
                onChange={(event) => setEditModal((prev) => ({ ...prev, newPrice: event.target.value }))}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Effective Date</label>
              <input
                type="date"
                value={editModal.effectiveDate}
                onChange={(event) => setEditModal((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {editModal.plan && (
              <p className="rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                This update may affect {getAffectedSubscribers(editModal.plan)} subscriber(s). A confirmation step follows.
              </p>
            )}
          </div>
        </AdminModal>

        {modal}
      </div>
    </PermissionGate>
  )
}
