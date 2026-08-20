import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  fetchGlobalTemplates,
  countDefaultContentCoverage,
  formTemplateEditPath,
  processTemplateEditPath,
  globalTemplateFormPath,
  getDisplayRowNumber,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
} from '@nidus-admin/ui'

const EXPORT_COLUMNS = [
  { key: '#', label: '#' },
  { key: 'name', label: 'Name' },
  { key: 'domain', label: 'Domain' },
  { key: 'category', label: 'Category' },
  { key: 'template_code', label: 'Code' },
  { key: 'coverageLabel', label: 'Coverage' },
  { key: 'coveragePct', label: 'Coverage %' },
]

const PAGE_SIZE = 25

const METHODOLOGY_FILTERS = [
  { value: '', label: 'All methodologies' },
  { value: 'standards_based', label: 'Standards-Based' },
  { value: 'structured', label: 'Structured' },
  { value: 'agile', label: 'Agile' },
]

const CATEGORIES_BY_METHODOLOGY = {
  standards_based: [
    { value: '', label: 'All categories' },
    { value: 'Initiating', label: 'Initiating' },
    { value: 'Planning', label: 'Planning' },
    { value: 'Executing', label: 'Executing' },
    { value: 'Monitoring & Controlling', label: 'Monitoring & Controlling' },
    { value: 'Closing', label: 'Closing' },
  ],
  structured: [
    { value: '', label: 'All categories' },
    { value: 'Starting Up', label: 'Starting Up' },
    { value: 'Directing', label: 'Directing' },
    { value: 'Initiating', label: 'Initiating' },
    { value: 'Controlling a Stage', label: 'Controlling a Stage' },
    { value: 'Managing Product Delivery', label: 'Managing Product Delivery' },
    { value: 'Managing a Stage Boundary', label: 'Managing a Stage Boundary' },
    { value: 'Closing', label: 'Closing' },
  ],
  agile: [
    { value: '', label: 'All categories' },
    { value: 'Backlog', label: 'Backlog' },
    { value: 'Sprint Planning', label: 'Sprint Planning' },
    { value: 'Sprint Execution', label: 'Sprint Execution' },
    { value: 'Review & Retrospective', label: 'Review & Retrospective' },
    { value: 'Release', label: 'Release' },
  ],
}

const DOMAIN_FILTERS = [
  { value: '', label: 'Forms + Process' },
  { value: 'form_template', label: 'Form templates' },
  { value: 'process_template', label: 'Process templates' },
]

function CoverageBar({ filled, total, pct }) {
  const tone = pct >= 80 ? 'bg-emerald-600' : pct >= 40 ? 'bg-amber-500' : 'bg-red-600'
  return (
    <div className="min-w-[140px]">
      <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{filled}/{total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

function editHref(row) {
  if (row.domain === 'form_template') return formTemplateEditPath(row, { focusDefaults: true })
  if (row.domain === 'process_template') return processTemplateEditPath(row)
  return globalTemplateFormPath(row)
}

export default function DefaultContentLibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('nidus.admin.defaultContent.view') || 'table'
    } catch {
      return 'table'
    }
  })
  const [cardPage, setCardPage] = useState(1)

  const category = searchParams.get('category') || ''
  const domain = searchParams.get('domain') || ''
  const methodology = searchParams.get('methodology') || ''

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'methodology') next.delete('category')
    setSearchParams(next)
    setCardPage(1)
  }

  // Grouped by methodology so the "All methodologies" state reads as three short
  // labeled rows instead of one dense wall of merged chips (mirrors GlobalTemplateLibraryList).
  const categoryGroups = methodology && CATEGORIES_BY_METHODOLOGY[methodology]
    ? [{ label: null, options: CATEGORIES_BY_METHODOLOGY[methodology] }]
    : [
        { label: 'Standards-Based', options: CATEGORIES_BY_METHODOLOGY.standards_based.filter((c) => c.value) },
        { label: 'Structured', options: CATEGORIES_BY_METHODOLOGY.structured.filter((c) => c.value) },
        { label: 'Agile', options: CATEGORIES_BY_METHODOLOGY.agile.filter((c) => c.value) },
      ]

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      const { data, error: fetchError } = await fetchGlobalTemplates()
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message || 'Failed to load templates')
        setRows([])
      } else {
        setRows(Array.isArray(data) ? data : [])
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('nidus.admin.defaultContent.view', view) } catch { /* ignore */ }
  }, [view])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => r.domain === 'form_template' || r.domain === 'process_template')
      .filter((r) => !domain || r.domain === domain)
      .filter((r) => !methodology || String(r.methodology || '').toLowerCase() === methodology.toLowerCase())
      .filter((r) => !category || String(r.category || '') === category)
      .filter((r) => {
        if (!q) return true
        return [r.name, r.template_code, r.category, r.domain, r.methodology]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      })
      .map((r) => {
        const coverage = countDefaultContentCoverage(r)
        return {
          ...r,
          coverage,
          coverageLabel: `${coverage.filled}/${coverage.total} (${coverage.pct}%)`,
          coveragePct: coverage.pct,
        }
      })
      .sort((a, b) => (a.coveragePct - b.coveragePct) || String(a.name || '').localeCompare(String(b.name || '')))
  }, [rows, domain, methodology, category, search])

  const summary = useMemo(() => {
    const formRows = filtered.filter((r) => r.domain === 'form_template')
    const procRows = filtered.filter((r) => r.domain === 'process_template')
    const avg = (list) => {
      if (!list.length) return 0
      return Math.round(list.reduce((s, r) => s + r.coveragePct, 0) / list.length)
    }
    return {
      forms: formRows.length,
      process: procRows.length,
      formAvg: avg(formRows),
      processAvg: avg(procRows),
      incomplete: filtered.filter((r) => r.coveragePct < 100).length,
    }
  }, [filtered])

  const columns = useMemo(() => [
    { key: 'name', label: 'Name', sortable: true },
    {
      key: 'domain',
      label: 'Domain',
      sortable: true,
      render: (row) => (
        <AdminBadge
          label={row.domain === 'form_template' ? 'Form' : 'Process'}
          variant={row.domain === 'form_template' ? 'success' : 'pending'}
        />
      ),
    },
    { key: 'category', label: 'Category', sortable: true, render: (row) => row.category || '—' },
    { key: 'template_code', label: 'Code', sortable: true, render: (row) => row.template_code || '—' },
    {
      key: 'coveragePct',
      label: 'Sample / content coverage',
      sortable: true,
      render: (row) => <CoverageBar {...row.coverage} />,
    },
    {
      key: '_actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <Link to={editHref(row)} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          Author content
        </Link>
      ),
    },
  ], [])

  const totalCardPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safeCardPage = Math.min(cardPage, totalCardPages)
  const cardRows = filtered.slice((safeCardPage - 1) * PAGE_SIZE, safeCardPage * PAGE_SIZE)

  const exportRows = useMemo(
    () => filtered.map((r, index) => ({
      '#': getDisplayRowNumber(index, { page: 1, pageSize: filtered.length || 1 }),
      name: r.name || '',
      domain: r.domain === 'form_template' ? 'Form' : 'Process',
      category: r.category || '',
      template_code: r.template_code || '',
      coverageLabel: r.coverageLabel,
      coveragePct: r.coveragePct,
    })),
    [filtered],
  )

  return (
    <PermissionGate permission="content.global_templates.view">
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Content Coverage</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
              Coverage of curated sample / guidance content for Form Templates and Process Templates.
              Click Author content to open the editor (forms open with Sample + Guidance columns first).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportListMenu
              columns={EXPORT_COLUMNS}
              data={exportRows}
              baseFilename="default_content_library"
              disabled={!exportRows.length}
            />
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">Form templates</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{summary.forms} · avg {summary.formAvg}%</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-xs text-gray-500 dark:text-gray-400">Process templates</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{summary.process} · avg {summary.processAvg}%</div>
          </div>
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm sm:col-span-2 dark:border-amber-700 dark:bg-amber-900/20">
            <div className="text-xs text-amber-800 dark:text-amber-200">Incomplete coverage</div>
            <div className="text-lg font-semibold text-amber-900 dark:text-amber-100">
              {summary.incomplete} template{summary.incomplete === 1 ? '' : 's'} below 100%
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {DOMAIN_FILTERS.map((d) => (
            <button
              key={d.value || 'all'}
              type="button"
              onClick={() => setFilter('domain', d.value)}
              className={`rounded px-2.5 py-1 text-xs ${
                domain === d.value
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {METHODOLOGY_FILTERS.map((m) => (
            <button
              key={m.value || 'all-method'}
              type="button"
              onClick={() => setFilter('methodology', m.value)}
              className={`rounded px-2.5 py-1 text-xs ${
                methodology === m.value
                  ? 'bg-teal-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {!methodology && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilter('category', '')}
                className={`rounded px-2.5 py-1 text-xs ${
                  category === ''
                    ? 'bg-blue-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                All categories
              </button>
            </div>
          )}
          {categoryGroups.map((group) => (
            <div key={group.label || 'active-methodology'} className="flex flex-wrap items-center gap-2">
              {group.label && (
                <span className="w-20 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {group.label}
                </span>
              )}
              {group.options.map((c) => (
                <button
                  key={`${group.label || 'x'}-${c.value || 'all-cat'}`}
                  type="button"
                  onClick={() => setFilter('category', c.value)}
                  className={`rounded px-2.5 py-1 text-xs ${
                    category === c.value
                      ? 'bg-blue-700 text-white'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <SearchBar value={search} onChange={(v) => { setSearch(v); setCardPage(1) }} placeholder="Search name or code…" />

        {loading && <LoadingState label="Loading templates…" />}
        {error && !loading && <EmptyState title="Could not load" description={error} />}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState title="No templates" description="No form or process templates match these filters." />
        )}

        {!loading && !error && filtered.length > 0 && view === 'table' && (
          <AdminTable
            columns={columns}
            rows={filtered}
            pageSize={PAGE_SIZE}
            defaultSortKey="coveragePct"
            defaultSortDir="asc"
          />
        )}

        {!loading && !error && filtered.length > 0 && view === 'card' && (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cardRows.map((row, index) => (
                <article key={row.id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RowNumberBadge number={getDisplayRowNumber(index, { page: safeCardPage, pageSize: PAGE_SIZE })} />
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{row.name}</h3>
                    </div>
                    <AdminBadge
                      label={row.domain === 'form_template' ? 'Form' : 'Process'}
                      variant={row.domain === 'form_template' ? 'success' : 'pending'}
                    />
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{row.category || '—'} · {row.template_code || 'no code'}</p>
                  <CoverageBar {...row.coverage} />
                  <Link to={editHref(row)} className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
                    Author content →
                  </Link>
                </article>
              ))}
            </div>
            {totalCardPages > 1 && (
              <div className="flex items-center justify-end gap-2 text-sm text-gray-500 dark:text-gray-400">
                <button type="button" disabled={safeCardPage <= 1} onClick={() => setCardPage((p) => p - 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-600">Prev</button>
                <span>Page {safeCardPage} / {totalCardPages}</span>
                <button type="button" disabled={safeCardPage >= totalCardPages} onClick={() => setCardPage((p) => p + 1)} className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40 dark:border-gray-600">Next</button>
              </div>
            )}
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
