import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchAllSubscriptionPlans,
  formatCurrency,
  formatPlanLabel,
  PermissionGate,
  deleteSubscriptionPlan,
  setSubscriptionPlanCatalogActive,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminRowManageModal,
  AdminTable,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

function scopeLabel(scope) {
  if (scope === 'simulator') return 'Simulator'
  if (scope === 'platform') return 'Platform'
  if (scope === 'both') return 'Both'
  return scope || '—'
}

function systemBadgeVariant(scope) {
  if (scope === 'simulator') return 'suspended'
  if (scope === 'both') return 'pending'
  return 'active'
}

export default function PlanCatalogListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('catalog_scope')
  const [sortDir, setSortDir] = useState('asc')
  const [busyId, setBusyId] = useState('')
  const [manageRow, setManageRow] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchAllSubscriptionPlans()
    if (error) showError(toError(error, 'Failed to load plan catalog.'))
    else setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [
      r.plan_name,
      r.plan_type,
      r.billing_cycle,
      r.catalog_scope,
      r.id,
    ].some((v) => String(v ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleToggle = (row) => {
    const nextActive = !row.is_active
    confirm({
      title: `${nextActive ? 'Activate' : 'Deactivate'} ${row.plan_name || row.plan_type}?`,
      message: nextActive
        ? 'This plan will appear on the public pricing page for its system.'
        : 'This plan will be hidden from the public pricing page. Existing subscriptions are not affected.',
      confirmLabel: nextActive ? 'Activate Plan' : 'Deactivate Plan',
      requireReason: true,
      onConfirm: async (reason) => {
        setBusyId(row.id)
        const { error } = await setSubscriptionPlanCatalogActive(row.id, nextActive, reason)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to update plan status.'))
        else {
          showSuccess(`Plan ${nextActive ? 'activated' : 'deactivated'}.`)
          window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
          await load()
        }
      },
    })
  }

  const handleDelete = (row) => {
    confirm({
      title: `Delete ${row.plan_name || row.plan_type}?`,
      message: 'Only plans with zero active subscribers can be deleted. If subscribers exist, deactivate the plan instead.',
      confirmLabel: 'Delete',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setBusyId(row.id)
        const { error } = await deleteSubscriptionPlan(row.id, reason)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete plan.'))
        else {
          showSuccess('Plan deleted.')
          window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
          await load()
        }
      },
    })
  }

  const buildPlanManageActions = (row) => {
    if (!row) return []
    return [
      {
        key: 'toggle',
        label: row.is_active ? 'Deactivate plan' : 'Activate plan',
        variant: 'warning',
        disabled: busyId === row.id,
        onClick: () => handleToggle(row),
      },
      {
        key: 'delete',
        label: 'Delete plan',
        variant: 'danger',
        disabled: busyId === row.id,
        onClick: () => handleDelete(row),
      },
    ]
  }

  if (loading) return <LoadingState message="Loading plan catalog..." />

  return (
    <PermissionGate permission="pricing.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Subscription Catalog</h1>
            <p className="text-sm text-gray-500">
              Create, edit, and remove subscription plan tiers for Platform and Simulator pricing pages.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchBar value={search} onChange={setSearch} placeholder="Search plans..." />
            <PermissionGate permission="pricing.edit">
              <button
                type="button"
                onClick={() => navigate('/subscriptions/plan-catalog-form')}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                New Plan
              </button>
            </PermissionGate>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No plans found" description="Create a plan or adjust your search." />
        ) : (
          <>
            <AdminTable
              rows={filtered}
              page={page}
              pageSize={PAGE_SIZE}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(key, dir) => {
                setSortKey(dir ? key : 'catalog_scope')
                setSortDir(dir || 'asc')
                setPage(1)
              }}
              columns={[
                { key: 'plan_name', label: 'Plan Name', render: (r) => r.plan_name || '—' },
                { key: 'plan_type', label: 'Type', render: (r) => formatPlanLabel(r.plan_type) },
                { key: 'billing_cycle', label: 'Billing Cycle', render: (r) => r.billing_cycle || '—' },
                {
                  key: 'catalog_scope',
                  label: 'System',
                  render: (r) => (
                    <AdminBadge
                      label={scopeLabel(r.catalog_scope)}
                      variant={systemBadgeVariant(r.catalog_scope)}
                    />
                  ),
                },
                {
                  key: 'price',
                  label: 'Price',
                  render: (r) => formatCurrency(r.price, r.currency || 'USD'),
                },
                {
                  key: 'is_popular',
                  label: 'Popular',
                  render: (r) => (
                    r.is_popular
                      ? <AdminBadge label="popular" variant="active" />
                      : <span className="text-gray-500">—</span>
                  ),
                },
                {
                  key: 'is_active',
                  label: 'Status',
                  render: (r) => (
                    <AdminBadge
                      label={r.is_active ? 'active' : 'inactive'}
                      variant={r.is_active ? 'active' : 'inactive'}
                    />
                  ),
                },
                {
                  key: 'actions',
                  label: 'Actions',
                  sortable: false,
                  render: (row) => (
                    <AdminRowActions>
                      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/subscriptions/plan-catalog-form?id=${row.id}&view=1`)} />
                      <PermissionGate permission="pricing.edit">
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/subscriptions/plan-catalog-form?id=${row.id}`)} />
                        <AdminActionButton variant="default" onClick={() => setManageRow(row)}>
                          More
                        </AdminActionButton>
                      </PermissionGate>
                    </AdminRowActions>
                  ),
                },
              ]}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
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
        <AdminRowManageModal
          open={Boolean(manageRow)}
          title="Plan actions"
          subtitle={manageRow ? (manageRow.plan_name || formatPlanLabel(manageRow.plan_type)) : ''}
          onClose={() => setManageRow(null)}
          actions={buildPlanManageActions(manageRow)}
        />
        {modal}
      </div>
    </PermissionGate>
  )
}
