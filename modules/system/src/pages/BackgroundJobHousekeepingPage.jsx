/**
 * Admin plan v219, Slice 3 section (monorepo v1352 Slice 3: D11, A1.5, 3.2) — System › Background Jobs ›
 * Housekeeping. Reached from the Background Jobs page (secondary page: back button, rule 73 equivalent).
 *   * Run history: how long job runs are kept (D11), edited on its own routed page.
 *   * Log retention: the tables the weekly retention job trims (public.retention_targets).
 *   * Storage clean-up: the buckets the clean-up job checks, report only until deletion is switched on.
 * Rows open routed edit pages (Admin rule 18); every change needs a reason and is audited (Admin SQL v262).
 * Lists: search, Card / Table toggle defaulting to table (rule 12), # numbers, export (rule 11), default order
 * name A→Z then oldest first (rule 12.1), icon-only Edit (rule 15).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import {
  describeStatusFilter,
  fetchBackgroundJobHousekeeping,
  formatJobTime,
  getDisplayRowNumber,
  sortByLabelThenCreated,
  useCurrentAdmin,
} from '@nidus-admin/shared'
import {
  AdminFieldLabelWithHelp,
  AdminIconActionButton,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
} from '@nidus-admin/ui'
import { JobStatusPill } from './backgroundJobUi.jsx'

const readView = (key) => { try { return localStorage.getItem(key) || 'table' } catch { return 'table' } }

/** One searchable list with Card / Table toggle and export. `fields` drive the card body and the export. */
function HousekeepingList({ title, intro, viewKey, rows, idKey, columns, exportColumns, exportName, cardTitle, onEdit, canEdit, emptyText }) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState(() => readView(viewKey))
  useEffect(() => { try { localStorage.setItem(viewKey, view) } catch { /* ignore */ } }, [viewKey, view])

  const q = search.trim().toLowerCase()
  const visible = rows.filter((r) => !q || exportColumns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q)))
  const actions = { key: 'actions', label: 'Actions', sortable: false, render: (r) => (canEdit
    ? <AdminIconActionButton variant="edit" label={`Edit ${cardTitle(r)}`} onClick={() => onEdit(r)} />
    : null) }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">{intro}</p>
        </div>
        <ExportListMenu columns={exportColumns} data={visible} baseFilename={exportName} disabled={!visible.length} />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <SearchBar value={search} onChange={setSearch} placeholder={`Search ${title.toLowerCase()}...`} />
        <ViewToggle view={view} onChange={setView} />
      </div>
      {visible.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()}`} description={q ? 'Nothing matches your search.' : emptyText} />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r, i) => (
            <div key={r[idKey]} className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: visible.length })} />
                {canEdit && <AdminIconActionButton variant="edit" label={`Edit ${cardTitle(r)}`} onClick={() => onEdit(r)} />}
              </div>
              <p className="break-words font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{cardTitle(r)}</p>
              {exportColumns.slice(1).map((c) => (
                <p key={c.key} className="text-gray-600 dark:text-gray-300">
                  <span className="text-gray-500 dark:text-gray-400">{c.label}: </span>{String(r[c.key] ?? '—')}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <AdminTable rows={visible} idKey={idKey} pageSize={50} columns={[...columns, actions]} />
      )}
    </section>
  )
}

export default function BackgroundJobHousekeepingPage() {
  const navigate = useNavigate()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('system.background_jobs.edit')
  const [data, setData] = useState({ run_history: null, retention_targets: [], storage_buckets: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetchBackgroundJobHousekeeping()
      if (cancelled) return
      setData(res.data)
      setError(res.error)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const targets = useMemo(() => sortByLabelThenCreated(data.retention_targets || [], (r) => r.target_key).map((t) => ({
    ...t,
    keep_label: `${t.retain_days} days`,
    filter_label: describeStatusFilter(t.status_column, t.status_values),
    status_label: t.is_active ? 'On' : 'Off',
    last_label: t.problem ? `Skipped: ${t.problem}` : t.last_purged_at
      ? `${formatJobTime(t.last_purged_at)} — ${t.last_result || 'ok'}${t.last_deleted_count ? ` (${t.last_deleted_count} deleted)` : ''}`
      : 'Not run yet',
  })), [data.retention_targets])

  const buckets = useMemo(() => sortByLabelThenCreated(data.storage_buckets || [], (r) => r.bucket_id).map((b) => ({
    ...b,
    references_label: (b.references || []).join(', '),
    window_label: `${b.min_age_days} days`,
    delete_label: b.delete_enabled ? 'On' : 'Report only',
    status_label: b.is_active ? 'On' : 'Off',
    last_label: b.last_scanned_at
      ? `${formatJobTime(b.last_scanned_at)} — ${b.last_orphan_count ?? 0} orphaned of ${b.last_object_count ?? 0}${b.delete_enabled ? `, ${b.last_deleted_count ?? 0} deleted` : ''}`
      : 'Not scanned yet',
  })), [data.storage_buckets])

  if (loading) return <LoadingState message="Loading housekeeping settings..." />

  const runHistory = data.run_history

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <button type="button" onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to Background Jobs
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Housekeeping</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          How long job history and logs are kept, and which uploaded files the weekly clean-up may remove.
        </p>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Run history</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">The weekly Log retention job deletes job runs older than these periods.</p>
          </div>
          {canEdit && runHistory && (
            <AdminIconActionButton variant="edit" label="Edit run history keep periods"
              onClick={() => navigate('/system/background-jobs/housekeeping/run-history')} />
          )}
        </div>
        {runHistory ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <AdminFieldLabelWithHelp as="dt" helpKey="admin.background_job_settings.success_retention_days" className="text-xs font-medium text-gray-500 dark:text-gray-400">Keep successful runs</AdminFieldLabelWithHelp>
              <dd className="text-sm text-gray-900 dark:text-gray-100">{runHistory.success_retention_days} days</dd>
            </div>
            <div>
              <AdminFieldLabelWithHelp as="dt" helpKey="admin.background_job_settings.failure_retention_days" className="text-xs font-medium text-gray-500 dark:text-gray-400">Keep failed runs</AdminFieldLabelWithHelp>
              <dd className="text-sm text-gray-900 dark:text-gray-100">{runHistory.failure_retention_days} days</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">Not available.</p>
        )}
      </section>

      <HousekeepingList
        title="Log retention"
        intro="Tables the weekly Log retention job trims by age. New tables are added by versioned SQL."
        viewKey="nidus.admin.housekeeping.retention.view"
        rows={targets}
        idKey="target_key"
        cardTitle={(r) => r.target_key}
        canEdit={canEdit}
        onEdit={(r) => navigate(`/system/background-jobs/housekeeping/retention/${encodeURIComponent(r.target_key)}`)}
        emptyText="Run monorepo SQL v1596."
        exportName="retention_targets"
        exportColumns={[
          { key: 'target_key', label: 'Table' },
          { key: 'date_column', label: 'Date column' },
          { key: 'keep_label', label: 'Keep for' },
          { key: 'filter_label', label: 'Only rows with' },
          { key: 'status_label', label: 'Status' },
          { key: 'last_label', label: 'Last run' },
        ]}
        columns={[
          { key: 'target_key', label: 'Table', render: (r) => <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{r.target_key}</span> },
          { key: 'date_column', label: 'Date column', render: (r) => <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{r.date_column}</span> },
          { key: 'retain_days', label: 'Keep for', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.keep_label}</span> },
          { key: 'filter_label', label: 'Only rows with', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.filter_label}</span> },
          { key: 'status_label', label: 'Status', render: (r) => <JobStatusPill status={r.is_active ? 'on' : 'off'} /> },
          { key: 'last_label', label: 'Last run', render: (r) => <span className="text-xs text-gray-600 dark:text-gray-400">{r.last_label}</span> },
        ]}
      />

      <HousekeepingList
        title="Storage clean-up"
        intro="Buckets the weekly Storage clean-up checks for files no record points to any more. Report only until deletion is switched on."
        viewKey="nidus.admin.housekeeping.storage.view"
        rows={buckets}
        idKey="bucket_id"
        cardTitle={(r) => r.bucket_id}
        canEdit={canEdit}
        onEdit={(r) => navigate(`/system/background-jobs/housekeeping/storage/${encodeURIComponent(r.bucket_id)}`)}
        emptyText="Run monorepo SQL v1596."
        exportName="storage_cleanup_buckets"
        exportColumns={[
          { key: 'bucket_id', label: 'Bucket' },
          { key: 'references_label', label: 'Checked against' },
          { key: 'window_label', label: 'Safety window' },
          { key: 'delete_label', label: 'Delete orphaned files' },
          { key: 'status_label', label: 'Status' },
          { key: 'last_label', label: 'Last scan' },
        ]}
        columns={[
          { key: 'bucket_id', label: 'Bucket', render: (r) => <span className="font-mono text-xs text-gray-900 dark:text-gray-100">{r.bucket_id}</span> },
          { key: 'references_label', label: 'Checked against', render: (r) => <span className="break-words font-mono text-xs text-gray-700 dark:text-gray-300">{r.references_label}</span> },
          { key: 'min_age_days', label: 'Safety window', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.window_label}</span> },
          { key: 'delete_label', label: 'Delete orphaned files', render: (r) => (
            <span className={r.delete_enabled ? 'font-medium text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}>{r.delete_label}</span>
          ) },
          { key: 'status_label', label: 'Status', render: (r) => <JobStatusPill status={r.is_active ? 'on' : 'off'} /> },
          { key: 'last_label', label: 'Last scan', render: (r) => <span className="text-xs text-gray-600 dark:text-gray-400">{r.last_label}</span> },
        ]}
      />
    </div>
  )
}
