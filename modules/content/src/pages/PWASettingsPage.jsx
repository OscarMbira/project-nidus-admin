import { useEffect, useMemo, useState } from 'react'
import { fetchPwaSettings } from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, SearchBar } from '@nidus-admin/ui'

export default function PWASettingsPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchPwaSettings()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.target_system, row.app_name, row.app_short_name, row.display_mode]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  if (loading) return <LoadingState message="Loading PWA settings..." />
  if (error) return <div className="p-4 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">PWA Settings</h1>
        <p className="text-sm text-gray-500">Progressive Web App manifest configuration per target system.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Configurations" value={rows.length} />
        <AdminCard title="Install prompt on" value={rows.filter((row) => row.install_prompt_enabled).length} />
        <AdminCard title="Offline cache on" value={rows.filter((row) => row.offline_cache_enabled).length} />
      </div>

      <SearchBar value={search} onChange={setSearch} placeholder="Search PWA settings..." />

      {filteredRows.length === 0 ? (
        <EmptyState title="No PWA settings" description="Run pnpm run admin:seed-content to load Platform and Simulator defaults." />
      ) : (
        <AdminTable
          columns={[
            { key: 'target_system', label: 'System', render: (row) => <AdminBadge label={row.target_system} variant={row.target_system === 'simulator' ? 'suspended' : 'active'} /> },
            { key: 'app_name', label: 'App name', render: (row) => row.app_name },
            { key: 'app_short_name', label: 'Short name', render: (row) => row.app_short_name },
            { key: 'display_mode', label: 'Display', render: (row) => row.display_mode },
            { key: 'theme_color', label: 'Theme', render: (row) => (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-4 w-4 rounded border border-gray-600" style={{ backgroundColor: row.theme_color }} />
                {row.theme_color}
              </span>
            ) },
            { key: 'install_prompt_enabled', label: 'Install prompt', render: (row) => (row.install_prompt_enabled ? 'Yes' : 'No') },
            { key: 'offline_cache_enabled', label: 'Offline cache', render: (row) => (row.offline_cache_enabled ? 'Yes' : 'No') },
          ]}
          rows={filteredRows}
          idKey="id"
        />
      )}
    </div>
  )
}
