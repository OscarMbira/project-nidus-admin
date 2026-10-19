/**
 * AI Centre (monorepo v1272, PRD story 23 / D5, D9, D16, D18) — the Ask Nidus data catalogue: which
 * registers Ask Nidus and Report Builder may query, per app schema (Platform = public,
 * Simulator = sim), plus which languages AI answers are offered in.
 * Registers need a curated ai_v_* view in the monorepo SQL first; here Admin switches them on/off,
 * renames them, sets Planner availability and edits their fields.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAiCatalogue, fetchAiLanguages, getDisplayRowNumber, PermissionGate, setAiLanguageSupported } from '@nidus-admin/shared'
import {
  AdminActionButton,
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
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.aiCatalogue.view'
export const SCHEMA_LABEL = { public: 'Platform', sim: 'Simulator' }

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' }
}

export const entityPath = (schema, key, view = false) => `/ai/catalogue-entity?schema=${schema}&key=${encodeURIComponent(key)}${view ? '&view=1' : ''}`

export default function AiCataloguePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const schema = params.get('schema') === 'sim' ? 'sim' : 'public'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [entities, setEntities] = useState([])
  const [languages, setLanguages] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  const load = async () => {
    setLoading(true)
    const [c, l] = await Promise.all([fetchAiCatalogue(schema), fetchAiLanguages()])
    if (c.error || l.error) showError(String(c.error || l.error))
    setEntities(c.data)
    setLanguages(l.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [schema])
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  // Rule 12.1: label A→Z, then created_at.
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...entities]
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .filter((r) => !term || [r.label, r.entity_key, r.description].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .map((r) => ({
        ...r,
        field_count: (r.fields || []).filter((f) => f.is_active !== false).length,
        editions_label: (r.editions || []).join(', '),
        status: r.is_active ? 'active' : 'inactive',
      }))
  }, [entities, search])

  const toggleLanguage = (lang) => {
    const on = !lang.ai_supported
    confirm({
      title: on ? `Offer AI answers in ${lang.name}?` : `Stop offering AI answers in ${lang.name}?`,
      message: on ? 'Ask Nidus and agent drafts may answer in this language.' : 'AI answers fall back to English for users of this language.',
      confirmLabel: on ? 'Offer' : 'Stop offering',
      requireReason: true,
      reasonLabel: 'Reason (required)',
      onConfirm: async (reason) => {
        const { error } = await setAiLanguageSupported(lang.code, on, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`${lang.name} ${on ? 'added to' : 'removed from'} AI languages.`)
        await load()
      },
    })
  }

  const exportRows = rows.map((r, i) => ({ ...r, '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))
  const actions = (r) => (
    <AdminRowActions>
      <AdminIconActionButton variant="view" label="View" onClick={() => navigate(entityPath(schema, r.entity_key, true))} />
      <PermissionGate permission="ai.catalogue.edit">
        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(entityPath(schema, r.entity_key))} />
      </PermissionGate>
    </AdminRowActions>
  )
  const statusBadge = (r) => <AdminBadge label={r.status} variant={r.is_active ? 'active' : 'archived'} />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Ask Nidus data catalogue</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Registers Ask Nidus and Report Builder may query. Users still see only records they have access to.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-600">
            {Object.entries(SCHEMA_LABEL).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setParams({ schema: k })}
                className={`px-3 py-1.5 text-sm ${schema === k ? 'bg-blue-700 text-white' : 'text-gray-700 dark:text-gray-300'}`}>{label}</button>
            ))}
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search registers..." />
          <ExportListMenu
            columns={[{ key: '#', label: '#' }, { key: 'label', label: 'Register' }, { key: 'entity_key', label: 'Key' }, { key: 'editions_label', label: 'Editions' }, { key: 'field_count', label: 'Fields' }, { key: 'status', label: 'Status' }]}
            data={exportRows} baseFilename={`ai_catalogue_${schema}`} disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading catalogue..." />
      ) : !rows.length ? (
        <EmptyState title="No registers in the catalogue" description="Run monorepo SQL v1274–v1275." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <div key={r.entity_key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
                {statusBadge(r)}
              </div>
              <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">{r.label}</p>
              <p className="font-mono text-xs text-blue-600 dark:text-blue-400">{r.entity_key}</p>
              <p className="mt-1 line-clamp-2 text-gray-500 dark:text-gray-400">{r.description}</p>
              <p className="text-gray-500 dark:text-gray-400">{r.field_count} fields · {r.editions_label}</p>
              <div className="mt-2">{actions(r)}</div>
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={rows}
          idKey="entity_key"
          pageSize={25}
          columns={[
            { key: 'label', label: 'Register', render: (r) => <span className="font-medium">{r.label}</span> },
            { key: 'entity_key', label: 'Key', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.entity_key}</span> },
            { key: 'editions_label', label: 'Editions' },
            { key: 'field_count', label: 'Fields' },
            { key: 'status', label: 'Status', render: statusBadge },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI answer languages</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Ask Nidus answers in the language of the question, or the user's saved language, when it is offered here. Record text is never translated.</p>
        <AdminTable
          rows={languages}
          idKey="code"
          pageSize={25}
          columns={[
            { key: 'name', label: 'Language', render: (r) => <span className="font-medium">{r.name}</span> },
            { key: 'code', label: 'Code', render: (r) => <span className="font-mono">{r.code}</span> },
            { key: 'is_active', label: 'Active in the app', render: (r) => (r.is_active ? 'Yes' : 'No') },
            { key: 'ai_supported', label: 'AI answers', render: (r) => <AdminBadge label={r.ai_supported ? 'offered' : 'not offered'} variant={r.ai_supported ? 'active' : 'archived'} /> },
            {
              key: 'actions', label: 'Actions', sortable: false,
              render: (r) => (
                <PermissionGate permission="ai.catalogue.edit">
                  <AdminActionButton onClick={() => toggleLanguage(r)}>{r.ai_supported ? 'Stop offering' : 'Offer'}</AdminActionButton>
                </PermissionGate>
              ),
            },
          ]}
        />
      </section>
      {modal}
    </div>
  )
}
