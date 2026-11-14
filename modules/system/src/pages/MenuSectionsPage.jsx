/**
 * Admin plan v217 (monorepo v1341 D29, D4) — the sidebar sections (names, icons, order) and the
 * shared slots, per app. Renaming a section here renames it in every consolidated sidebar with
 * no deploy (rule 25.1). Edits open the routed form (Admin rule 18).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MENU_APPS, fetchMenuSections, fetchMenuSlots, getDisplayRowNumber, useCurrentAdmin } from '@nidus-admin/shared'
import { AdminBadge, AdminIconActionButton, AdminTable, EmptyState, LoadingState, RowNumberBadge, SearchBar, ViewToggle } from '@nidus-admin/ui'

const VIEW_KEY = 'nidus.admin.menuSections.view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' } }

export default function MenuSectionsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const app = params.get('app') || 'platform'
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('system.menu_placements.edit')
  const [sections, setSections] = useState([])
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [s, sl] = await Promise.all([fetchMenuSections(app), fetchMenuSlots(app)])
      if (cancelled) return
      setError(s.error || sl.error)
      setSections(s.data)
      setSlots(sl.data)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [app])

  const sectionLabel = useMemo(() => new Map(sections.map((s) => [s.section_code, s.label])), [sections])
  const q = search.trim().toLowerCase()
  const match = (...vals) => !q || vals.some((v) => String(v || '').toLowerCase().includes(q))
  const sectionRows = sections.filter((s) => match(s.label, s.section_code))
  const slotRows = [...slots.filter((s) => match(s.label, s.slot_key, sectionLabel.get(s.section_code)))]
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }))
  const edit = (type, code) => navigate(`/system/menu-section-form?type=${type}&app=${app}&code=${encodeURIComponent(code)}`)
  const badge = (r) => <AdminBadge label={r.is_active ? 'Active' : 'Inactive'} variant={r.is_active ? 'active' : 'suspended'} />

  const renderList = (rows, type, columns) => (view === 'card' ? (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r, i) => (
        <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm space-y-1">
          <div className="flex items-start justify-between gap-2">
            <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: rows.length })} />
            {canEdit && <AdminIconActionButton variant="edit" label={`Edit ${r.label}`} onClick={() => edit(type, type === 'section' ? r.section_code : r.slot_key)} />}
          </div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{r.label}</p>
          <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{type === 'section' ? r.section_code : r.slot_key}</p>
          {type === 'slot' && <p className="text-gray-600 dark:text-gray-300">{sectionLabel.get(r.section_code) || r.section_code}</p>}
          {badge(r)}
        </div>
      ))}
    </div>
  ) : (
    <AdminTable rows={rows} pageSize={50} columns={[
      ...columns,
      { key: 'is_active', label: 'Status', render: badge },
      ...(canEdit ? [{ key: 'actions', label: 'Actions', sortable: false, render: (r) => (
        <AdminIconActionButton variant="edit" label={`Edit ${r.label}`} onClick={() => edit(type, type === 'section' ? r.section_code : r.slot_key)} />
      ) }] : []),
    ]} />
  ))

  if (loading) return <LoadingState message="Loading sections..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Menu Sections & Slots</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">The sections every role's sidebar uses, and the shared slots that combine the same page across industries.</p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <select value={app} aria-label="App" onChange={(e) => setParams({ app: e.target.value }, { replace: true })}
          className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          {Object.entries(MENU_APPS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <div className="flex flex-1 items-center gap-3 lg:justify-end">
          <SearchBar value={search} onChange={setSearch} placeholder="Search sections and slots..." />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sections</h2>
        {sectionRows.length === 0 ? <EmptyState title="No sections" description="Run monorepo SQL v1449." /> : renderList(sectionRows, 'section', [
          { key: 'sort_order', label: 'Order' },
          { key: 'label', label: 'Section' },
          { key: 'section_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.section_code}</span> },
          { key: 'icon', label: 'Icon', render: (r) => r.icon || '—' },
          { key: 'is_footer', label: 'Footer', render: (r) => (r.is_footer ? 'Yes' : 'No') },
          { key: 'overflow_label', label: 'Industry group label', render: (r) => r.overflow_label || '—' },
        ])}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Shared slots</h2>
        {slotRows.length === 0 ? <EmptyState title="No shared slots" description="Run monorepo SQL v1449." /> : renderList(slotRows, 'slot', [
          { key: 'label', label: 'Slot' },
          { key: 'slot_key', label: 'Key', render: (r) => <span className="font-mono text-xs">{r.slot_key}</span> },
          { key: 'section_code', label: 'Section', render: (r) => sectionLabel.get(r.section_code) || r.section_code },
          { key: 'sort_order', label: 'Order' },
        ])}
      </section>
    </div>
  )
}
