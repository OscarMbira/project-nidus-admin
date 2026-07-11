import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchImprovementBacklog, formatDate } from '@nidus-admin/shared'
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
const STATUS_FILTERS = ['all', 'backlog', 'planned', 'in_progress', 'testing', 'completed', 'cancelled']
const TYPE_FILTERS = ['all', 'enhancement', 'bug_fix', 'performance', 'ux', 'accessibility', 'documentation', 'mobile', 'feature_polish']

const statusVariant = (status) => {
  if (status === 'completed') return 'active'
  if (status === 'cancelled') return 'rejected'
  if (status === 'in_progress' || status === 'testing') return 'retrying'
  if (status === 'planned') return 'success'
  if (status === 'backlog') return 'pending'
  return 'default'
}

export default function ImprovementBacklogPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [detailRow, setDetailRow] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchImprovementBacklog()
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
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (typeFilter !== 'all' && row.improvement_type !== typeFilter) return false
      if (!query) return true
      return [
        row.title,
        row.description,
        row.status,
        row.improvement_type,
        row.planned_release,
        ...(row.tags || []),
      ].some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, typeFilter])

  const activeCount = useMemo(
    () => filteredRows.filter((r) => ['backlog', 'planned', 'in_progress', 'testing'].includes(r.status)).length,
    [filteredRows],
  )

  const topPriority = useMemo(() => {
    const scores = filteredRows.map((r) => Number(r.priority_score) || 0)
    return scores.length ? Math.max(...scores).toFixed(0) : '—'
  }, [filteredRows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, typeFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  if (loading) return <LoadingState message="Loading improvement backlog..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Improvement Backlog</h1>
          <p className="text-sm text-gray-500">Prioritised improvements linked to bugs, features, and user feedback.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search title, type, status, release, tags..." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total items" value={filteredRows.length} />
        <AdminCard title="Active pipeline" value={activeCount} />
        <AdminCard title="In progress" value={filteredRows.filter((r) => r.status === 'in_progress').length} />
        <AdminCard title="Top priority score" value={topPriority} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Type</label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
            {TYPE_FILTERS.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All types' : type.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No backlog items found" description="Adjust filters or run the improvement backlog seed." />
      ) : (
        <>
          <AdminTable
            rows={filteredRows}
            page={page}
            pageSize={PAGE_SIZE}
            columns={[
              { key: 'title', label: 'Title', render: (r) => r.title || '—' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={(r.status || 'unknown').replace('_', ' ')} variant={statusVariant(r.status)} />,
              },
              { key: 'improvement_type', label: 'Type', render: (r) => (r.improvement_type || '—').replace('_', ' ') },
              {
                key: 'priority_score',
                label: 'Priority',
                render: (r) => (r.priority_score != null ? Number(r.priority_score).toFixed(0) : '—'),
              },
              { key: 'planned_release', label: 'Release', render: (r) => r.planned_release || '—' },
              { key: 'target_completion_date', label: 'Target', render: (r) => formatDate(r.target_completion_date) },
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

      <AdminModal open={Boolean(detailRow)} title={detailRow?.title || 'Backlog item'} onClose={() => setDetailRow(null)}>
        {detailRow && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Status / Type</dt>
              <dd className="text-gray-100">{detailRow.status?.replace('_', ' ')} · {detailRow.improvement_type?.replace('_', ' ')}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Impact / Effort / Priority</dt>
              <dd className="text-gray-100">{detailRow.impact_score} / {detailRow.effort_score} / {detailRow.priority_score}</dd>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Description</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.description}</dd>
            </div>
            {detailRow.source_type && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Source</dt>
                <dd className="text-gray-100">{detailRow.source_type.replace('_', ' ')}</dd>
              </div>
            )}
            {(detailRow.planned_release || detailRow.target_completion_date) && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Release / Target</dt>
                <dd className="text-gray-100">
                  {[detailRow.planned_release, detailRow.target_completion_date ? formatDate(detailRow.target_completion_date) : null].filter(Boolean).join(' · ')}
                </dd>
              </div>
            )}
            {detailRow.improvement_notes && (
              <div className="rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-gray-100">{detailRow.improvement_notes}</dd>
              </div>
            )}
            {detailRow.tags?.length > 0 && (
              <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
                <dt className="text-gray-500">Tags</dt>
                <dd className="text-gray-100">{detailRow.tags.join(', ')}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-100">{formatDate(detailRow.created_at)}</dd>
            </div>
          </dl>
        )}
      </AdminModal>
    </div>
  )
}
