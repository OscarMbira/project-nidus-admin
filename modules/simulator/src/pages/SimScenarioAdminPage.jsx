import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchSimScenarios, formatDate, formatDateShort, exportToFile, generateExportFilename, navId, updateSimScenario, useBulkSelection, useDisplayIdMap } from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminCard,
  AdminIconActionButton,
  AdminRowActions,
  AdminRowManageModal,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function SimScenarioAdminPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get('status')
    return fromUrl === 'active' || fromUrl === 'archived' ? fromUrl : 'all'
  })
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [bulkModal, setBulkModal] = useState({ open: false, action: null })
  const [manageRow, setManageRow] = useState(null)

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('sim.scenarios', rowIds)

  const loadScenarios = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchSimScenarios()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadScenarios()
  }, [])

  const difficultyOptions = useMemo(
    () => [...new Set(rows.map((row) => row.difficulty_level).filter(Boolean))],
    [rows],
  )

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter === 'active' && !row.is_active) return false
      if (statusFilter === 'archived' && row.is_active) return false
      if (difficultyFilter !== 'all' && row.difficulty_level !== difficultyFilter) return false
      if (!query) return true
      return [row.name, row.description, row.id]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, difficultyFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const handleExport = () => {
    const exportRows = filteredRows.map((row) => ({
      ...row,
      display_id: displayIdMap[row.id] || row.id,
      status: row.is_active ? 'active' : 'archived',
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'display_id', label: 'Display ID' },
        { key: 'name', label: 'Scenario' },
        { key: 'difficulty_level', label: 'Difficulty' },
        { key: 'completions_count', label: 'Completions' },
        { key: 'average_score', label: 'Avg Score' },
        { key: 'status', label: 'Status' },
        { key: 'created_at', label: 'Created' },
      ],
      generateExportFilename('sim_scenarios', { status: statusFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Scenarios exported.')
  }

  const confirmBulkAction = async () => {
    const { action } = bulkModal
    setBulkModal({ open: false, action: null })
    let outcome
    if (action === 'archive') {
      outcome = await bulk.executeBulk((row) => {
        if (!row.is_active) return { error: 'Already archived' }
        return updateSimScenario(row.id, { is_active: false })
      })
      reportBulk(outcome, 'scenario(s) archived')
    } else if (action === 'activate') {
      outcome = await bulk.executeBulk((row) => {
        if (row.is_active) return { error: 'Already active' }
        return updateSimScenario(row.id, { is_active: true })
      })
      reportBulk(outcome, 'scenario(s) activated')
    }
    await loadScenarios()
  }

  const handleArchive = (row) => {
    confirm({
      title: `Archive scenario "${row.name || row.id}"?`,
      message: 'This sets the scenario as inactive and removes it from active simulator flows.',
      confirmLabel: 'Archive',
      danger: true,
      onConfirm: async () => {
        const { error: mutationError } = await updateSimScenario(row.id, { is_active: false })
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Scenario archived.')
        await loadScenarios()
      },
    })
  }

  const viewScenario = (row) => {
    navigate(`../sim-scenario-detail?id=${navId(displayIdMap, row.id)}`, { relative: 'path' })
  }

  const editScenario = (row) => {
    navigate(`../sim-scenario-detail?id=${navId(displayIdMap, row.id)}&edit=1`, { relative: 'path' })
  }

  const buildScenarioManageActions = (row) => {
    if (!row) return []
    const actions = [
      {
        key: 'edit',
        label: 'Edit scenario',
        variant: 'primary',
        onClick: () => editScenario(row),
      },
    ]
    if (row.is_active) {
      actions.push({
        key: 'archive',
        label: 'Archive',
        variant: 'danger',
        onClick: () => handleArchive(row),
      })
    }
    return actions
  }

  const activeCount = rows.filter((row) => row.is_active).length

  if (loading) return <LoadingState message="Loading simulation scenarios..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Simulation Scenarios</h1>
          <p className="text-sm text-gray-500">Filter scenarios by lifecycle and difficulty, then review or edit details.</p>
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, ID, or description..." />
          <button
            type="button"
            onClick={handleExport}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Export
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'active', label: 'Active' },
          { key: 'archived', label: 'Archived' },
        ].map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === filter.key
                ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Difficulty</label>
        <select
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All levels</option>
          {difficultyOptions.map((difficulty) => (
            <option key={difficulty} value={difficulty}>{difficulty}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total scenarios" value={rows.length} />
        <AdminCard title="Active scenarios" value={activeCount} />
        <AdminCard title="Archived scenarios" value={rows.length - activeCount} />
        <AdminCard
          title="Avg score"
          value={rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.average_score || 0), 0) / rows.length) : 0}
        />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No scenarios found" description="Try adjusting filters or search criteria." />
      ) : (
        <AdminTable
          rows={filteredRows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'name', label: 'Scenario', render: (r) => (
              <button
                type="button"
                className="text-left text-blue-300 hover:underline"
                onClick={() => viewScenario(r)}
              >
                {r.name || '—'}
              </button>
            ) },
            { key: 'difficulty_level', label: 'Difficulty', render: (r) => r.difficulty_level || '—' },
            { key: 'completions_count', label: 'Completions', render: (r) => r.completions_count ?? 0 },
            { key: 'average_score', label: 'Avg Score', render: (r) => r.average_score ?? '—' },
            { key: 'created_at', label: 'Created', render: (r) => (
              <span title={formatDate(r.created_at)}>{formatDateShort(r.created_at)}</span>
            ) },
            {
              key: 'is_active',
              label: 'Status',
              render: (r) => <AdminBadge label={r.is_active ? 'active' : 'archived'} variant={r.is_active ? 'active' : 'deactivated'} />,
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <AdminIconActionButton variant="view" label="View" onClick={() => viewScenario(r)} />
                  <AdminActionButton variant="default" onClick={() => setManageRow(r)}>
                    Manage
                  </AdminActionButton>
                </AdminRowActions>
              ),
            },
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
          { key: 'archive', label: 'Archive', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'archive' }) },
          { key: 'activate', label: 'Activate', onClick: () => setBulkModal({ open: true, action: 'activate' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={bulkModal.action === 'archive' ? `Archive ${bulk.selectedCount} scenario(s)?` : `Activate ${bulk.selectedCount} scenario(s)?`}
        message={bulkModal.action === 'archive' ? 'Selected scenarios will be set inactive.' : 'Selected scenarios will be reactivated.'}
        items={bulk.selectedItems}
        itemLabel={(item) => item.name || item.id}
        confirmLabel={bulkModal.action === 'archive' ? 'Archive' : 'Activate'}
        danger={bulkModal.action === 'archive'}
        onConfirm={confirmBulkAction}
        onClose={() => setBulkModal({ open: false, action: null })}
        processing={bulk.processing}
      />

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage scenario"
        subtitle={manageRow?.name}
        onClose={() => setManageRow(null)}
        actions={buildScenarioManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
