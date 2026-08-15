import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PAYMENT_EVENT_TYPE_CONFIG,
  PermissionGate,
  exportToFile,
  generateExportFilename,
  fetchCountries,
  fetchPaymentEvents,
  fetchPaymentJourney,
  fetchPaymentMonitorStats,
  formatCurrency,
  formatDate,
  listPaymentGateways,
  subscribePaymentEvents,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminModal,
  AdminTable,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const toError = (e, fb) => (typeof e === 'string' ? e : e?.message || fb)
const toIso = (date, end = false) => (date ? `${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : null)

function statusVariant(status) {
  const map = { success: 'success', failed: 'failed', pending: 'pending', retrying: 'retrying', refunded: 'refunded' }
  return map[status] || 'default'
}

function JourneyPreview({ subscriptionId, targetSystem, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const { data } = await fetchPaymentJourney(subscriptionId, targetSystem)
      setEvents(data || [])
      setLoading(false)
    })()
  }, [subscriptionId, targetSystem])

  if (loading) return <LoadingState message="Loading journey..." />

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {events.map((event) => {
        const cfg = PAYMENT_EVENT_TYPE_CONFIG[event.event_type] || { icon: '●', color: 'text-gray-400', label: event.event_type }
        return (
          <div key={event.id} className="border-l-2 border-gray-700 pl-4">
            <p className={`text-sm font-medium ${cfg.color}`}>{cfg.icon} {formatDate(event.created_at)} — {cfg.label}</p>
            <p className="text-xs text-gray-500">
              {event.method_display_name && `Method: ${event.method_display_name}`}
              {event.gateway_name && ` · Gateway: ${event.gateway_name}`}
              {event.amount != null && ` · ${formatCurrency(event.amount, event.currency || 'USD')}`}
            </p>
            {event.failure_message && <p className="text-xs text-red-400">{event.failure_message}</p>}
          </div>
        )
      })}
      <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-200">Close</button>
    </div>
  )
}

export default function PaymentMonitorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showError } = useToast()
  const showErrorRef = useRef(showError)
  showErrorRef.current = showError

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const [dateFrom, setDateFrom] = useState(yesterday.toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(now.toISOString().slice(0, 10))
  const [gatewayId, setGatewayId] = useState('')
  const [status, setStatus] = useState(() => searchParams.get('status') || '')
  const [countryCode, setCountryCode] = useState('')
  const [search, setSearch] = useState('')
  const [gateways, setGateways] = useState([])
  const [countries, setCountries] = useState([])
  const [stats, setStats] = useState({})
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [journeyModal, setJourneyModal] = useState(null)

  const filters = useMemo(() => ({
    from: toIso(dateFrom),
    to: toIso(dateTo, true),
    gatewayId: gatewayId || null,
    status: status || null,
    countryCode: countryCode || null,
    search: search.trim() || null,
    limit: 200,
  }), [dateFrom, dateTo, gatewayId, status, countryCode, search])

  const loadData = async () => {
    setLoading(true)
    const [statsRes, eventsRes] = await Promise.all([
      fetchPaymentMonitorStats(toIso(dateFrom), toIso(dateTo, true)),
      fetchPaymentEvents(filters),
    ])
    if (statsRes.error || eventsRes.error) {
      showErrorRef.current(toError(statsRes.error || eventsRes.error, 'Failed to load monitor data'))
    }
    setStats(statsRes.data || {})
    setRows(eventsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => {
      const [gwRes, countriesRes] = await Promise.all([
        listPaymentGateways(),
        fetchCountries({ activeOnly: true }),
      ])
      setGateways(gwRes.data || [])
      setCountries(countriesRes.data || [])
    })()
  }, [])

  useEffect(() => { loadData() }, [filters])

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await fetchPaymentMonitorStats(toIso(dateFrom), toIso(dateTo, true))
      if (data) setStats(data)
    }, 30000)
    return () => clearInterval(interval)
  }, [dateFrom, dateTo])

  useEffect(() => {
    return subscribePaymentEvents((newRow) => {
      setRows((prev) => [{ ...newRow, display_status: newRow.event_type }, ...prev].slice(0, 200))
    })
  }, [])

  const exportCsv = () => {
    exportToFile(rows, [
      { key: 'created_at', label: 'Time' },
      { key: 'user_email', label: 'Customer' },
      { key: 'country_code', label: 'Country' },
      { key: 'method_display_name', label: 'Method' },
      { key: 'gateway_name', label: 'Gateway' },
      { key: 'amount', label: 'Amount' },
      { key: 'display_status', label: 'Status' },
      { key: 'attempt_number', label: 'Retry #' },
      { key: 'duration_ms', label: 'Duration (ms)' },
    ], generateExportFilename('payment-events', filters))
  }

  const statCards = [
    { label: 'Total Today', value: stats.total_today ?? '—' },
    { label: 'Success Rate', value: stats.success_rate != null ? `${stats.success_rate}%` : '—' },
    { label: 'Active Retries', value: stats.active_retries ?? '—' },
    { label: 'Gateway Alerts', value: stats.gateway_alerts ?? '—' },
  ]

  return (
    <PermissionGate permission="billing.payment_config.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Transaction Monitor</h1>
            <p className="text-sm text-gray-500">Live payment events across all gateways</p>
          </div>
          <button type="button" onClick={exportCsv} className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">
            Export CSV
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-100">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          <select value={gatewayId} onChange={(e) => setGatewayId(e.target.value)} className={inputClass}>
            <option value="">All gateways</option>
            {gateways.map((g) => <option key={g.id} value={g.id}>{g.display_name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">All statuses</option>
            {['success', 'failed', 'pending', 'retrying', 'refunded'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} className={inputClass}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c.country_code} value={c.country_code}>{c.country_code}</option>)}
          </select>
          <input
            type="search"
            placeholder="Email or transaction ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} min-w-[200px]`}
          />
        </div>

        {loading ? (
          <LoadingState message="Loading transactions..." />
        ) : rows.length === 0 ? (
          <EmptyState title="No payment events" description="Adjust filters or run the payment events seed." />
        ) : (
          <AdminTable
            rows={rows}
            columns={[
              { key: 'created_at', label: 'Time', render: (r) => formatDate(r.created_at) },
              {
                key: 'user_email',
                label: 'Customer',
                render: (r) => r.user_id ? (
                  <button type="button" className="text-cyan-400 hover:underline" onClick={() => navigate(`/users/user-detail?id=${r.user_id}`)}>
                    {r.user_email || r.user_id}
                  </button>
                ) : (r.user_email || '—'),
              },
              { key: 'country_code', label: 'Country', render: (r) => r.country_code || '—' },
              { key: 'method_display_name', label: 'Method', render: (r) => r.method_display_name || '—' },
              { key: 'gateway_name', label: 'Gateway', render: (r) => r.gateway_name || '—' },
              { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount, r.currency || 'USD') },
              {
                key: 'display_status',
                label: 'Status',
                render: (r) => <AdminBadge label={r.display_status || r.event_type} variant={statusVariant(r.display_status || r.event_type)} />,
              },
              { key: 'attempt_number', label: 'Retry #', render: (r) => (r.attempt_number > 1 ? r.attempt_number : '—') },
              { key: 'duration_ms', label: 'Duration', render: (r) => (r.duration_ms ? `${r.duration_ms}ms` : '—') },
              {
                key: 'actions',
                label: 'Actions',
                render: (r) => r.subscription_id ? (
                  <button
                    type="button"
                    className="text-xs text-cyan-400 hover:underline"
                    onClick={() => setJourneyModal({ subscriptionId: r.subscription_id, targetSystem: r.target_system || 'platform' })}
                  >
                    View Journey
                  </button>
                ) : '—',
              },
            ]}
          />
        )}

        <AdminModal
          open={Boolean(journeyModal)}
          title="Payment Journey"
          onClose={() => setJourneyModal(null)}
        >
          {journeyModal && (
            <JourneyPreview
              subscriptionId={journeyModal.subscriptionId}
              targetSystem={journeyModal.targetSystem}
              onClose={() => setJourneyModal(null)}
            />
          )}
        </AdminModal>
      </div>
    </PermissionGate>
  )
}
