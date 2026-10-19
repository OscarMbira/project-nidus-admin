/**
 * AI Centre (monorepo v1272, PRD stories 4 and 8) — AI run log across Platform, Simulator and Planner.
 * Filters come from the URL (?days, status, agent, app, account_id) so Overview cards land on the
 * matching subset (rule 17). Question and answer text is not shown here — only audit metadata.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAiRuns, getDisplayRowNumber, formatDateShort } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.aiRuns.view'
const FILTER_KEYS = ['days', 'status', 'agent', 'app', 'account_id']
const STATUS_VARIANT = { succeeded: 'active', failed: 'failed', blocked: 'pending', running: 'retrying' }

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export default function AiRunsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [runs, setRuns] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  const filter = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAiRuns({ ...filter, days: filter.days ? Number(filter.days) : 30 }).then(({ data, error }) => {
      if (!active) return
      if (error) showError(String(error))
      setRuns(data)
      setLoading(false)
    })
    return () => { active = false }
  }, [filter])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  // Newest first is the natural order for a run log (documented exception to rule 12.1 in the v1272 plan).
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return runs
      .filter((r) => !term || [r.account_name, r.agent, r.model, r.app, r.status, r.block_reason, r.error_text]
        .some((v) => String(v ?? '').toLowerCase().includes(term)))
      .map((r) => ({ ...r, started: r.started_at ? new Date(r.started_at).toLocaleString() : '', tokens: (r.input_tokens || 0) + (r.output_tokens || 0) }))
  }, [runs, search])

  const exportRows = rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))
  const exportColumns = [
    { key: '#', label: '#' }, { key: 'started', label: 'Started' }, { key: 'account_name', label: 'Organisation' },
    { key: 'app', label: 'App' }, { key: 'agent', label: 'Agent' }, { key: 'model', label: 'Model' },
    { key: 'status', label: 'Status' }, { key: 'block_reason', label: 'Blocked because' }, { key: 'credits', label: 'Credits' },
    { key: 'tokens', label: 'Tokens' }, { key: 'tool_calls', label: 'Tool calls' }, { key: 'duration_ms', label: 'Duration (ms)' },
  ]

  const select = (key, label, options) => (
    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
      {label}
      <select className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
        value={filter[key]} onChange={(e) => setFilter(key, e.target.value)}>
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )

  const statusBadge = (r) => (
    <span title={r.block_reason || r.error_text || ''}>
      <AdminBadge label={r.status} variant={STATUS_VARIANT[r.status] || 'default'} />
    </span>
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <button type="button" onClick={() => navigate(-1)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back</button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI runs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Every Ask Nidus question and agent run, newest first (up to 500).</p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {select('status', 'Status', ['succeeded', 'failed', 'blocked', 'running'])}
        {select('app', 'App', ['platform', 'simulator', 'planner'])}
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          Period
          <select className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
            value={filter.days || '30'} onChange={(e) => setFilter('days', e.target.value)}>
            {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </label>
        {(filter.agent || filter.account_id) && (
          <button type="button" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-300"
            onClick={() => { setFilter('agent', ''); setFilter('account_id', '') }}>
            Clear {filter.agent ? `agent: ${filter.agent}` : 'organisation'} filter ✕
          </button>
        )}
        <div className="flex flex-1 items-center gap-3 lg:justify-end">
          <SearchBar value={search} onChange={setSearch} placeholder="Search organisation, agent, model..." />
          <ExportListMenu columns={exportColumns} data={exportRows} baseFilename="ai_runs" disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading AI runs..." />
      ) : !rows.length ? (
        <EmptyState title="No AI runs found" description="Nothing matches these filters for the chosen period." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
                {statusBadge(r)}
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{r.account_name || '—'}</p>
              <p className="text-gray-500 dark:text-gray-400">{r.app} · {r.agent} · {formatDateShort(r.started_at)}</p>
              <p className="text-gray-500 dark:text-gray-400">{r.credits ?? 0} credits · {r.tokens} tokens · {r.tool_calls ?? 0} tool calls</p>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={rows}
          pageSize={25}
          columns={[
            { key: 'started', label: 'Started' },
            { key: 'account_name', label: 'Organisation', render: (r) => r.account_name || '—' },
            { key: 'app', label: 'App' },
            { key: 'agent', label: 'Agent' },
            { key: 'model', label: 'Model', render: (r) => <span className="font-mono text-xs">{r.model || '—'}</span> },
            { key: 'status', label: 'Status', render: statusBadge },
            { key: 'credits', label: 'Credits' },
            { key: 'tokens', label: 'Tokens' },
            { key: 'tool_calls', label: 'Tools' },
            { key: 'duration_ms', label: 'ms' },
          ]}
        />
      )}
    </div>
  )
}
