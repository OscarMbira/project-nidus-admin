import { useMemo } from 'react'
import {
  exportToFile,
  fetchAllProjects,
  generateExportFilename,
  rowMatchesListSearch,
  useAdminListPage,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import { AdminTable, AdminCard, LoadingState, EmptyState, SearchBar, ViewToggle, useToast } from '@nidus-admin/ui'

export default function PlatformProjectsOverviewPage() {
  const { showSuccess, showError } = useToast()
  const { rows, sourceRows, loading, error, search, setSearch, view, setView } = useAdminListPage({
    fetchFn: fetchAllProjects,
    storageKey: 'admin-platform-PlatformProjectsOverviewPage',
    readSearchFromUrl: true,
  })

  const rowIds = useMemo(() => sourceRows.map((row) => row.id).filter(Boolean), [sourceRows])
  const { displayIdMap } = useDisplayIdMap('public.projects', rowIds)

  const displayRows = useMemo(() => {
    const q = search.trim()
    if (!q) return rows
    return sourceRows.filter((row) => rowMatchesListSearch(row, q, {
      extraTexts: [displayIdMap[row.id] || ''],
    }))
  }, [rows, sourceRows, search, displayIdMap])

  const handleExport = () => {
    const exportRows = sourceRows.map((row) => ({
      ...row,
      display_id: displayIdMap[row.id] || row.id,
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'display_id', label: 'Display ID' },
        { key: 'project_name', label: 'Project Name' },
        { key: 'project_status', label: 'Project Status' },
        { key: 'account_id', label: 'Account Id' },
        { key: 'created_at', label: 'Created At' },
      ],
      generateExportFilename('platform_projects'),
    )
    if (exportError) showError(exportError)
    else showSuccess('Projects exported.')
  }

  if (loading) return <LoadingState message="Loading Platform Projects..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Platform Projects</h1>
        </div>
        <div className="flex gap-3">
          <SearchBar value={search} onChange={setSearch} />
          <button
            type="button"
            onClick={handleExport}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Export
          </button>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>
      <AdminCard title="Total records" value={displayRows.length} />
      {displayRows.length === 0 ? (
        <EmptyState title="No records" description="No data matches your criteria." />
      ) : view === 'table' ? (
        <AdminTable
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'project_name', label: 'Project Name' },
            { key: 'project_status', label: 'Project Status' },
            { key: 'account_id', label: 'Account Id' },
            { key: 'created_at', label: 'Created At' },
          ]}
          rows={displayRows}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayRows.map((r, i) => (
            <div key={r.id || i} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <span className="text-xs text-gray-500">#{i + 1}</span>
              {displayIdMap[r.id] && (
                <p className="font-mono text-xs text-blue-200">{displayIdMap[r.id]}</p>
              )}
              <p className="font-medium text-gray-100">{r.project_name ?? r.id ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
