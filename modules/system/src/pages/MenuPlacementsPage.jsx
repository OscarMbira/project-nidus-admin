/**
 * Admin plan v217 (monorepo v1341 D21, D20, D30) — where each menu item appears in the
 * consolidated sidebar of each role (placement key), plus the switch that turns the consolidated
 * sidebar on for every organisation (go-live) or off again (rollback). One organisation is
 * switched from the Organisations list. Writes go through SQL v249 RPCs (reason required, audited)
 * and bump the placement version, so every sidebar refreshes.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PLACEMENT_KEY_LABELS,
  deleteMenuPlacement,
  fetchAccountMenuSettings,
  fetchMenuPlacements,
  fetchMenuSections,
  getDisplayRowNumber,
  setConsolidatedMenuForAll,
  useCurrentAdmin,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
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

const VIEW_KEY = 'nidus.admin.menuPlacements.view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' } }
const selectClass = 'rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

export default function MenuPlacementsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const placementKey = params.get('key') || 'pm'
  const sectionFilter = params.get('section') || ''
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('system.menu_placements.edit')
  const [rows, setRows] = useState([])
  const [sections, setSections] = useState([])
  const [switchRows, setSwitchRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  const load = async () => {
    setLoading(true)
    const [p, s, sw] = await Promise.all([fetchMenuPlacements(placementKey), fetchMenuSections('platform'), fetchAccountMenuSettings()])
    setError(p.error || s.error || sw.error)
    setRows(p.data)
    setSections(s.data)
    setSwitchRows(sw.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [placementKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const sectionLabel = useMemo(() => new Map(sections.map((s) => [s.section_code, s.label])), [sections])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = rows.filter((r) => !sectionFilter || r.section_code === sectionFilter)
      .filter((r) => !q || [r.menu_label, r.menu_code, r.route_path, r.slot_key, r.parent_label].some((v) => String(v || '').toLowerCase().includes(q)))
    return [...list].sort((a, b) => String(a.menu_label || '').localeCompare(String(b.menu_label || ''), undefined, { sensitivity: 'base' })
      || String(a.created_at || '').localeCompare(String(b.created_at || '')))
  }, [rows, search, sectionFilter])

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const onCount = switchRows.filter((r) => r.consolidated_menu_enabled).length

  const switchAll = (enabled) => {
    confirm({
      title: enabled ? 'Turn the single sidebar per role on for every organisation?' : 'Turn the single sidebar per role off for every organisation?',
      message: enabled
        ? 'Every user moves to the consolidated sidebar at their next page load. Run the audit query (monorepo SQL v1452) first. You can turn it off for one organisation from the Organisations list.'
        : 'Every user goes back to the previous sidebar. Placements are kept.',
      confirmLabel: enabled ? 'Turn on for all' : 'Turn off for all',
      danger: !enabled,
      requireReason: true,
      onConfirm: async (reason) => {
        const { data, error: e } = await setConsolidatedMenuForAll(enabled, reason)
        if (e) { showError(e); return }
        showSuccess(`Single sidebar per role is now ${enabled ? 'on' : 'off'} for ${data?.organisations ?? 'all'} organisations.`)
        await load()
      },
    })
  }

  const remove = (row) => {
    confirm({
      title: `Remove "${row.menu_label}" from the ${PLACEMENT_KEY_LABELS[placementKey]} sidebar?`,
      message: 'The page itself is not affected. Without a placement it falls back to its default section (full menus) or disappears (compact menus).',
      confirmLabel: 'Remove placement',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: e } = await deleteMenuPlacement(row.id, reason)
        if (e) { showError(e); return }
        showSuccess(`"${row.menu_label}" was removed from the ${PLACEMENT_KEY_LABELS[placementKey]} sidebar.`)
        await load()
      },
    })
  }

  const editPath = (row) => `/system/menu-placement-form?key=${encodeURIComponent(placementKey)}${row ? `&id=${row.id}&item=${row.menu_item_id}` : ''}`
  const exportColumns = [
    { key: 'menu_label', label: 'Menu item' }, { key: 'menu_code', label: 'Code' }, { key: 'section', label: 'Section' },
    { key: 'parent_label', label: 'Sub-menu of' }, { key: 'slot_key', label: 'Slot' }, { key: 'sort_order', label: 'Order' },
    { key: 'scope', label: 'Scope' }, { key: 'status', label: 'Status' },
  ]
  const exportRows = filtered.map((r) => ({ ...r, section: sectionLabel.get(r.section_code) || r.section_code, status: r.is_active ? 'Active' : 'Inactive' }))

  const actions = (r) => canEdit ? (
    <div className="flex items-center gap-1">
      <AdminIconActionButton variant="edit" label={`Edit placement of ${r.menu_label}`} onClick={() => navigate(editPath(r))} />
      <AdminIconActionButton variant="delete" label={`Remove placement of ${r.menu_label}`} onClick={() => remove(r)} />
    </div>
  ) : null

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Menu Placements</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Where each page appears in the single sidebar of each role, in Platform and Simulator.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => navigate(editPath(null))} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Add placement</button>
            <button type="button" onClick={() => switchAll(true)} className="rounded border border-green-600 px-3 py-2 text-sm text-green-700 hover:bg-green-50 dark:text-green-300 dark:hover:bg-green-900/20">Turn on for all organisations</button>
            <button type="button" onClick={() => switchAll(false)} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800">Turn off for all</button>
          </div>
        )}
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title={`Placements for ${PLACEMENT_KEY_LABELS[placementKey] || placementKey}`} value={rows.length} />
        <AdminCard title="Inactive placements" value={rows.filter((r) => !r.is_active).length} />
        <AdminCard title="Organisations with the single sidebar on" value={onCount} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          <span className="sr-only">Role</span>
          <select value={placementKey} onChange={(e) => setParam('key', e.target.value)} className={selectClass}>
            {Object.entries(PLACEMENT_KEY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          <span className="sr-only">Section</span>
          <select value={sectionFilter} onChange={(e) => setParam('section', e.target.value)} className={selectClass}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.section_code} value={s.section_code}>{s.label}</option>)}
          </select>
        </label>
        <div className="flex flex-1 items-center gap-3 lg:justify-end">
          <SearchBar value={search} onChange={setSearch} placeholder="Search menu items..." />
          <ExportListMenu columns={exportColumns} data={exportRows} baseFilename={`menu_placements_${placementKey}`} disabled={!exportRows.length} />
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading placements..." />
      ) : filtered.length === 0 ? (
        <EmptyState title="No placements" description="Run monorepo SQL v1450–v1459 to seed the placements, or add one." />
      ) : view === 'card' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r, i) => (
            <div key={r.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm space-y-1">
              <div className="flex items-start justify-between gap-2">
                <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: filtered.length })} />
                {actions(r)}
              </div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{r.menu_label}</p>
              <p className="font-mono text-xs text-gray-500 dark:text-gray-400">{r.menu_code}</p>
              <p className="text-gray-600 dark:text-gray-300">{sectionLabel.get(r.section_code) || r.section_code}{r.parent_label ? ` › ${r.parent_label}` : ''}</p>
              {r.slot_key && <p className="text-gray-500 dark:text-gray-400">Slot: {r.slot_key}</p>}
            </div>
          ))}
        </div>
      ) : (
        <AdminTable
          rows={filtered}
          pageSize={50}
          columns={[
            { key: 'menu_label', label: 'Menu item' },
            { key: 'menu_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.menu_code}</span> },
            { key: 'section_code', label: 'Section', render: (r) => sectionLabel.get(r.section_code) || r.section_code },
            { key: 'parent_label', label: 'Sub-menu of', render: (r) => r.parent_label || '—' },
            { key: 'slot_key', label: 'Slot', render: (r) => r.slot_key || '—' },
            { key: 'sort_order', label: 'Order' },
            { key: 'scope', label: 'Scope' },
            { key: 'is_active', label: 'Status', render: (r) => <AdminBadge label={r.is_active ? 'Active' : 'Inactive'} variant={r.is_active ? 'active' : 'suspended'} /> },
            { key: 'actions', label: 'Actions', sortable: false, render: actions },
          ]}
        />
      )}
      {modal}
    </div>
  )
}
