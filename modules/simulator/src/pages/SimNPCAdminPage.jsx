import { useState, useEffect, useMemo } from 'react'
import {
  fetchSimNPCs,
  formatDate,
  rowMatchesListSearch,
  useDisplayIdMap,
  useInitialUrlSearch,
} from '@nidus-admin/shared'
import { AdminTable, AdminCard, LoadingState, EmptyState, SearchBar } from '@nidus-admin/ui'

export default function SimNPCAdminPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useInitialUrlSearch()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const { data, error: fetchError } = await fetchSimNPCs({ limit: 300 })
      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message || String(fetchError))
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('sim.npcs', rowIds)

  const filteredRows = useMemo(() => {
    const query = search.trim()
    return rows.filter((row) => rowMatchesListSearch(row, query, {
      extraTexts: [displayIdMap[row.id]],
    }))
  }, [rows, search, displayIdMap])

  if (loading) return <LoadingState message="Loading simulator NPCs..." />
  if (error) return <div className="text-red-400 p-4">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Simulator NPC Administration</h1>
          <span className="text-sm text-gray-500">Data source: sim schema NPC tables</span>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by display ID, name, or role..." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total NPCs" value={filteredRows.length} />
        <AdminCard title="Active NPCs" value={filteredRows.filter((row) => row.is_active !== false).length} />
      </div>
      {filteredRows.length === 0 ? (
        <EmptyState
          title="No NPC records found"
          description="No rows were returned from available sim NPC tables. Verify simulator NPC data seeding and schema table naming."
        />
      ) : (
        <AdminTable
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'name', label: 'Name', render: (r) => r.name || r.npc_name || r.character_name || '—' },
            { key: 'role', label: 'Role', render: (r) => r.role || r.persona || '—' },
            { key: 'scenario', label: 'Scenario', render: (r) => r.scenario_name || r.scenario_id || '—' },
            { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
          ]}
          rows={filteredRows}
        />
      )}
    </div>
  )
}
