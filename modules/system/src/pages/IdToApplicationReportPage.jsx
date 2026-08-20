import { useEffect, useMemo, useState } from 'react'
import {
  APPLICATION_LABELS,
  buildIdToApplicationReportRows,
  fetchIdGenerationRules,
  filterIdToApplicationReportRows,
  ID_TO_APPLICATION_REPORT_COLUMNS,
  summarizeIdToApplicationReport,
} from '@nidus-admin/shared'
import { EmptyState, ExportListMenu, LoadingState, SearchBar } from '@nidus-admin/ui'

const APPLICATION_OPTIONS = ['all', ...Object.values(APPLICATION_LABELS)]

export default function IdToApplicationReportPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [applicationFilter, setApplicationFilter] = useState('all')
  const [tableFilter, setTableFilter] = useState('all')

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      const { data, error } = await fetchIdGenerationRules({ limit: 10000 })
      if (cancelled) return
      setRows(error ? [] : buildIdToApplicationReportRows(data || []))
      setLoading(false)
    }

    loadData()
    return () => { cancelled = true }
  }, [])

  const tableOptions = useMemo(() => {
    const tables = new Set(rows.map((row) => row.target_table).filter(Boolean))
    return ['all', ...Array.from(tables).sort()]
  }, [rows])

  const filteredRows = useMemo(
    () => filterIdToApplicationReportRows(rows, {
      search,
      application: applicationFilter,
      table: tableFilter,
    }),
    [rows, search, applicationFilter, tableFilter],
  )

  const summary = useMemo(
    () => summarizeIdToApplicationReport(filteredRows),
    [filteredRows],
  )

  const exportRows = filteredRows

  if (loading) return <LoadingState message="Loading ID to Application report..." />

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">ID to Application Report</h1>
          <p className="text-sm text-gray-500">
            Maps ID generation rule abbreviations to their target application and database table.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportListMenu
            columns={ID_TO_APPLICATION_REPORT_COLUMNS}
            data={exportRows}
            baseFilename="id_to_application_report"
            disabled={!exportRows.length}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Configured Rules</p>
          <p className="mt-1 text-2xl font-semibold text-gray-100">{summary.total.toLocaleString()}</p>
        </div>
        {Object.values(APPLICATION_LABELS).map((application) => (
          <div key={application} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{application}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-100">
              {(summary.byApplication[application] || 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex w-full flex-col gap-3 lg:flex-row">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search abbreviation, application, or table..."
        />
        <select
          value={applicationFilter}
          onChange={(e) => setApplicationFilter(e.target.value)}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {APPLICATION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All applications' : option}
            </option>
          ))}
        </select>
        <select
          value={tableFilter}
          onChange={(e) => setTableFilter(e.target.value)}
          className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {tableOptions.map((option) => (
            <option key={option} value={option}>
              {option === 'all' ? 'All tables' : option}
            </option>
          ))}
        </select>
      </div>

      {!filteredRows.length ? (
        <EmptyState
          title="No report rows found"
          description="Adjust the search or filters, or configure ID rules first."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                {ID_TO_APPLICATION_REPORT_COLUMNS.map((column) => (
                  <th key={column.key} className="px-4 py-3">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${row.table_abbreviation}-${row.target_table}-${index}`} className="border-t border-gray-800">
                  {ID_TO_APPLICATION_REPORT_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 ${column.key === 'table_abbreviation' ? 'font-mono text-blue-200' : column.key === 'target_table' || column.key === 'table_name' ? 'text-gray-300' : ''}`}
                    >
                      {row[column.key] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
