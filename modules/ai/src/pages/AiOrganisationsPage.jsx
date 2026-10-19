/**
 * AI Centre (monorepo v1272, PRD stories 5, 6, 9 / D6–D8, D16a) — AI per organisation: AI notice,
 * on/off, credits used this period and any Admin overrides. ?state=<state> or ?using=1 filters
 * the list (Overview cards, rule 17). Open a row to change overrides or add credits.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { aiOrgState, aiUsagePercent, fetchAiOrganisations, getDisplayRowNumber, PermissionGate } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.aiOrganisations.view'
export const ORG_STATE_LABEL = {
  on: 'AI on', off: 'Turned off by organisation', no_notice: 'AI notice not accepted', disabled: 'Disabled by Admin', at_limit: 'Out of credits',
}
const STATE_VARIANT = { on: 'active', off: 'archived', no_notice: 'pending', disabled: 'suspended', at_limit: 'failed' }

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export const orgPath = (r, view = false) => `/ai/organisation?code=${encodeURIComponent(r.account_code || r.account_id)}${view ? '&view=1' : ''}`

export default function AiOrganisationsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)
  const stateFilter = params.get('state') || ''
  const usingOnly = params.get('using') === '1'

  useEffect(() => {
    fetchAiOrganisations().then(({ data, error }) => {
      if (error) showError(String(error))
      setOrgs(data)
      setLoading(false)
    })
  }, [])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  // Rule 12.1: name A→Z (the RPC already orders by name; no created_at is returned).
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orgs
      .map((r) => ({ ...r, state: aiOrgState(r), percent: aiUsagePercent(r) }))
      .filter((r) => (!stateFilter || r.state === stateFilter) && (!usingOnly || Number(r.used) > 0))
      .filter((r) => !term || [r.account_name, r.account_code, r.edition].some((v) => String(v ?? '').toLowerCase().includes(term)))
  }, [orgs, search, stateFilter, usingOnly])

  const setState = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('state', value)
    else next.delete('state')
    next.delete('using')
    setParams(next)
  }

  const exportRows = rows.map((r, i) => ({
    ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }), state_label: ORG_STATE_LABEL[r.state],
    percent_label: r.percent == null ? '' : `${r.percent}%`,
  }))
  const exportColumns = [
    { key: '#', label: '#' }, { key: 'account_name', label: 'Organisation' }, { key: 'account_code', label: 'Code' },
    { key: 'edition', label: 'Edition' }, { key: 'state_label', label: 'AI status' }, { key: 'used', label: 'Credits used' },
    { key: 'allowance', label: 'Allowance' }, { key: 'percent_label', label: 'Used %' },
  ]

  const actions = (r) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(orgPath(r, true))} />
      <PermissionGate permission="ai.credits.edit">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(orgPath(r))} />
      </PermissionGate>
    </AdminRowActions>
  )
  const stateBadge = (r) => <AdminBadge label={ORG_STATE_LABEL[r.state]} variant={STATE_VARIANT[r.state]} />
  const usage = (r) => `${Number(r.used || 0).toLocaleString()} / ${Number(r.allowance || 0).toLocaleString()}${r.percent == null ? '' : ` (${r.percent}%)`}`

  if (loading) return <LoadingState message="Loading organisations..." />

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI by organisation</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">AI notice, on/off and credits used this billing period. Open an organisation to override its allowance, retention or switch AI off.</p>
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          AI status
          <select className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm" value={stateFilter} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {Object.entries(ORG_STATE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {usingOnly && (
          <button type="button" className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-300" onClick={() => setState('')}>
            Showing organisations with AI use this period ✕
          </button>
        )}
        <div className="flex flex-1 items-center gap-3 lg:justify-end">
          <SearchBar value={search} onChange={setSearch} placeholder="Search organisation or code..." />
          <ExportListMenu columns={exportColumns} data={exportRows} baseFilename="ai_organisations" disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="No organisations found" description="Try another search or status." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.account_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
                {stateBadge(r)}
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{r.account_name}</p>
              <p className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.account_code}</p>
              <p className="text-gray-500 dark:text-gray-400">Credits: {usage(r)}</p>
              <div className="mt-2">{actions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={rows}
          idKey="account_id"
          pageSize={25}
          columns={[
            { key: 'account_name', label: 'Organisation', render: (r) => <span className="font-medium">{r.account_name}</span> },
            { key: 'account_code', label: 'Code', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.account_code || '—'}</span> },
            { key: 'edition', label: 'Edition' },
            { key: 'state', label: 'AI status', render: stateBadge },
            { key: 'used', label: 'Credits used', render: usage },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}
    </div>
  )
}
