import { useEffect, useMemo, useState } from 'react'
import { fetchRoleMenuConfig } from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, SearchBar } from '@nidus-admin/ui'

function flattenRoleMenuRow(row) {
  const role = row.roles || {}
  const menu = row.menu_items || {}
  return {
    id: row.id,
    role_name: role.role_name || '—',
    role_display_name: role.role_display_name || role.role_name || '—',
    menu_code: menu.menu_code || '—',
    menu_label: menu.menu_label || '—',
    route_path: menu.route_path || '—',
    menu_level: menu.menu_level ?? '—',
    can_view: row.can_view,
    can_use: row.can_use,
  }
}

export default function RoleMenuConfigPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchRoleMenuConfig()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows((data || []).map(flattenRoleMenuRow))
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.role_name, row.role_display_name, row.menu_code, row.menu_label, row.route_path]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const uniqueRoles = new Set(rows.map((row) => row.role_name)).size
  const uniqueMenus = new Set(rows.map((row) => row.menu_code)).size

  if (loading) return <LoadingState message="Loading role menu configuration..." />
  if (error) return <div className="p-4 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Role Menu Config</h1>
        <p className="text-sm text-gray-500">System-wide role-to-menu visibility and access mappings.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Assignments" value={rows.length} />
        <AdminCard title="Roles" value={uniqueRoles} />
        <AdminCard title="Menu items" value={uniqueMenus} />
        <AdminCard title="Can use" value={rows.filter((row) => row.can_use).length} />
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search by role or menu..." />

      {filteredRows.length === 0 ? (
        <EmptyState
          title="No role menu assignments"
          description="Platform menu data appears here once menu_items and role_menu_items are populated. Run pnpm run admin:seed-content for demo menus when none exist."
        />
      ) : (
        <AdminTable
          columns={[
            { key: 'role_display_name', label: 'Role', render: (row) => row.role_display_name },
            { key: 'menu_label', label: 'Menu', render: (row) => row.menu_label },
            { key: 'menu_code', label: 'Code', render: (row) => row.menu_code },
            { key: 'route_path', label: 'Route', render: (row) => row.route_path },
            { key: 'can_view', label: 'View', render: (row) => <AdminBadge label={row.can_view ? 'yes' : 'no'} variant={row.can_view ? 'active' : 'default'} /> },
            { key: 'can_use', label: 'Use', render: (row) => <AdminBadge label={row.can_use ? 'yes' : 'no'} variant={row.can_use ? 'active' : 'default'} /> },
          ]}
          rows={filteredRows}
          idKey="id"
        />
      )}
    </div>
  )
}
