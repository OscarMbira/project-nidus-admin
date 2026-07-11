import { useEffect, useMemo, useState } from 'react'
import { fetchDocumentationGuides } from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, SearchBar } from '@nidus-admin/ui'

const SYSTEM_FILTERS = ['all', 'platform', 'simulator']

export default function DocumentationCMSPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [systemFilter, setSystemFilter] = useState('all')

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchDocumentationGuides({
      system: systemFilter === 'all' ? null : systemFilter,
    })
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [systemFilter])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.guide_id, row.title, row.module, row.category, row.file_name]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const activeCount = rows.filter((row) => row.is_active !== false).length

  if (loading) return <LoadingState message="Loading documentation guides..." />
  if (error) return <div className="p-4 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Documentation CMS</h1>
          <p className="text-sm text-gray-500">Manage documentation guide index entries for Platform and Simulator.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total guides" value={rows.length} />
        <AdminCard title="Active" value={activeCount} />
        <AdminCard title="Platform" value={rows.filter((row) => row.system === 'platform').length} />
        <AdminCard title="Simulator" value={rows.filter((row) => row.system === 'simulator').length} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={search} onChange={setSearch} placeholder="Search guides..." />
        <select
          value={systemFilter}
          onChange={(event) => setSystemFilter(event.target.value)}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {SYSTEM_FILTERS.map((system) => (
            <option key={system} value={system}>{system === 'all' ? 'All systems' : system}</option>
          ))}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No documentation guides" description="Run pnpm run admin:seed-content to load seed data." />
      ) : (
        <AdminTable
          columns={[
            { key: 'title', label: 'Title', render: (row) => row.title },
            { key: 'guide_id', label: 'Guide ID', render: (row) => row.guide_id },
            { key: 'system', label: 'System', render: (row) => <AdminBadge label={row.system} variant={row.system === 'simulator' ? 'suspended' : 'active'} /> },
            { key: 'module', label: 'Module', render: (row) => row.module },
            { key: 'category', label: 'Category', render: (row) => row.category },
            { key: 'is_active', label: 'Status', render: (row) => <AdminBadge label={row.is_active === false ? 'inactive' : 'active'} variant={row.is_active === false ? 'default' : 'active'} /> },
          ]}
          rows={filteredRows}
          idKey="id"
        />
      )}
    </div>
  )
}
