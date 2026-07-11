import { useEffect, useMemo, useState } from 'react'
import {
  fetchSimLeaderboard,
  fetchSimScenarios,
  formatDate,
  getSimDb,
  resetLeaderboardEntries,
  rowMatchesListSearch,
  useBulkSelection,
  useDisplayIdMap,
  useInitialUrlSearch,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function SimLeaderboardAdminPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [rows, setRows] = useState([])
  const [scenarios, setScenarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scenarioFilter, setScenarioFilter] = useState('all')
  const [search, setSearch] = useInitialUrlSearch()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [bulkModal, setBulkModal] = useState({ open: false })

  const loadRows = async () => {
    setLoading(true)
    setError(null)

    const filters = []
    if (dateFrom) filters.push({ op: 'gte', col: 'recorded_at', val: `${dateFrom}T00:00:00` })
    if (dateTo) filters.push({ op: 'lte', col: 'recorded_at', val: `${dateTo}T23:59:59` })
    if (scenarioFilter !== 'all') filters.push({ op: 'eq', col: 'scenario_id', val: scenarioFilter })

    const [leaderboardRes, scenariosRes] = await Promise.all([
      fetchSimLeaderboard({ limit: 1000, filters }),
      fetchSimScenarios({ limit: 500 }),
    ])

    if (leaderboardRes.error) {
      setError(leaderboardRes.error.message || String(leaderboardRes.error))
      setRows([])
      setLoading(false)
      return
    }

    setRows(leaderboardRes.data || [])
    setScenarios(scenariosRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadRows()
  }, [scenarioFilter, dateFrom, dateTo])

  const scenarioNameMap = useMemo(
    () => Object.fromEntries((scenarios || []).map((scenario) => [scenario.id, scenario.name || scenario.id])),
    [scenarios],
  )

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('sim.leaderboard_entries', rowIds)

  const filteredRows = useMemo(() => {
    const scenarioFiltered = scenarioFilter === 'all'
      ? rows
      : rows.filter((row) => {
        const derivedScenarioId = row.scenario_id || row.metadata?.scenario_id || row.metadata?.scenarioId
        return String(derivedScenarioId || '') === String(scenarioFilter)
      })

    const query = search.trim()
    return scenarioFiltered.filter((row) => rowMatchesListSearch(row, query, {
      extraTexts: [displayIdMap[row.id]],
    }))
  }, [rows, scenarioFilter, search, displayIdMap])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const confirmBulkReset = async () => {
    setBulkModal({ open: false })
    const outcome = await bulk.executeBulk(async (row) => {
      const db = getSimDb()
      if (!db) return { error: 'Database not configured' }
      const { error } = await db.from('leaderboard_entries').delete().eq('id', row.id)
      return { error: error?.message || null }
    })
    reportBulk(outcome, 'entry(ies) removed')
    await loadRows()
  }

  const handleReset = () => {
    const target = scenarioFilter === 'all' ? 'all leaderboard entries' : `leaderboard entries for ${scenarioNameMap[scenarioFilter] || 'selected scenario'}`
    confirm({
      title: 'Reset leaderboard entries?',
      message: `This will permanently delete ${target}. This action cannot be undone.`,
      confirmLabel: 'Reset entries',
      danger: true,
      onConfirm: async () => {
        const scenarioId = scenarioFilter === 'all' ? null : scenarioFilter
        const { error: mutationError } = await resetLeaderboardEntries(scenarioId)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Leaderboard entries reset successfully.')
        await loadRows()
      },
    })
  }

  if (loading) return <LoadingState message="Loading simulator leaderboard..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Simulator Leaderboard</h1>
          <p className="text-sm text-gray-500">Filter by scenario and date window, then reset entries with explicit confirmation.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by display ID, user, or score..." />
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200 hover:bg-red-900/70"
          >
            Reset Entries
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Scenario</label>
          <select
            value={scenarioFilter}
            onChange={(event) => setScenarioFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All scenarios</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>{scenario.name || scenario.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Entries" value={filteredRows.length} />
        <AdminCard title="Top score" value={filteredRows.length ? Math.max(...filteredRows.map((row) => Number(row.score || 0))) : 0} />
        <AdminCard title="Users" value={new Set(filteredRows.map((row) => row.user_id)).size} />
        <AdminCard title="Lowest rank" value={filteredRows.length ? Math.max(...filteredRows.map((row) => Number(row.rank || 0))) : 0} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No leaderboard entries" description="No entries match the selected scenario and date range." />
      ) : (
        <AdminTable
          rows={filteredRows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'user_id', label: 'User ID', render: (r) => r.user_id || '—' },
            { key: 'score', label: 'Score', render: (r) => r.score ?? 0 },
            { key: 'rank', label: 'Rank', render: (r) => r.rank ?? '—' },
            { key: 'category', label: 'Category', render: (r) => r.category || r.leaderboard_type || '—' },
            {
              key: 'scenario_id',
              label: 'Scenario',
              render: (r) => {
                const id = r.scenario_id || r.metadata?.scenario_id || r.metadata?.scenarioId
                return scenarioNameMap[id] || id || '—'
              },
            },
            { key: 'period_start', label: 'Period Start', render: (r) => formatDate(r.period_start) },
            { key: 'recorded_at', label: 'Recorded At', render: (r) => formatDate(r.recorded_at) },
          ]}
        />
      )}

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        processing={bulk.processing}
        progressCurrent={bulk.progress.current}
        progressTotal={bulk.progress.total}
        onClearSelection={bulk.clearSelection}
        actions={[
          { key: 'reset', label: 'Reset Selected', variant: 'danger', onClick: () => setBulkModal({ open: true }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={`Reset ${bulk.selectedCount} leaderboard entry(ies)?`}
        message="This permanently removes the selected leaderboard entries."
        items={bulk.selectedItems}
        itemLabel={(item) => `${item.user_id || 'user'} — score ${item.score ?? 0}`}
        confirmLabel="Reset Selected"
        danger
        onConfirm={confirmBulkReset}
        onClose={() => setBulkModal({ open: false })}
        processing={bulk.processing}
      />

      {modal}
    </div>
  )
}
