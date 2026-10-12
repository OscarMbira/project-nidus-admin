/**
 * v211 (monorepo v1239 Slice 8.4) — which Project Planner (pln_) menu items Planner workspaces
 * can see. Toggling writes public.planner_menu_allowlist through admin_set_menu_planner_available
 * (SQL v227; permission system.planner_menu.edit; reason required; audited).
 * The Planner's sidebar is fail-closed: an item that is not available is hidden for every
 * Planner workspace, whatever its role grants say.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchPlannerMenuItems, setMenuPlannerAvailable } from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, SearchBar, useConfirmAction, useToast } from '@nidus-admin/ui'

export default function PlannerMenuAvailabilityPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: e } = await fetchPlannerMenuItems()
    setError(e)
    setRows((data || []).map((r) => ({ ...r, label: r.parent_label ? `${r.parent_label} › ${r.menu_label}` : r.menu_label })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? rows.filter((r) => [r.label, r.menu_code, r.route_path].some((v) => String(v || '').toLowerCase().includes(q))) : rows
    return [...list].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [rows, search])

  const toggle = (row) => {
    const next = !row.is_available
    confirm({
      title: `${next ? 'Show' : 'Hide'} "${row.label}" in the Planner?`,
      message: next ? 'Planner workspaces whose roles are granted this item will see it.' : 'Every Planner workspace will stop seeing this item. Data is not affected.',
      confirmLabel: next ? 'Show in Planner' : 'Hide from Planner',
      danger: !next,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: e } = await setMenuPlannerAvailable(row.id, next, reason)
        if (e) { showError(e); return }
        showSuccess(`"${row.label}" is now ${next ? 'available' : 'hidden'} in the Planner.`)
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading planner menus..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Planner Menu Availability</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Choose which Project Planner menu items Planner workspaces can see.</p>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard title="Planner menu items" value={rows.length} />
        <AdminCard title="Available" value={rows.filter((r) => r.is_available).length} />
        <AdminCard title="Hidden" value={rows.filter((r) => !r.is_available).length} />
      </div>
      <SearchBar value={search} onChange={setSearch} placeholder="Search menu items..." />
      {filtered.length === 0 ? (
        <EmptyState title="No planner menu items" description="Run monorepo SQL v1254 to create the Planner menus." />
      ) : (
        <AdminTable
          rows={filtered}
          columns={[
            { key: 'label', label: 'Menu item' },
            { key: 'menu_code', label: 'Code', render: (r) => <span className="font-mono text-xs">{r.menu_code}</span> },
            { key: 'route_path', label: 'Path', render: (r) => r.route_path || '—' },
            {
              key: 'is_available',
              label: 'In Planner',
              render: (r) => <AdminBadge label={r.is_available ? 'Available' : 'Hidden'} variant={r.is_available ? 'active' : 'suspended'} />,
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <button type="button" onClick={() => toggle(r)} className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                  {r.is_available ? 'Hide' : 'Show'}
                </button>
              ),
            },
          ]}
        />
      )}
      {modal}
    </div>
  )
}
