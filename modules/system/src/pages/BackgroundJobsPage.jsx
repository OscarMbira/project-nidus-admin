/**
 * Admin plan v219 (monorepo v1352 Slice 0, D3) — System › Background Jobs: every job in the catalogue,
 * its schedule, last and next run, and any open alert. Rows open the routed job page
 * (/system/background-jobs/:code — the job code is the friendly id, Admin rule 13.1).
 * Table conventions: sortable headers, default sort name A→Z then oldest first (rule 12.1), # numbers,
 * Card / Table toggle defaulting to table (rule 12), export (rule 11).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BACKGROUND_JOB_KIND_LABELS,
  BACKGROUND_JOB_OWNER_LABELS,
  describeCron,
  fetchBackgroundJobs,
  formatJobTime,
  getDisplayRowNumber,
  minutesSinceTick,
  sortBackgroundJobsDefault,
} from '@nidus-admin/shared'
import {
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

const VIEW_KEY = 'nidus.admin.backgroundJobs.view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' } }

const EXPORT_COLUMNS = [
  { key: 'name', label: 'Job' },
  { key: 'code', label: 'Code' },
  { key: 'owner_label', label: 'Owner' },
  { key: 'kind_label', label: 'Runs as' },
  { key: 'schedule_label', label: 'Schedule' },
  { key: 'status_label', label: 'Status' },
  { key: 'last_status', label: 'Last result' },
  { key: 'last_finished_label', label: 'Last finished' },
  { key: 'next_run_label', label: 'Next run' },
  { key: 'alert_label', label: 'Alert' },
]

export default function BackgroundJobsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ jobs: [], settings: null, worker_configured: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await fetchBackgroundJobs()
      if (cancelled) return
      setData(res.data)
      setError(res.error)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => sortBackgroundJobsDefault(data.jobs || []).map((j) => ({
    ...j,
    owner_label: BACKGROUND_JOB_OWNER_LABELS[j.owner_system] || j.owner_system,
    kind_label: BACKGROUND_JOB_KIND_LABELS[j.kind] || j.kind,
    schedule_label: describeCron(j.cron, j.time_basis),
    status_label: j.enabled ? 'On' : 'Off',
    last_finished_label: formatJobTime(j.last_finished_at),
    next_run_label: formatJobTime(j.next_run_at),
    alert_label: j.alert_open ? (j.alert_kind === 'late' ? 'Late' : 'Failed') : '',
  })), [data.jobs])

  const q = search.trim().toLowerCase()
  const visible = rows.filter((r) => !q || [r.name, r.code, r.owner_label, r.kind_label, r.schedule_label, r.description]
    .some((v) => String(v || '').toLowerCase().includes(q)))
  const open = (r) => navigate(`/system/background-jobs/${encodeURIComponent(r.code)}`)
  const tickAge = minutesSinceTick(data.settings?.last_tick_at)

  if (loading) return <LoadingState message="Loading background jobs..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Background Jobs</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Every scheduled and queued job in Platform, Simulator and Admin. Open a job to see its runs, run it now or turn it off.
          </p>
        </div>
        <ExportListMenu columns={EXPORT_COLUMNS} data={visible} baseFilename="background_jobs" disabled={!visible.length} />
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      {!error && (
        <div className={`rounded border px-3 py-2 text-sm ${tickAge === null || tickAge > 5
          ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
          : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
          {tickAge === null
            ? 'The scheduler has not run yet. Check that monorepo SQL v1560 has been run and pg_cron is on.'
            : `Scheduler last ran ${tickAge === 0 ? 'less than a minute' : `${tickAge} min`} ago (${formatJobTime(data.settings.last_tick_at)}).`}
          {!data.worker_configured && ' The worker is not set up yet, so queued jobs wait (see the Background Jobs guide).'}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <SearchBar value={search} onChange={setSearch} placeholder="Search jobs..." />
        <ViewToggle view={view} onChange={setView} />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="No background jobs" description={q ? 'No job matches your search.' : 'Run monorepo SQL v1559 and v1560.'} />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((r, i) => (
            <div key={r.code} className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: visible.length })} />
                <AdminIconActionButton variant="view" label={`View ${r.name}`} onClick={() => open(r)} />
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.code}</p>
              <p className="text-gray-600 dark:text-gray-300">{r.schedule_label}</p>
              <div className="flex flex-wrap gap-2">
                <JobStatusPill status={r.enabled ? 'on' : 'off'} />
                {r.last_status && <JobStatusPill status={r.last_status} />}
                {r.alert_open && <JobStatusPill status={r.alert_kind === 'late' ? 'late' : 'alert'} />}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Next run: {r.next_run_label}</p>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable rows={visible} idKey="code" pageSize={50} columns={[
          { key: 'name', label: 'Job', render: (r) => (
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{r.name}</p>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.code}</p>
            </div>
          ) },
          { key: 'owner_label', label: 'Owner', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.owner_label}</span> },
          { key: 'schedule_label', label: 'Schedule', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.schedule_label}</span> },
          { key: 'status_label', label: 'Status', render: (r) => <JobStatusPill status={r.enabled ? 'on' : 'off'} /> },
          { key: 'last_finished_at', label: 'Last run', render: (r) => (
            <div className="space-y-1">
              {r.last_status ? <JobStatusPill status={r.last_status} /> : <span className="text-gray-500 dark:text-gray-400">Not run yet</span>}
              {r.last_finished_at && <p className="text-xs text-gray-500 dark:text-gray-400">{r.last_finished_label}</p>}
            </div>
          ) },
          { key: 'next_run_at', label: 'Next run', render: (r) => <span className="text-gray-700 dark:text-gray-300">{r.next_run_label}</span> },
          { key: 'alert_label', label: 'Alert', render: (r) => (r.alert_open ? <JobStatusPill status={r.alert_kind === 'late' ? 'late' : 'alert'} /> : <span className="text-gray-400 dark:text-gray-500">—</span>) },
          { key: 'actions', label: 'Actions', sortable: false, render: (r) => (
            <AdminIconActionButton variant="view" label={`View ${r.name}`} onClick={() => open(r)} />
          ) },
        ]} />
      )}
    </div>
  )
}
