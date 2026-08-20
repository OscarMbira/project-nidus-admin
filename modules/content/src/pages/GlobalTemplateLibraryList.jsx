import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useAdminListPage,
  fetchGlobalTemplates,
  fetchIndustryPlanCatalogSyncStatus,
  syncIndustryPlanTemplatesFromCatalog,
  publishAllGlobalTemplates,
  syncStatusLabel,
  PermissionGate,
  getDisplayRowNumber,
  globalTemplateDetailPath,
  globalTemplateFormPath,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminTable,
  EmptyState,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  useToast,
  ViewToggle,
} from '@nidus-admin/ui'

const PAGE_SIZE = 25

// Portfolio/Programme/Project pulled into their own labeled cluster (mirrors the
// sidebar's "Templates" subsection) — the rest stay flat since they're each singular
// at this granularity (Form Template / Process Template map 1:1 to their own domain).
const DOMAIN_TABS = [
  { value: '', label: 'All' },
  { value: 'fields', label: 'Fields' },
  { value: 'industry_plan', label: 'Industry Plan' },
  { value: 'form_template', label: 'Form Template' },
  { value: 'opa', label: 'OPA' },
  { value: 'process_template', label: 'Process Template' },
  { value: 'legacy_document', label: 'Legacy Document' },
  { value: 'structured_list', label: 'Structured List' },
]

const TEMPLATE_DOMAIN_TABS = [
  { value: 'portfolio_template', label: 'Portfolio Template' },
  { value: 'programme_template', label: 'Programme Template' },
  { value: 'project_template', label: 'Project Template' },
]

const ALL_DOMAIN_TABS = [...DOMAIN_TABS, ...TEMPLATE_DOMAIN_TABS]

const METHODOLOGY_CHIPS = [
  { value: '', label: 'All methodologies' },
  { value: 'standards_based', label: 'Standards-Based' },
  { value: 'structured', label: 'Structured' },
  { value: 'agile', label: 'Agile' },
]

const METHODOLOGY_FILTER_DOMAINS = new Set([
  'portfolio_template',
  'programme_template',
  'project_template',
  'form_template',
  'process_template',
])

const CATEGORIES_BY_METHODOLOGY = {
  standards_based: ['Initiating', 'Planning', 'Executing', 'Monitoring & Controlling', 'Closing'],
  structured: [
    'Starting Up',
    'Directing',
    'Initiating',
    'Controlling a Stage',
    'Managing Product Delivery',
    'Managing a Stage Boundary',
    'Closing',
  ],
  agile: ['Backlog', 'Sprint Planning', 'Sprint Execution', 'Review & Retrospective', 'Release'],
}

const PHASE_CATEGORY_DOMAINS = new Set(['form_template', 'process_template', 'project_template'])

const PLANNING_KA_CHIPS = [
  { value: '', label: 'All Planning' },
  { value: 'Integration', label: 'Integration', match: /management plan|change management|roadmap/i },
  { value: 'Scope', label: 'Scope', match: /scope|requirements|wbs/i },
  { value: 'Schedule', label: 'Schedule', match: /schedule|activity|milestone|network|duration/i },
  { value: 'Cost', label: 'Cost', match: /cost|baseline/i },
  { value: 'Quality', label: 'Quality', match: /quality/i },
  { value: 'Resource', label: 'Resource', match: /resource|responsibility|team charter/i },
  { value: 'Communications', label: 'Communications', match: /communication/i },
  { value: 'Risk', label: 'Risk', match: /risk|probability and impact/i },
  { value: 'Procurement', label: 'Procurement', match: /procurement|source selection/i },
  { value: 'Stakeholder', label: 'Stakeholder', match: /stakeholder engagement/i },
]

function SyncBadge({ row }) {
  const key = syncStatusLabel(row)
  if (key === 'synced') return <AdminBadge label="Synced" variant="success" />
  if (key === 'partial') return <AdminBadge label="Partial" variant="pending" />
  if (key === 'out_of_sync') return <AdminBadge label="Out of sync" variant="failed" />
  return <AdminBadge label="Not synced" variant="pending" />
}

function DomainTabButton({ tab, count, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab.value)}
      className={`rounded-full px-3 py-1 text-xs ${
        active
          ? 'bg-blue-700 text-white'
          : 'border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      {tab.label}
      <span className="ml-1 opacity-70">({count})</span>
    </button>
  )
}

function targetLabel(target) {
  if (target === 'platform') return 'Platform'
  if (target === 'simulator') return 'Simulator'
  return 'Platform and Simulator'
}

export default function GlobalTemplateLibraryList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showSuccess, showError } = useToast()
  const [catalogStatus, setCatalogStatus] = useState(null)
  const [publishingTarget, setPublishingTarget] = useState(null)
  const [importing, setImporting] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [cardPage, setCardPage] = useState(1)
  const [domainFilter, setDomainFilter] = useState(() => searchParams.get('domain') || '')
  const [methodologyFilter, setMethodologyFilter] = useState(() => searchParams.get('methodology') || '')
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || '')
  const [planningKa, setPlanningKa] = useState(() => searchParams.get('ka') || '')

  const fetchFn = useCallback(() => fetchGlobalTemplates(), [reloadToken])
  const {
    rows, loading, error, search, setSearch, view, setView, total,
  } = useAdminListPage({
    fetchFn,
    storageKey: 'admin-gtl-list-view',
  })

  useEffect(() => {
    const d = searchParams.get('domain') || ''
    const m = searchParams.get('methodology') || ''
    const c = searchParams.get('category') || ''
    const ka = searchParams.get('ka') || ''
    setDomainFilter(d)
    setMethodologyFilter(m)
    setCategoryFilter(c)
    setPlanningKa(ka)
  }, [searchParams])

  const syncUrlFilters = (domain, methodology, category, ka) => {
    const next = new URLSearchParams(searchParams)
    if (domain) next.set('domain', domain)
    else next.delete('domain')
    if (methodology) next.set('methodology', methodology)
    else next.delete('methodology')
    if (category) next.set('category', category)
    else next.delete('category')
    if (ka) next.set('ka', ka)
    else next.delete('ka')
    setSearchParams(next, { replace: true })
  }

  const selectDomain = (value) => {
    setDomainFilter(value)
    setMethodologyFilter('')
    setCategoryFilter('')
    setPlanningKa('')
    syncUrlFilters(value, '', '', '')
  }

  const loadCatalogStatus = useCallback(async () => {
    const { data, error: err } = await fetchIndustryPlanCatalogSyncStatus()
    if (!err && data) setCatalogStatus(data)
  }, [])

  useEffect(() => {
    loadCatalogStatus()
  }, [loadCatalogStatus, reloadToken])

  useEffect(() => {
    setCardPage(1)
  }, [search, rows.length, domainFilter, methodologyFilter, categoryFilter, planningKa])

  const missingCount = Number(catalogStatus?.missing_count || 0)
  const catalogCount = Number(catalogStatus?.catalog_count || 0)

  const domainCounts = useMemo(() => {
    const counts = { '': rows.length }
    for (const tab of ALL_DOMAIN_TABS) {
      if (!tab.value) continue
      counts[tab.value] = rows.filter((r) => r.domain === tab.value).length
    }
    return counts
  }, [rows])

  const industryPlanCount = domainCounts.industry_plan || 0
  const pendingPublishCount = useMemo(
    () => rows.filter((r) => {
      if (r.record_status !== 'live') return false
      const sync = syncStatusLabel(r)
      return sync === 'not_synced' || sync === 'out_of_sync' || sync === 'partial'
    }).length,
    [rows],
  )
  const publishing = publishingTarget != null

  const filteredRows = useMemo(() => {
    let list = [...rows]
    if (domainFilter) list = list.filter((r) => r.domain === domainFilter)
    if (methodologyFilter) {
      list = list.filter((r) => String(r.methodology || '').toLowerCase() === methodologyFilter.toLowerCase())
    }
    if (categoryFilter) {
      const cat = categoryFilter.toLowerCase()
      list = list.filter((r) => String(r.category || '').toLowerCase() === cat)
    }
    if (domainFilter === 'form_template' && categoryFilter === 'Planning' && planningKa) {
      const chip = PLANNING_KA_CHIPS.find((c) => c.value === planningKa)
      if (chip?.match) list = list.filter((r) => chip.match.test(r.name || ''))
    }
    return list.sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''), undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [rows, domainFilter, methodologyFilter, categoryFilter, planningKa])

  // Grouped by methodology so the "All methodologies" state reads as three short
  // labeled rows instead of one dense wall of ~15 merged chips.
  const categoryGroups = useMemo(() => {
    if (!PHASE_CATEGORY_DOMAINS.has(domainFilter)) return []
    if (methodologyFilter && CATEGORIES_BY_METHODOLOGY[methodologyFilter]) {
      return [{ label: null, categories: CATEGORIES_BY_METHODOLOGY[methodologyFilter] }]
    }
    return [
      { label: 'Standards-Based', categories: CATEGORIES_BY_METHODOLOGY.standards_based },
      { label: 'Structured', categories: CATEGORIES_BY_METHODOLOGY.structured },
      { label: 'Agile', categories: CATEGORIES_BY_METHODOLOGY.agile },
    ]
  }, [domainFilter, methodologyFilter])

  const showMethodologyChips = METHODOLOGY_FILTER_DOMAINS.has(domainFilter)

  const rowsByName = filteredRows

  const handlePublishDownstream = async ({ forceAll = false, target = 'platform' } = {}) => {
    setPublishingTarget(target)
    const label = targetLabel(target)
    try {
      const { data, error: err } = await publishAllGlobalTemplates({
        forceAll,
        target,
        notes: forceAll
          ? `Re-publish all live templates to ${label} from Global Template Library`
          : `Publish pending templates to ${label} from Global Template Library`,
      })
      if (err) {
        const detail = typeof err === 'string' ? err : `Publish to ${label} failed.`
        showError(
          data?.aborted
            ? `Publish to ${label} aborted: ${detail}`
            : detail,
        )
        return
      }
      const attempted = Number(data?.attempted ?? 0)
      const published = Number(data?.published ?? 0)
      const failed = Number(data?.failed ?? 0)
      if (attempted === 0) {
        showSuccess(`All live templates are already published to ${label}.`)
      } else if (failed > 0) {
        const firstFail = data?.failures?.[0]?.error
        showError(
          `Published ${published} of ${attempted} to ${label}; ${failed} failed`
            + (firstFail ? `: ${firstFail}` : '. Check sync status and try again.'),
        )
      } else {
        showSuccess(
          `Published ${published} template(s) to ${label}.`,
        )
      }
      setReloadToken((n) => n + 1)
    } finally {
      setPublishingTarget(null)
    }
  }

  const handleBootstrapImport = async () => {
    setImporting(true)
    try {
      const { data, error: err } = await syncIndustryPlanTemplatesFromCatalog(
        'One-time bootstrap import of missing industry plans from Platform catalog',
      )
      if (err) {
        showError(
          typeof err === 'string'
            ? err
            : 'Bootstrap import failed. Apply Admin SQL/v170 and monorepo v772b batches if needed.',
        )
        return
      }
      const inserted = Number(data?.inserted ?? 0)
      const published = Number(data?.published ?? 0)
      if (inserted === 0 && published === 0) {
        showSuccess('No missing industries to import. This library already covers the catalog.')
      } else {
        showSuccess(
          `Bootstrap import: ${inserted} template(s) added to this library` +
            (published ? `, ${published} published downstream` : '') +
            '.',
        )
      }
      setReloadToken((n) => n + 1)
    } finally {
      setImporting(false)
    }
  }

  const columns = useMemo(() => [
    {
      key: 'display_id',
      label: 'ID',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
          {row.display_id || '—'}
        </span>
      ),
    },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'domain', label: 'Domain', sortable: true },
    {
      key: 'category',
      label: 'Category',
      sortable: true,
      render: (row) => row.category || '—',
    },
    {
      key: 'record_status',
      label: 'Status',
      sortable: true,
      render: (row) => <AdminBadge label={row.record_status || 'live'} variant={row.record_status || 'live'} />,
    },
    {
      key: 'record_version',
      label: 'Version',
      sortable: true,
      render: (row) => `v${row.record_version ?? 1}`,
    },
    {
      key: 'synced_at',
      label: 'Downstream',
      sortable: true,
      render: (row) => <SyncBadge row={row} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <div className="flex flex-wrap gap-2 text-sm">
          <AdminIconActionButton variant="view" label="View" onClick={() => navigate(globalTemplateDetailPath(row))} />
          <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(globalTemplateFormPath(row))} />
        </div>
      ),
    },
  ], [navigate])

  const cardTotalPages = Math.max(1, Math.ceil(rowsByName.length / PAGE_SIZE) || 1)
  const safeCardPage = Math.min(Math.max(1, cardPage), cardTotalPages)
  const cardStart = (safeCardPage - 1) * PAGE_SIZE
  const cardRows = rowsByName.slice(cardStart, cardStart + PAGE_SIZE)

  if (loading) return <LoadingState message="Loading Global Templates..." />

  return (
    <PermissionGate
      permission="content.global_templates.view"
      fallback={<div className="p-6 text-sm text-gray-500 dark:text-gray-400">You do not have permission to view Global Templates.</div>}
    >
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Global Template Library</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Source of truth for Nidus-authored fields and industry plan templates.
              Platform and Simulator inherit from this library when you publish.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {total} template(s) in this library
              {filteredRows.length !== total ? ` · showing ${filteredRows.length}` : ''}
              {industryPlanCount > 0 ? ` · ${industryPlanCount} industry plan(s)` : ''}
              {pendingPublishCount > 0
                ? ` · ${pendingPublishCount} pending publish`
                : ' · all live templates published downstream'}
              {catalogCount > 0
                ? ` · Platform/Simulator catalog mirror: ${catalogCount}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PermissionGate permission="content.global_templates.publish">
              <button
                type="button"
                disabled={publishing || importing}
                onClick={() => handlePublishDownstream({ forceAll: false, target: 'platform' })}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-wait disabled:opacity-60"
                title="Push pending or out-of-sync templates into Platform only"
              >
                {publishingTarget === 'platform' ? 'Publishing…' : 'Publish to Platform'}
              </button>
              <button
                type="button"
                disabled={publishing || importing}
                onClick={() => handlePublishDownstream({ forceAll: false, target: 'simulator' })}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-wait disabled:opacity-60"
                title="Push pending or out-of-sync templates into Simulator only"
              >
                {publishingTarget === 'simulator' ? 'Publishing…' : 'Publish to Simulator'}
              </button>
            </PermissionGate>
            <PermissionGate permission="content.global_templates.edit">
              <Link
                to="/content/legacy-template-upload"
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Upload legacy
              </Link>
            </PermissionGate>
            <PermissionGate permission="content.global_templates.edit">
              <Link
                to={domainFilter
                  ? `/content/global-template-form?domain=${encodeURIComponent(domainFilter)}`
                  : '/content/global-template-form'}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                New template
              </Link>
            </PermissionGate>
          </div>
        </div>

        {missingCount > 0 && (
          <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-4 py-3 text-sm text-amber-100">
            <p className="font-medium">
              Bootstrap gap: {missingCount} industry plan(s) exist in the Platform catalog but not yet in this library.
            </p>
            <p className="mt-1 text-amber-200/80">
              Use the one-time import below to pull missing rows into the library (parent). After that, author and publish from here only.
              If the catalog itself is still short of 50, apply{' '}
              <code className="text-amber-100">SQL/v772b_seed/batches/</code> in the monorepo Supabase project first.
            </p>
            <PermissionGate permission="content.global_templates.publish">
              <button
                type="button"
                disabled={importing || publishing}
                onClick={handleBootstrapImport}
                className="mt-3 rounded border border-amber-600 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-900/40 disabled:opacity-60"
              >
                {importing ? 'Importing…' : 'Import missing from Platform (bootstrap only)'}
              </button>
            </PermissionGate>
          </div>
        )}

        {pendingPublishCount > 0 && missingCount === 0 && (
          <div className="rounded-lg border border-blue-800 bg-blue-950/30 px-4 py-3 text-sm text-blue-100">
            {pendingPublishCount} live template(s) are not fully mirrored downstream.
            Use <span className="font-medium">Publish to Platform</span> and/or{' '}
            <span className="font-medium">Publish to Simulator</span> for the system(s) you want to update.
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {DOMAIN_TABS.map((tab) => (
              <DomainTabButton
                key={tab.value || 'all'}
                tab={tab}
                count={domainCounts[tab.value] ?? 0}
                active={domainFilter === tab.value}
                onSelect={selectDomain}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
              Templates
            </span>
            {TEMPLATE_DOMAIN_TABS.map((tab) => (
              <DomainTabButton
                key={tab.value}
                tab={tab}
                count={domainCounts[tab.value] ?? 0}
                active={domainFilter === tab.value}
                onSelect={selectDomain}
              />
            ))}
          </div>
        </div>

        {showMethodologyChips && (
          <div className="flex flex-wrap gap-2">
            {METHODOLOGY_CHIPS.map((chip) => {
              const active = methodologyFilter === chip.value
              return (
                <button
                  key={chip.value || 'all-method'}
                  type="button"
                  onClick={() => {
                    const next = active && chip.value ? '' : chip.value
                    setMethodologyFilter(next)
                    setCategoryFilter('')
                    setPlanningKa('')
                    syncUrlFilters(domainFilter, next, '', '')
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        )}

        {categoryGroups.length > 0 && (
          <div className="space-y-1.5">
            {categoryGroups.map((group) => (
              <div key={group.label || 'active-methodology'} className="flex flex-wrap items-center gap-2">
                {group.label && (
                  <span className="w-20 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {group.label}
                  </span>
                )}
                {group.categories.map((cat) => {
                  const active = categoryFilter === cat
                  return (
                    <button
                      key={`${group.label || 'x'}-${cat}`}
                      type="button"
                      onClick={() => {
                        const next = active ? '' : cat
                        setCategoryFilter(next)
                        setPlanningKa('')
                        syncUrlFilters(domainFilter, methodologyFilter, next, '')
                      }}
                      className={`rounded px-2 py-1 text-xs ${
                        active
                          ? 'bg-indigo-700 text-white'
                          : 'border border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800'
                      }`}
                    >
                      {cat}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {domainFilter === 'form_template' && categoryFilter === 'Planning' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
              Knowledge Area
            </span>
            {PLANNING_KA_CHIPS.map((chip) => {
              const active = planningKa === chip.value
              return (
                <button
                  key={chip.value || 'all-ka'}
                  type="button"
                  onClick={() => {
                    const next = active ? '' : chip.value
                    setPlanningKa(next)
                    syncUrlFilters(domainFilter, methodologyFilter, categoryFilter, next)
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    active
                      ? 'bg-slate-600 text-white'
                      : 'border border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-500 dark:hover:bg-gray-800'
                  }`}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <SearchBar value={search} onChange={setSearch} placeholder="Search ID, name, domain…" />
          <ViewToggle view={view} onChange={setView} />
          {pendingPublishCount === 0 && rows.some((r) => r.record_status === 'live') && (
            <PermissionGate permission="content.global_templates.publish">
              <button
                type="button"
                disabled={publishing || importing}
                onClick={() => handlePublishDownstream({ forceAll: true, target: 'platform' })}
                className="rounded border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-60 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                title="Force re-publish every live template to Platform only"
              >
                {publishingTarget === 'platform' ? 'Re-publishing…' : 'Re-publish Platform'}
              </button>
              <button
                type="button"
                disabled={publishing || importing}
                onClick={() => handlePublishDownstream({ forceAll: true, target: 'simulator' })}
                className="rounded border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-60 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                title="Force re-publish every live template to Simulator only"
              >
                {publishingTarget === 'simulator' ? 'Re-publishing…' : 'Re-publish Simulator'}
              </button>
            </PermissionGate>
          )}
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        {rows.length === 0 ? (
          <EmptyState
            title="No global templates"
            description="Create a template here (parent library), then publish to Platform and Simulator. If industries exist only in the Platform catalog, use the bootstrap import once."
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title="No templates in this filter"
            description="Try another domain or category tab, or clear filters via All."
          />
        ) : view === 'table' ? (
          <AdminTable
            columns={columns}
            rows={rowsByName}
            pageSize={PAGE_SIZE}
            defaultSortKey="name"
            defaultSortDir="asc"
          />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cardRows.map((row, index) => (
                <article key={row.id} className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RowNumberBadge
                        number={getDisplayRowNumber(index, {
                          page: safeCardPage,
                          pageSize: PAGE_SIZE,
                        })}
                      />
                      <div>
                        {row.display_id && (
                          <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{row.display_id}</p>
                        )}
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">{row.name}</h3>
                      </div>
                    </div>
                    <SyncBadge row={row} />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {row.domain} · {row.methodology || '—'} · {row.category || 'uncategorised'} · {row.record_status} · v{row.record_version ?? 1}
                  </p>
                  <div className="flex gap-3 text-sm">
                    <AdminIconActionButton variant="view" label="View" onClick={() => navigate(globalTemplateDetailPath(row))} />
                    <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(globalTemplateFormPath(row))} />
                  </div>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
              <p>
                Showing{' '}
                <span className="text-gray-800 dark:text-gray-200">{rowsByName.length === 0 ? 0 : cardStart + 1}</span>
                –
                <span className="text-gray-800 dark:text-gray-200">{cardStart + cardRows.length}</span>
                {' '}of <span className="text-gray-800 dark:text-gray-200">{rowsByName.length}</span>
                {cardTotalPages > 1 ? ` · Page ${safeCardPage} of ${cardTotalPages}` : null}
              </p>
              {cardTotalPages > 1 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={safeCardPage <= 1}
                    onClick={() => setCardPage(safeCardPage - 1)}
                    className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safeCardPage >= cardTotalPages}
                    onClick={() => setCardPage(safeCardPage + 1)}
                    className="rounded border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
