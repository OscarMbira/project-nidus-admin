import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PermissionGate,
  fetchGatewayPerformance,
  fetchPaymentDashboardKpis,
  fetchPaymentGeographicBreakdown,
  fetchPaymentMethodBreakdown,
  fetchPaymentRevenueChart,
  fetchRecentFailedPayments,
  formatCurrency,
  formatDate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminTable,
  DetachButton,
  EmptyState,
  LoadingState,
  inputClass,
} from '@nidus-admin/ui'
import { PaymentMethodDonutChart, StackedGatewayBarChart } from '../components/PaymentDashboardCharts.jsx'

const toIso = (date, end = false) => (date ? `${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : null)

function TrendArrow({ value }) {
  if (value == null) return <span className="text-xs text-gray-500">—</span>
  const up = value >= 0
  return (
    <span className={`text-xs ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  )
}

function KpiCard({ label, value, change, suffix = '' }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-100">{value}{suffix}</p>
      <div className="mt-1"><TrendArrow value={change} /></div>
    </div>
  )
}

export default function PaymentDashboardPage() {
  const navigate = useNavigate()
  const today = new Date()
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(today.getDate() - 30)

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(today.toISOString().slice(0, 10))
  const [chartMetric, setChartMetric] = useState('revenue')
  const [methodFilter, setMethodFilter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})
  const [chartRows, setChartRows] = useState([])
  const [methodRows, setMethodRows] = useState([])
  const [gatewayRows, setGatewayRows] = useState([])
  const [geoRows, setGeoRows] = useState([])
  const [failedRows, setFailedRows] = useState([])

  const range = useMemo(() => ({
    from: toIso(dateFrom),
    to: toIso(dateTo, true),
  }), [dateFrom, dateTo])

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const [kpiRes, chartRes, methodRes, gwRes, geoRes, failRes] = await Promise.all([
        fetchPaymentDashboardKpis(range.from, range.to),
        fetchPaymentRevenueChart(range.from, range.to, 'daily', methodFilter),
        fetchPaymentMethodBreakdown(range.from, range.to),
        fetchGatewayPerformance(range.from, range.to),
        fetchPaymentGeographicBreakdown(range.from, range.to),
        fetchRecentFailedPayments(10),
      ])
      setKpis(kpiRes.data || {})
      setChartRows(chartRes.data || [])
      setMethodRows(methodRes.data || [])
      setGatewayRows(gwRes.data || [])
      setGeoRows(geoRes.data || [])
      setFailedRows(failRes.data || [])
      setLoading(false)
    })()
  }, [range.from, range.to, methodFilter])

  const chartData = useMemo(() => {
    const byPeriod = new Map()
    chartRows.forEach((row) => {
      const key = row.period_start
      if (!byPeriod.has(key)) {
        byPeriod.set(key, { period: key, paynow: 0, flutterwave: 0, paddle: 0 })
      }
      const entry = byPeriod.get(key)
      const provider = row.gateway_provider
      const val = chartMetric === 'revenue'
        ? Number(row.revenue || 0)
        : chartMetric === 'count'
          ? Number(row.transaction_count || 0)
          : Number(row.success_rate || 0)
      if (provider === 'paynow') entry.paynow = val
      else if (provider === 'flutterwave') entry.flutterwave = val
      else if (provider === 'paddle') entry.paddle = val
    })
    return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period))
  }, [chartRows, chartMetric])

  const pieData = methodRows.map((row) => ({
    name: row.method_display_name || row.method_type,
    value: Number(row.payment_count || 0),
    methodType: row.method_type,
  }))

  const pieColors = ['#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#eab308', '#ec4899', '#6b7280']

  const geoRevenueTotal = useMemo(
    () => geoRows.reduce((sum, row) => sum + Number(row.revenue || 0), 0),
    [geoRows],
  )

  const failedAmountTotal = useMemo(() => {
    if (!failedRows.length) return null
    const byCurrency = failedRows.reduce((acc, row) => {
      const currency = row.currency || 'USD'
      acc[currency] = (acc[currency] || 0) + Number(row.amount || 0)
      return acc
    }, {})
    const entries = Object.entries(byCurrency)
    if (entries.length === 1) {
      const [currency, total] = entries[0]
      return formatCurrency(total, currency)
    }
    return entries.map(([currency, total]) => formatCurrency(total, currency)).join(' · ')
  }, [failedRows])

  if (loading) return <LoadingState message="Loading payment dashboard..." />

  return (
    <PermissionGate permission="billing.payment_config.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Payment Dashboard</h1>
            <p className="text-sm text-gray-500">Aggregated payment health and performance</p>
          </div>
          <div className="flex gap-2">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
            <DetachButton label="Detach" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Total Revenue" value={formatCurrency(kpis.total_revenue, 'USD')} change={kpis.total_revenue_change_pct} />
          <KpiCard label="Success Rate" value={kpis.success_rate ?? 0} suffix="%" change={kpis.success_rate_change_pct} />
          <KpiCard label="Total Transactions" value={kpis.total_transactions ?? 0} change={kpis.total_transactions_change_pct} />
          <KpiCard label="Active Retries" value={kpis.active_retries ?? 0} />
          <KpiCard label="Avg Transaction" value={formatCurrency(kpis.avg_transaction_value, 'USD')} change={kpis.avg_transaction_value_change_pct} />
          <KpiCard label="Refund Rate" value={kpis.refund_rate ?? 0} suffix="%" change={kpis.refund_rate_change_pct} />
        </div>

        <AdminCard title="Revenue Over Time">
          <div className="mb-3 flex gap-2">
            {[
              { key: 'revenue', label: 'Total Revenue' },
              { key: 'count', label: 'Transaction Count' },
              { key: 'rate', label: 'Success Rate' },
            ].map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setChartMetric(opt.key === 'rate' ? 'rate' : opt.key)}
                className={`rounded px-2 py-1 text-xs ${chartMetric === opt.key || (opt.key === 'rate' && chartMetric === 'rate') ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
              >
                {opt.label}
              </button>
            ))}
            {methodFilter && (
              <button type="button" onClick={() => setMethodFilter(null)} className="text-xs text-cyan-400 hover:underline">
                Clear method filter ({methodFilter})
              </button>
            )}
          </div>
          {chartData.length === 0 ? (
            <EmptyState title="No chart data" description="Run payment events seed for historical data." />
          ) : (
            <StackedGatewayBarChart data={chartData} metric={chartMetric} />
          )}
        </AdminCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <AdminCard title="Payment Method Breakdown">
            {pieData.length === 0 ? (
              <EmptyState title="No method data" />
            ) : (
              <PaymentMethodDonutChart
                data={pieData}
                colors={pieColors}
                onSelectMethod={(methodType) => setMethodFilter(methodType)}
              />
            )}
          </AdminCard>

          <AdminCard title="Gateway Performance">
            {gatewayRows.length === 0 ? (
              <EmptyState title="No gateway data" />
            ) : (
              <AdminTable
              rows={gatewayRows}
              columns={[
                { key: 'gateway_name', label: 'Gateway' },
                { key: 'total_attempts', label: 'Attempts' },
                { key: 'success_rate', label: 'Success %', render: (r) => `${r.success_rate}%` },
                { key: 'failed_rate', label: 'Failed %', render: (r) => `${r.failed_rate}%` },
                { key: 'retried_count', label: 'Retried' },
                { key: 'avg_duration_ms', label: 'Avg ms' },
                { key: 'revenue', label: 'Revenue', render: (r) => formatCurrency(r.revenue, 'USD') },
                {
                  key: 'is_active',
                  label: 'Status',
                  render: (r) => <AdminBadge label={r.is_active ? 'Active' : 'Inactive'} variant={r.is_active ? 'active' : 'suspended'} />,
                },
              ]}
              />
            )}
          </AdminCard>
        </div>

        <AdminCard title="Geographic Breakdown (Top 20)">
          {geoRows.length === 0 ? (
            <EmptyState title="No geographic data" />
          ) : (
            <AdminTable
            rows={geoRows}
            columns={[
              { key: 'country_code', label: 'Country', render: (r) => `${r.country_code} — ${r.country_name || ''}` },
              { key: 'transaction_count', label: 'Transactions' },
              { key: 'revenue', label: 'Revenue', render: (r) => formatCurrency(r.revenue, 'USD') },
              { key: 'success_rate', label: 'Success %', render: (r) => `${r.success_rate}%` },
              { key: 'top_method', label: 'Top Method' },
            ]}
            summaryRow={{
              revenue: formatCurrency(geoRevenueTotal, 'USD'),
            }}
            />
          )}
        </AdminCard>

        <AdminCard title="Recent Failed Payments">
          {failedRows.length === 0 ? (
            <EmptyState title="No unresolved failures" />
          ) : (
            <AdminTable
              rows={failedRows}
              columns={[
                { key: 'created_at', label: 'Time', render: (r) => formatDate(r.created_at) },
                { key: 'user_email', label: 'Customer' },
                { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount, r.currency || 'USD') },
                { key: 'method_display_name', label: 'Method' },
                { key: 'failure_message', label: 'Reason' },
                { key: 'attempt_number', label: 'Retry #' },
                { key: 'next_retry_at', label: 'Next Retry', render: (r) => formatDate(r.next_retry_at) || '—' },
                {
                  key: 'actions',
                  label: 'Actions',
                  render: (r) => r.subscription_id ? (
                    <button
                      type="button"
                      className="text-xs text-cyan-400 hover:underline"
                      onClick={() => navigate(`/subscriptions/subscription-detail?id=${r.subscription_id}&system=platform`)}
                    >
                      View Journey
                    </button>
                  ) : '—',
                },
              ]}
              summaryRow={{
                amount: failedAmountTotal,
              }}
            />
          )}
        </AdminCard>
      </div>
    </PermissionGate>
  )
}
