import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchUserFeedback, formatDate } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminModal,
  AdminTable,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12
const TYPE_FILTERS = ['all', 'general_feedback', 'rating', 'bug_report', 'feature_request']
const STATUS_FILTERS = ['all', 'new', 'reviewing', 'acknowledged', 'resolved', 'closed']

const statusVariant = (status) => {
  if (status === 'resolved' || status === 'closed') return 'active'
  if (status === 'acknowledged') return 'success'
  if (status === 'reviewing') return 'retrying'
  if (status === 'new') return 'pending'
  return 'default'
}

const ratingLabel = (rating) => {
  if (rating == null) return '—'
  return `${rating}/5`
}

export default function FeedbackAnalysisPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [detailRow, setDetailRow] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchUserFeedback()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.feedback_type !== typeFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return [row.feedback_text, row.feedback_type, row.status, row.page_url, row.rating]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, typeFilter, statusFilter])

  const ratedRows = useMemo(
    () => filteredRows.filter((row) => row.rating != null),
    [filteredRows],
  )

  const avgRating = useMemo(() => {
    if (ratedRows.length === 0) return null
    const sum = ratedRows.reduce((acc, row) => acc + row.rating, 0)
    return (sum / ratedRows.length).toFixed(1)
  }, [ratedRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, typeFilter, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  if (loading) return <LoadingState message="Loading feedback analysis..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Feedback Analysis</h1>
          <p className="text-sm text-gray-500">User ratings and qualitative feedback across Platform and Simulator.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search feedback text, type, status, page..." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total submissions" value={filteredRows.length} />
        <AdminCard title="Avg rating" value={avgRating ?? '—'} />
        <AdminCard title="New / reviewing" value={filteredRows.filter((r) => ['new', 'reviewing'].includes(r.status)).length} />
        <AdminCard title="Low ratings (1–2)" value={filteredRows.filter((r) => r.rating != null && r.rating <= 2).length} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
            {TYPE_FILTERS.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All types' : type.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No feedback found" description="Adjust filters or run the user feedback seed." />
      ) : (
        <>
          <AdminTable
            rows={filteredRows}
            page={page}
            pageSize={PAGE_SIZE}
            columns={[
              {
                key: 'feedback_type',
                label: 'Type',
                render: (r) => (r.feedback_type || '—').replace(/_/g, ' '),
              },
              {
                key: 'rating',
                label: 'Rating',
                render: (r) => ratingLabel(r.rating),
              },
              {
                key: 'feedback_text',
                label: 'Feedback',
                render: (r) => {
                  const text = r.feedback_text || '—'
                  return text.length > 80 ? `${text.slice(0, 80)}…` : text
                },
              },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={r.status || 'unknown'} variant={statusVariant(r.status)} />,
              },
              { key: 'page_url', label: 'Page', render: (r) => r.page_url || '—' },
              { key: 'created_at', label: 'Submitted', render: (r) => formatDate(r.created_at) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <button
                    type="button"
                    onClick={() => setDetailRow(r)}
                    className="rounded border border-gray-600 bg-gray-800/60 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800"
                  >
                    View
                  </button>
                ),
              },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Previous</button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-50">Next</button>
            </div>
          </div>
        </>
      )}

      <AdminModal open={Boolean(detailRow)} title="Feedback detail" onClose={() => setDetailRow(null)}>
        {detailRow && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Type</dt>
              <dd className="text-gray-100">{detailRow.feedback_type?.replace(/_/g, ' ')}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Rating / Status</dt>
              <dd className="text-gray-100">{ratingLabel(detailRow.rating)} · {detailRow.status}</dd>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Feedback</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.feedback_text}</dd>
            </div>
            {detailRow.page_url && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Page</dt>
                <dd className="truncate text-blue-300">{detailRow.page_url}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Submitted</dt>
              <dd className="text-gray-100">{formatDate(detailRow.created_at)}</dd>
            </div>
          </dl>
        )}
      </AdminModal>
    </div>
  )
}
