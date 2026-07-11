import { useEffect, useMemo, useState } from 'react'
import {
  buildRatesMap,
  convertCurrency,
  currenciesRowsToMap,
  currenciesRowsToOptions,
  exportToFile,
  fetchActiveCurrencies,
  fetchBaseCurrency,
  fetchCurrentExchangeRates,
  fetchPaymentTransactions,
  formatCurrency,
  formatDate,
  generateExportFilename,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminTable,
  EmptyState,
  LoadingState,
  SearchBar,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const toDateFilterValue = (value, isEndOfDay = false) => {
  if (!value) return null
  return isEndOfDay ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`
}

export default function PaymentTransactionsPage() {
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currencyFilter, setCurrencyFilter] = useState('all')
  const [currencyOptions, setCurrencyOptions] = useState([])
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [ratesMap, setRatesMap] = useState(new Map())
  const [currenciesMap, setCurrenciesMap] = useState({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const loadTransactions = async () => {
    setLoading(true)
    setError(null)
    const filters = []
    const fromValue = toDateFilterValue(dateFrom, false)
    const toValue = toDateFilterValue(dateTo, true)
    if (fromValue) filters.push({ op: 'gte', col: 'created_at', val: fromValue })
    if (toValue) filters.push({ op: 'lte', col: 'created_at', val: toValue })

    const [txRes, currenciesRes, baseRes, ratesRes] = await Promise.all([
      fetchPaymentTransactions({ filters }),
      fetchActiveCurrencies(),
      fetchBaseCurrency(),
      fetchCurrentExchangeRates(),
    ])

    if (txRes.error) {
      setError(toErrorMessage(txRes.error, 'Failed to load payment transactions.'))
      setRows([])
    } else {
      setRows(txRes.data || [])
    }

    if (!currenciesRes.error) {
      setCurrencyOptions(currenciesRowsToOptions(currenciesRes.data || []))
      setCurrenciesMap(currenciesRowsToMap(currenciesRes.data || []))
    }
    if (!baseRes.error && baseRes.data?.currency_code) {
      setBaseCurrency(baseRes.data.currency_code)
    }
    if (!ratesRes.error) {
      setRatesMap(buildRatesMap(ratesRes.data || []))
    }

    setLoading(false)
  }

  useEffect(() => {
    loadTransactions()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (currencyFilter !== 'all' && (row.currency || 'USD') !== currencyFilter) return false
      if (!query) return true
      return [row.id, row.user_id, row.subscription_id, row.payment_method, row.status, row.currency]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, currencyFilter])

  const totalAmount = useMemo(() => {
    if (currencyFilter !== 'all') {
      return filteredRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    }
    return filteredRows.reduce((sum, row) => {
      const amount = Number(row.amount || 0)
      const from = row.currency || baseCurrency
      if (from === baseCurrency) return sum + amount
      const converted = convertCurrency(amount, from, baseCurrency, ratesMap, baseCurrency, currenciesMap)
      return sum + (converted ?? amount)
    }, 0)
  }, [filteredRows, currencyFilter, baseCurrency, ratesMap, currenciesMap])

  const totalAmountLabel = currencyFilter !== 'all'
    ? currencyFilter
    : baseCurrency

  const paidCount = filteredRows.filter((row) => row.status === 'paid').length
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, currencyFilter, dateFrom, dateTo])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const handleExport = () => {
    const exportRows = filteredRows.map((row) => ({
      ...row,
      amount_label: formatCurrency(row.amount, row.currency || baseCurrency),
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'id', label: 'Payment ID' },
        { key: 'subscription_id', label: 'Subscription' },
        { key: 'user_id', label: 'User' },
        { key: 'payment_method', label: 'Method' },
        { key: 'amount_label', label: 'Amount' },
        { key: 'currency', label: 'Currency' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Created At' },
      ],
      generateExportFilename('payment_transactions', { status: statusFilter, currency: currencyFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Payment transactions exported.')
  }

  if (loading) return <LoadingState message="Loading payment transactions..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <PermissionGate permission="subscriptions.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Payment Transactions</h1>
            <p className="text-sm text-gray-500">Review subscription payment history and filter by date range or currency.</p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="w-full sm:w-80">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by payment, user, subscription..." />
            </div>
            <button
              type="button"
              onClick={handleExport}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              Export
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">From Date</label>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">To Date</label>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none">
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Currency</label>
            <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none">
              <option value="all">All currencies</option>
              {currencyOptions.map(({ code, label }) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={loadTransactions} className="w-full rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70">Apply Filters</button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AdminCard title="Transactions" value={filteredRows.length} />
          <AdminCard title="Paid" value={paidCount} />
          <AdminCard title={`Total Amount (${totalAmountLabel})`} value={formatCurrency(totalAmount, totalAmountLabel)} />
          <AdminCard title="Date Filtered Rows" value={rows.length} />
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState title="No transactions found" description="Try adjusting status, currency, date range, or search." />
        ) : (
          <>
            <AdminTable
              rows={filteredRows}
              page={page}
              pageSize={PAGE_SIZE}
              columns={[
                { key: 'id', label: 'Payment ID' },
                { key: 'subscription_id', label: 'Subscription', render: (r) => r.subscription_id || '—' },
                { key: 'user_id', label: 'User', render: (r) => r.user_id || '—' },
                { key: 'payment_method', label: 'Method', render: (r) => r.payment_method || '—' },
                { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount, r.currency || baseCurrency) },
                { key: 'currency', label: 'Currency', render: (r) => r.currency || baseCurrency },
                { key: 'status', label: 'Status', render: (r) => <AdminBadge label={r.status || 'unknown'} variant={r.status || 'default'} /> },
                { key: 'created_at', label: 'Created At', render: (r) => formatDate(r.created_at) },
              ]}
            />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-gray-500">
                Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </PermissionGate>
  )
}
