import { useEffect, useMemo, useState } from 'react'
import {
  fetchBaseCurrency,
  fetchPaymentTransactions,
  fetchRevenueSummaryMultiCurrency,
  fetchSubscriptionAdminSummary,
  formatCurrency,
  formatDate,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminTable,
  EmptyState,
  LoadingState,
} from '@nidus-admin/ui'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const toDateString = (date) => date.toISOString().slice(0, 10)
const toDateFilterValue = (value, isEndOfDay = false) => (value ? `${value}T${isEndOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : null)

const pickNumber = (source, keys, fallback = 0) => {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value)
  }
  return fallback
}

export default function RevenueDashboardPage() {
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const [dateFrom, setDateFrom] = useState(toDateString(thirtyDaysAgo))
  const [dateTo, setDateTo] = useState(toDateString(today))
  const [summary, setSummary] = useState({})
  const [multiCurrencyRows, setMultiCurrencyRows] = useState([])
  const [paymentRows, setPaymentRows] = useState([])
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)

    const filters = []
    const fromValue = toDateFilterValue(dateFrom, false)
    const toValue = toDateFilterValue(dateTo, true)
    if (fromValue) filters.push({ op: 'gte', col: 'created_at', val: fromValue })
    if (toValue) filters.push({ op: 'lte', col: 'created_at', val: toValue })

    const [summaryRes, multiRes, paymentsRes, baseRes] = await Promise.all([
      fetchSubscriptionAdminSummary('platform'),
      fetchRevenueSummaryMultiCurrency(dateFrom, dateTo),
      fetchPaymentTransactions({ filters }),
      fetchBaseCurrency(),
    ])

    const nextError = summaryRes.error || multiRes.error || paymentsRes.error
    if (nextError) {
      setError(toErrorMessage(nextError, 'Failed to load revenue dashboard data.'))
      setLoading(false)
      return
    }

    const summaryData = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data
    setSummary(summaryData || {})
    setMultiCurrencyRows(multiRes.data || [])
    setPaymentRows(paymentsRes.data || [])
    setBaseCurrency(baseRes.data?.currency_code || 'USD')
    setLoading(false)
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const metrics = useMemo(() => {
    const mrrEstimate = pickNumber(summary, ['mrr_estimate', 'mrr', 'monthly_recurring_revenue'])
    const activeCount = pickNumber(summary, ['total_active', 'active_subscriptions', 'active_count'])
    const trialingCount = pickNumber(summary, ['total_trialing', 'trialing_subscriptions', 'trialing_count'])
    const cancelledCount = pickNumber(summary, ['total_cancelled', 'cancelled_subscriptions', 'cancelled_count'])
    return { mrrEstimate, activeCount, trialingCount, cancelledCount }
  }, [summary])

  const paidTransactions = paymentRows.filter((row) => row.status === 'paid')
  const paidAmountBase = multiCurrencyRows.reduce(
    (sum, row) => sum + Number(row.total_amount_base || 0),
    0,
  )

  if (loading) return <LoadingState message="Loading revenue dashboard..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <PermissionGate permission="subscriptions.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Revenue Dashboard</h1>
            <p className="text-sm text-gray-500">
              Subscription KPIs with multi-currency revenue aggregated to base currency ({baseCurrency}).
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
            <button type="button" onClick={loadDashboard} className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70">Apply Range</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard title="MRR Estimate" value={formatCurrency(metrics.mrrEstimate, baseCurrency)} />
          <AdminCard title="Active Subscriptions" value={metrics.activeCount} />
          <AdminCard title="Trialing Subscriptions" value={metrics.trialingCount} />
          <AdminCard title="Cancelled Subscriptions" value={metrics.cancelledCount} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard title="Payments (Range)" value={paymentRows.length} />
          <AdminCard title="Paid Transactions" value={paidTransactions.length} />
          <AdminCard title={`Paid Amount (${baseCurrency})`} value={formatCurrency(paidAmountBase, baseCurrency)} />
          <AdminCard title="Currency Breakdowns" value={multiCurrencyRows.length} />
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Multi-Currency Revenue</h2>
          <div className="mt-4">
            {multiCurrencyRows.length === 0 ? (
              <EmptyState title="No revenue in range" description="Try a wider date range." />
            ) : (
              <AdminTable
                rows={multiCurrencyRows}
                columns={[
                  { key: 'currency', label: 'Currency', render: (r) => r.currency || '—' },
                  { key: 'total_amount', label: 'Total (Native)', render: (r) => formatCurrency(r.total_amount, r.currency || baseCurrency) },
                  { key: 'total_amount_base', label: `Total (${baseCurrency})`, render: (r) => formatCurrency(r.total_amount_base, baseCurrency) },
                  { key: 'transaction_count', label: 'Transactions', render: (r) => r.transaction_count ?? 0 },
                ]}
              />
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Payment Transactions</h2>
          <div className="mt-4">
            {paymentRows.length === 0 ? (
              <EmptyState title="No payments in range" description="Try a wider date range." />
            ) : (
              <AdminTable
                rows={paymentRows}
                columns={[
                  { key: 'id', label: 'Payment ID' },
                  { key: 'subscription_id', label: 'Subscription', render: (r) => r.subscription_id || '—' },
                  { key: 'user_id', label: 'User', render: (r) => r.user_id || '—' },
                  { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount, r.currency || baseCurrency) },
                  { key: 'payment_method', label: 'Method', render: (r) => r.payment_method || '—' },
                  { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status || 'unknown'} variant={r.status || 'default'} /> },
                  { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
                ]}
              />
            )}
          </div>
        </div>
      </div>
    </PermissionGate>
  )
}
