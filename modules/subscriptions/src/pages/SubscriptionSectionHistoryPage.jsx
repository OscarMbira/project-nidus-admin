import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminUsers,
  fetchAllSubscriptionPlans,
  fetchAuditLog,
  fetchPaymentTransactions,
  fetchPricingChangeHistory,
  fetchLifecycleLogsByTable,
  formatCurrency,
  formatDate,
  formatPlanLabel,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  formatAuditActionLabel,
  LoadingState,
  RecordVersionHistory,
} from '@nidus-admin/ui'
import {
  SUBSCRIPTION_HISTORY_SECTIONS,
  subscriptionAuditRecordPath,
  subscriptionPricingRecordPath,
} from '../subscriptionHistoryConfig.js'

const PAGE_SIZE = 20

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function matchesAuditAction(action, prefixes = []) {
  if (!prefixes?.length) return true
  const value = String(action || '')
  return prefixes.some((prefix) => value.startsWith(prefix) || value.includes(prefix))
}

function pricingOldPrice(row) {
  const value = row?.previous_price ?? row?.old_price
  return value == null || value === '' ? null : value
}

function formatPricingPlanLabel(row, planMap = {}) {
  const plan = row?.plan_id ? planMap[row.plan_id] : null
  if (plan?.plan_name) {
    return (
      <div>
        <div className="font-medium text-gray-100">{plan.plan_name}</div>
        <div className="text-xs text-gray-500">
          {[plan.plan_type, plan.billing_cycle, plan.catalog_scope].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  }
  if (row?.plan_type) {
    return (
      <div>
        <div className="font-medium text-gray-100">{formatPlanLabel(row.plan_type)}</div>
        <div className="text-xs text-gray-500">
          {[row.billing_cycle, row.target_system].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  }
  return row?.plan_id || '—'
}

function PricingHistoryActions({ row, sectionKey }) {
  if (!row?.id) return '—'

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to={subscriptionPricingRecordPath(sectionKey, row.id)}
        className="inline-flex rounded border border-violet-700/60 bg-violet-900/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/50"
      >
        View details
      </Link>
      {row.plan_id && (
        <Link
          to={`/subscriptions/plan-catalog-form?id=${row.plan_id}`}
          className="inline-flex rounded border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 hover:border-gray-500 hover:bg-gray-700"
        >
          Open plan
        </Link>
      )}
    </div>
  )
}

function AuditHistoryPanel({ sectionKey, rows, adminNameMap, emptyTitle, emptyDescription }) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
      <table className="min-w-full text-sm text-gray-200">
        <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
          <tr>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Admin</th>
            <th className="px-4 py-3">Target</th>
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-gray-800 hover:bg-gray-800/50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-100">{formatAuditActionLabel(row.action)}</div>
                <div className="text-xs text-gray-500">{row.action || '—'}</div>
              </td>
              <td className="px-4 py-3">
                <div>{adminNameMap[row.admin_user_id] || row.admin_user_id || '—'}</div>
                <div className="text-xs text-gray-500">{row.admin_role || '—'}</div>
              </td>
              <td className="px-4 py-3">
                <div>{row.target_type || '—'}</div>
                <div className="text-xs text-gray-500">{row.target_id || '—'}</div>
              </td>
              <td className="px-4 py-3">{formatDate(row.created_at)}</td>
              <td className="px-4 py-3">
                <Link
                  to={subscriptionAuditRecordPath(sectionKey, row.id)}
                  className="inline-flex rounded border border-violet-700/60 bg-violet-900/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/50"
                >
                  View changes
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SubscriptionSectionHistoryPage({ sectionKey }) {
  const config = SUBSCRIPTION_HISTORY_SECTIONS[sectionKey]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [auditRows, setAuditRows] = useState([])
  const [pricingRows, setPricingRows] = useState([])
  const [lifecycleRows, setLifecycleRows] = useState([])
  const [paymentRows, setPaymentRows] = useState([])
  const [planMap, setPlanMap] = useState({})
  const [adminUsers, setAdminUsers] = useState([])
  const [page, setPage] = useState(1)
  const [panelErrors, setPanelErrors] = useState({})
  const [lifecycleUnavailable, setLifecycleUnavailable] = useState(false)

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  const lifecycleRecordMetaMap = useMemo(() => {
    const map = {}
    for (const plan of Object.values(planMap)) {
      const subtitle = [plan.plan_type, plan.billing_cycle, plan.catalog_scope].filter(Boolean).join(' · ')
      map[plan.id] = { title: plan.plan_name, subtitle }
      if (plan.root_record_id) {
        map[plan.root_record_id] = { title: plan.plan_name, subtitle }
      }
    }
    return map
  }, [planMap])

  useEffect(() => {
    if (!config) return undefined
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setPanelErrors({})
      setLifecycleUnavailable(false)
      setAuditRows([])
      setPricingRows([])
      setLifecycleRows([])
      setPaymentRows([])

      const usersRes = await fetchAdminUsers({ limit: 500 })
      if (usersRes.data) setAdminUsers(usersRes.data)

      const errors = {}
      let loadedPanels = 0

      if (config.panels.includes('audit')) {
        const auditRes = await fetchAuditLog({
          filters: [{ op: 'in', col: 'target_type', val: config.auditTargetTypes }],
          limit: 500,
        })
        if (auditRes.error) {
          errors.audit = toErrorMessage(auditRes.error, 'Failed to load audit history.')
        } else {
          setAuditRows(
            (auditRes.data || []).filter((row) =>
              matchesAuditAction(row.action, config.auditActionPrefixes),
            ),
          )
          loadedPanels += 1
        }
      }

      if (config.panels.includes('pricing')) {
        const [pricingRes, plansRes] = await Promise.all([
          fetchPricingChangeHistory({ limit: 200 }),
          fetchAllSubscriptionPlans(),
        ])
        if (pricingRes.error) {
          errors.pricing = toErrorMessage(pricingRes.error, 'Failed to load pricing history.')
        } else {
          setPricingRows(pricingRes.data || [])
          setPlanMap(Object.fromEntries((plansRes.data || []).map((plan) => [plan.id, plan])))
          loadedPanels += 1
        }
      }

      if (config.panels.includes('lifecycle')) {
        const lifecyclePromises = [
          fetchLifecycleLogsByTable(config.lifecycleTable, { limit: 200 }),
        ]
        if (config.lifecycleTable === 'subscription_plans') {
          lifecyclePromises.push(fetchAllSubscriptionPlans())
        }
        const [lifecycleRes, plansRes] = await Promise.all(lifecyclePromises)
        if (lifecycleRes.unavailable) {
          setLifecycleUnavailable(true)
          loadedPanels += 1
        } else if (lifecycleRes.error) {
          errors.lifecycle = toErrorMessage(lifecycleRes.error, 'Failed to load lifecycle history.')
        } else {
          setLifecycleRows(lifecycleRes.data || [])
          loadedPanels += 1
        }
        if (plansRes?.data) {
          setPlanMap(Object.fromEntries((plansRes.data || []).map((plan) => [plan.id, plan])))
        }
      }

      if (config.panels.includes('payments')) {
        const paymentsRes = await fetchPaymentTransactions({ limit: 200 })
        if (paymentsRes.error) {
          errors.payments = toErrorMessage(paymentsRes.error, 'Failed to load payment history.')
        } else {
          setPaymentRows(paymentsRes.data || [])
          loadedPanels += 1
        }
      }

      setPanelErrors(errors)
      if (loadedPanels === 0 && Object.keys(errors).length > 0) {
        setError(Object.values(errors)[0])
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [config, sectionKey])

  const paginatedAudit = auditRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(auditRows.length / PAGE_SIZE))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  if (!config) {
    return <div className="p-6 text-red-400">Unknown history section.</div>
  }

  if (loading) return <LoadingState message={`Loading ${config.title.toLowerCase()}...`} />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <PermissionGate permission={config.permission}>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <p className="text-xs text-gray-500">
            <Link to={config.parentPath} className="text-violet-300 hover:text-violet-200">
              ← {config.parentLabel}
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-100">{config.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{config.description}</p>
        </div>

        {config.panels.includes('pricing') && (
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">Pricing change history</h2>
            <p className="mt-1 text-xs text-gray-500">Recorded catalog price updates from the database.</p>
            <div className="mt-4">
              {pricingRows.length === 0 ? (
                <EmptyState title="No pricing changes yet" description="Price updates will appear here when recorded." />
              ) : (
                <AdminTable
                  rows={pricingRows}
                  columns={[
                    {
                      key: 'plan_id',
                      label: 'Plan',
                      sortable: false,
                      render: (r) => formatPricingPlanLabel(r, planMap),
                    },
                    {
                      key: 'previous_price',
                      label: 'Old',
                      render: (r) => {
                        const value = pricingOldPrice(r)
                        return value == null ? '—' : formatCurrency(value, r.currency || 'USD')
                      },
                    },
                    { key: 'new_price', label: 'New', render: (r) => formatCurrency(r.new_price, r.currency || 'USD') },
                    { key: 'effective_date', label: 'Effective', render: (r) => formatDate(r.effective_date) },
                    { key: 'change_reason', label: 'Reason', render: (r) => r.change_reason || r.reason || '—' },
                    { key: 'created_at', label: 'Recorded', render: (r) => formatDate(r.created_at) },
                    {
                      key: 'actions',
                      label: 'Actions',
                      sortable: false,
                      render: (r) => <PricingHistoryActions row={r} sectionKey={sectionKey} />,
                    },
                  ]}
                />
              )}
            </div>
          </section>
        )}

        {config.panels.includes('lifecycle') && (
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">Lifecycle transitions</h2>
            <p className="mt-1 text-xs text-gray-500">Authorisation, archive, and restore events for catalog plans.</p>
            {lifecycleUnavailable && (
              <p className="mt-3 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
                Lifecycle logging table is not installed yet. Apply record lifecycle migrations:
                {' '}
                <code className="text-amber-100">pnpm run admin:migrate-record-lifecycle</code>
                {' '}
                (v95–v99). Admin audit history below still shows catalog changes.
              </p>
            )}
            {panelErrors.lifecycle && (
              <p className="mt-3 text-sm text-red-400">{panelErrors.lifecycle}</p>
            )}
            <div className="mt-4">
              {!lifecycleUnavailable && lifecycleRows.length === 0 ? (
                <EmptyState title="No lifecycle history yet" description="Governance transitions will appear here." />
              ) : !lifecycleUnavailable ? (
                <RecordVersionHistory
                  logs={lifecycleRows}
                  adminNameMap={adminNameMap}
                  recordMetaMap={lifecycleRecordMetaMap}
                  renderRecordAction={(log) => (
                    log.record_id && config.lifecycleTable === 'subscription_plans' ? (
                      <Link
                        to={`/subscriptions/plan-catalog-form?id=${log.record_id}`}
                        className="inline-flex rounded border border-violet-700/60 bg-violet-900/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-900/50"
                      >
                        Open plan
                      </Link>
                    ) : null
                  )}
                />
              ) : null}
            </div>
          </section>
        )}

        {config.panels.includes('payments') && (
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">Payment transactions</h2>
            <p className="mt-1 text-xs text-gray-500">Recent payment activity contributing to revenue.</p>
            <div className="mt-4">
              {paymentRows.length === 0 ? (
                <EmptyState title="No payments yet" description="Payment transactions will appear here." />
              ) : (
                <AdminTable
                  rows={paymentRows}
                  columns={[
                    { key: 'created_at', label: 'Date', render: (r) => formatDate(r.created_at) },
                    { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount, r.currency || 'USD') },
                    {
                      key: 'status',
                      label: 'Status',
                      render: (r) => <AdminBadge label={r.status || '—'} variant={r.status === 'paid' ? 'active' : 'pending'} />,
                    },
                    { key: 'payment_method', label: 'Method', render: (r) => r.payment_method || '—' },
                    { key: 'subscription_id', label: 'Subscription', render: (r) => r.subscription_id || '—' },
                  ]}
                />
              )}
            </div>
          </section>
        )}

        {config.panels.includes('audit') && (
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">Admin audit trail</h2>
            <p className="mt-1 text-xs text-gray-500">Who changed what, with before/after values from the audit log.</p>
            <div className="mt-4">
              <AuditHistoryPanel
                sectionKey={sectionKey}
                rows={paginatedAudit}
                adminNameMap={adminNameMap}
                emptyTitle="No audit entries yet"
                emptyDescription="Admin actions in this area will be recorded here."
              />
            </div>
            {panelErrors.audit && (
              <p className="mt-3 text-sm text-red-400">{panelErrors.audit}</p>
            )}
            {auditRows.length > PAGE_SIZE && (
              <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, auditRows.length)} of {auditRows.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    className="rounded border border-gray-700 px-3 py-1.5 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </PermissionGate>
  )
}
