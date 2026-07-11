import { useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  PermissionGate,
  generatePaymentReport,
  generateExportFilename,
  exportToFile,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminTable,
  EmptyState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const CACHE_TTL_MS = 5 * 60 * 1000
const PAGE_SIZE = 25

const REPORTS = [
  {
    id: 'payment_summary',
    title: 'Payment Summary Report',
    description: 'Daily/weekly/monthly totals — attempts, successes, failures, refunds, net revenue.',
    supportsGranularity: true,
  },
  {
    id: 'failed_payments',
    title: 'Failed Payments Report',
    description: 'Every failed payment with failure codes and resolution status.',
  },
  {
    id: 'gateway_performance',
    title: 'Gateway Performance Report',
    description: 'Side-by-side gateway success rates, retries, and revenue.',
  },
  {
    id: 'retry_analytics',
    title: 'Retry Analytics Report',
    description: 'Recovery rates per retry rule and attempt number.',
  },
  {
    id: 'settlement',
    title: 'Settlement Report',
    description: 'Payments matched to settlement accounts for reconciliation.',
  },
  {
    id: 'promo_redemption',
    title: 'Promo Code Redemption Report',
    description: 'Promo usage, discounts given, and revenue impact.',
  },
]

const toIso = (date, end = false) => (date ? `${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z` : null)

function relativeTime(ts) {
  if (!ts) return 'Never'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
}

function rowsToColumns(rows) {
  if (!rows?.length) return []
  return Object.keys(rows[0]).map((key) => ({ key, label: key.replaceAll('_', ' ') }))
}

function exportPdf(reportTitle, dateFrom, dateTo, rows, columns) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' })
  doc.setFontSize(16)
  doc.text(reportTitle, 14, 20)
  doc.setFontSize(10)
  doc.text(`Period: ${dateFrom} to ${dateTo}`, 14, 28)
  doc.text(`Generated: ${new Date().toISOString()}`, 14, 34)
  autoTable(doc, {
    startY: 42,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? ''))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [31, 41, 55] },
  })
  doc.save(generateExportFilename(reportTitle.replace(/\s+/g, '-').toLowerCase(), {}, 'pdf'))
}

function ReportCard({ report, isActive, onGenerate }) {
  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date()
  monthAgo.setDate(monthAgo.getDate() - 30)

  const [dateFrom, setDateFrom] = useState(monthAgo.toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(today)
  const [granularity, setGranularity] = useState('daily')
  const [generating, setGenerating] = useState(false)
  const [lastGenerated, setLastGenerated] = useState(null)

  const handleGenerate = async () => {
    setGenerating(true)
    const params = {
      from: toIso(dateFrom),
      to: toIso(dateTo, true),
      granularity,
      dateFrom,
      dateTo,
    }
    const { fromCache } = await onGenerate(report, params)
    if (!fromCache) setLastGenerated(Date.now())
    setGenerating(false)
  }

  return (
    <AdminCard
      title={report.title}
      className={isActive ? 'ring-1 ring-blue-600/60' : undefined}
    >
      <p className="text-sm text-gray-500">{report.description}</p>
      <p className="mt-2 text-xs text-gray-600">Last generated: {relativeTime(lastGenerated)}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
        {report.supportsGranularity && (
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className={inputClass}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        )}
        <button
          type="button"
          disabled={generating}
          onClick={handleGenerate}
          className="rounded border border-blue-700 bg-blue-900/40 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-900/70 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </AdminCard>
  )
}

function ReportDisplayPanel({ display, page, onPageChange, onExportCsv, onExportPdf }) {
  if (!display) {
    return (
      <AdminCard title="Report display">
        <EmptyState
          title="No report loaded"
          description="Choose a report above, set your date range, and click Generate. Results appear here at full width for easy reading."
        />
      </AdminCard>
    )
  }

  const { report, dateFrom, dateTo, granularity, rows, columns, lastGenerated } = display
  const totalPages = Math.max(1, Math.ceil((rows?.length || 0) / PAGE_SIZE))

  return (
    <AdminCard title="Report display">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-100">{report.title}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Period: {dateFrom} to {dateTo}
              {report.supportsGranularity ? ` · ${granularity}` : ''}
            </p>
            <p className="mt-1 text-xs text-gray-600">
              {rows.length} row{rows.length === 1 ? '' : 's'} · Generated {relativeTime(lastGenerated)}
            </p>
          </div>
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExportCsv}
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={onExportPdf}
                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
              >
                Export PDF
              </button>
            </div>
          )}
        </div>

        {rows.length > 0 ? (
          <>
            <AdminTable rows={rows} columns={columns} page={page} pageSize={PAGE_SIZE} />
            {rows.length > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => onPageChange(page - 1)}
                    className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => onPageChange(page + 1)}
                    className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState title="No data for this period" description="Try a wider date range or run payment events seed data." />
        )}
      </div>
    </AdminCard>
  )
}

export default function PaymentReportsPage() {
  const { showError } = useToast()
  const [cache] = useState(() => new Map())
  const [display, setDisplay] = useState(null)
  const [page, setPage] = useState(1)
  const displayRef = useRef(null)

  const runReport = async (report, params) => {
    const cacheKey = `${report.id}:${params.dateFrom}:${params.dateTo}:${params.granularity || 'daily'}`
    const cached = cache.get(cacheKey)
    let rows
    let columns
    let fromCache = false

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      rows = cached.rows
      columns = cached.columns
      fromCache = true
    } else {
      const result = await generatePaymentReport(report.id, params)
      if (result.error) {
        showError(typeof result.error === 'string' ? result.error : result.error.message)
        return { fromCache: false }
      }
      rows = result.data || []
      columns = rowsToColumns(rows)
      cache.set(cacheKey, { rows, columns, at: Date.now() })
    }

    setDisplay({
      report,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      granularity: params.granularity,
      rows,
      columns,
      lastGenerated: fromCache ? cache.get(cacheKey)?.at : Date.now(),
    })
    setPage(1)
    requestAnimationFrame(() => {
      displayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return { fromCache }
  }

  return (
    <PermissionGate permission="billing.payment_config.view">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Payment Reports</h1>
          <p className="text-sm text-gray-500">
            Configure and generate payment reports below — results open in the full-width display panel
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {REPORTS.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              isActive={display?.report.id === report.id}
              onGenerate={runReport}
            />
          ))}
        </div>

        <div ref={displayRef}>
          <ReportDisplayPanel
            display={display}
            page={page}
            onPageChange={setPage}
            onExportCsv={() => {
              if (!display?.rows?.length) return
              exportToFile(
                display.rows,
                display.columns,
                generateExportFilename(display.report.id, {
                  dateFrom: display.dateFrom,
                  dateTo: display.dateTo,
                }),
              )
            }}
            onExportPdf={() => {
              if (!display?.rows?.length) return
              exportPdf(
                display.report.title,
                display.dateFrom,
                display.dateTo,
                display.rows,
                display.columns,
              )
            }}
          />
        </div>

        {REPORTS.length === 0 && <EmptyState title="No reports configured" />}
      </div>
    </PermissionGate>
  )
}
