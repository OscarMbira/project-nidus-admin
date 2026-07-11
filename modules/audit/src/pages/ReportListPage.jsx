import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchReportDefinitions, formatDate, runReport } from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  useToast,
} from '@nidus-admin/ui'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

export default function ReportListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [systemFilter, setSystemFilter] = useState('all')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchReportDefinitions()
    if (error) {
      showError(toErrorMessage(error, 'Failed to load reports.'))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const reportTypes = useMemo(() => {
    const types = new Set(rows.map((row) => row.report_type).filter(Boolean))
    return ['all', ...Array.from(types).sort()]
  }, [rows])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.report_type !== typeFilter) return false
      if (systemFilter === 'cross' && row.target_system !== 'all') return false
      if (systemFilter !== 'all' && systemFilter !== 'cross' && row.target_system !== systemFilter) return false
      if (!term) return true
      return [row.report_name, row.report_key, row.description, row.report_type, row.target_system]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, typeFilter, systemFilter])

  const handleRun = async (report) => {
    setBusyId(report.id)
    const { data: runId, error } = await runReport(report.id)
    setBusyId('')
    if (error) {
      showError(toErrorMessage(error, 'Failed to run report.'))
      return
    }
    showSuccess(`Report "${report.report_name}" started.`)
    navigate(`/audit/report-viewer?id=${encodeURIComponent(runId)}`)
  }

  if (loading) return <LoadingState message="Loading reports..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Reports</h1>
          <p className="text-sm text-gray-500">Browse built-in and custom reports, then run ad-hoc executions.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, key, type..." />
          <select
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {reportTypes.map((type) => (
              <option key={type} value={type}>{type === 'all' ? 'All types' : type.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <select
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
          >
            <option value="all">All systems</option>
            <option value="platform">Platform</option>
            <option value="simulator">Simulator</option>
            <option value="cross">Cross-system</option>
          </select>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No reports found" description="Adjust filters or create a custom report in Report Builder." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Chart</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((report) => (
                <tr key={report.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <div className="font-medium">{report.report_name}</div>
                    {report.description && <div className="text-xs text-gray-500">{report.description}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{report.report_key}</td>
                  <td className="px-4 py-3">{report.report_type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{report.chart_type || 'table'}</td>
                  <td className="px-4 py-3">{report.target_system || 'all'}</td>
                  <td className="px-4 py-3">
                    <AdminBadge
                      label={report.is_system_report ? 'system' : 'custom'}
                      variant={report.is_system_report ? 'system_admin' : 'content_admin'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busyId === report.id}
                        onClick={() => handleRun(report)}
                        className="rounded bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-60"
                      >
                        {busyId === report.id ? 'Running...' : 'Run'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        {filteredRows.length} report{filteredRows.length === 1 ? '' : 's'} shown
        {rows[0]?.updated_at ? ` · Last updated ${formatDate(rows[0].updated_at)}` : ''}
      </p>
    </div>
  )
}
