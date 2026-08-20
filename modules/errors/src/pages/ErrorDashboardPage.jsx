import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  fetchErrorAggregations,
  formatDate,
  formatDateShort,
  PermissionGate,
  ReleaseReadinessBannerGate,
  updateErrorSeverity,
  updateErrorStatus,
  useBulkSelection,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminModal,
  AdminRowActions,
  AdminTable,
  BulkActionBar,
  EmptyState,
  LoadingState,
  SearchBar,
  useToast,
} from '@nidus-admin/ui'

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low']
const STATUS_OPTIONS = ['all', 'new', 'acknowledged', 'investigating', 'resolved', 'ignored', 'recurring']
const SYSTEM_OPTIONS = ['all', 'platform', 'simulator']
const BULK_STATUS_OPTIONS = ['acknowledged', 'investigating', 'resolved', 'ignored']
const BULK_SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low']
const ROW_STATUS_OPTIONS = ['acknowledged', 'investigating', 'resolved', 'ignored']

export default function ErrorDashboardPage() {
  const { showSuccess, showError } = useToast()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState('')
  const [readinessReloadKey, setReadinessReloadKey] = useState(0)
  const [bulkModal, setBulkModal] = useState({ open: false, action: null, newStatus: 'acknowledged', newSeverity: 'medium' })
  const [statusModal, setStatusModal] = useState({ open: false, row: null, newStatus: 'acknowledged' })
  const [filters, setFilters] = useState(() => ({
    severity: searchParams.get('severity') || 'all',
    status: searchParams.get('status') || 'all',
    system: 'all',
    dateFrom: '',
    dateTo: '',
  }))

  const loadData = async () => {
    setLoading(true)
    const apiFilters = []
    if (filters.severity !== 'all') apiFilters.push({ op: 'eq', col: 'severity', val: filters.severity })
    if (filters.status !== 'all') apiFilters.push({ op: 'eq', col: 'status', val: filters.status })
    if (filters.system !== 'all') apiFilters.push({ op: 'eq', col: 'system', val: filters.system })
    if (filters.dateFrom) apiFilters.push({ op: 'gte', col: 'last_seen_at', val: new Date(filters.dateFrom).toISOString() })
    if (filters.dateTo) apiFilters.push({ op: 'lte', col: 'last_seen_at', val: new Date(`${filters.dateTo}T23:59:59`).toISOString() })

    const { data, error } = await fetchErrorAggregations({ filters: apiFilters.length ? apiFilters : undefined })
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setReadinessReloadKey((key) => key + 1)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [filters.severity, filters.status, filters.system, filters.dateFrom, filters.dateTo])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => (
      String(row.error_type || '').toLowerCase().includes(term)
      || String(row.error_message || '').toLowerCase().includes(term)
      || String(row.page_route || '').toLowerCase().includes(term)
      || String(row.error_hash || '').toLowerCase().includes(term)
    ))
  }, [rows, search])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const runStatusAction = async (row, status) => {
    setBusyId(`${row.id}-${status}`)
    const { error } = await updateErrorStatus(row.id, status, `Changed from dashboard to ${status}`)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return false
    }
    showSuccess(`Error marked as ${status}.`)
    await loadData()
    return true
  }

  const confirmRowStatus = async () => {
    const { row, newStatus } = statusModal
    if (!row || !newStatus || newStatus === row.status) {
      setStatusModal({ open: false, row: null, newStatus: 'acknowledged' })
      return
    }
    const ok = await runStatusAction(row, newStatus)
    if (ok) setStatusModal({ open: false, row: null, newStatus: 'acknowledged' })
  }

  const confirmBulkAction = async () => {
    const { action, newStatus, newSeverity } = bulkModal
    setBulkModal({ open: false, action: null, newStatus: 'acknowledged', newSeverity: 'medium' })
    let outcome
    if (action === 'updateStatus') {
      outcome = await bulk.executeBulk((row) => updateErrorStatus(row.id, newStatus, `Bulk status update to ${newStatus}`))
      reportBulk(outcome, 'error status(es) updated')
    } else if (action === 'updateSeverity') {
      outcome = await bulk.executeBulk((row) => updateErrorSeverity(row.id, newSeverity))
      reportBulk(outcome, 'error severity(ies) updated')
    }
    await loadData()
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <ReleaseReadinessBannerGate reloadKey={readinessReloadKey} />

      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Error Dashboard</h1>
        <p className="text-sm text-gray-500">Filter by severity, status, system, and date range with quick triage actions.</p>
      </div>

      <div className="grid gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <div className="xl:col-span-2">
          <SearchBar value={search} onChange={setSearch} placeholder="Search type, message, route, or hash..." />
        </div>
        <select value={filters.severity} onChange={(e) => setFilters((prev) => ({ ...prev, severity: e.target.value }))} className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
          {SEVERITY_OPTIONS.map((option) => <option key={option} value={option}>{option === 'all' ? 'All severities' : option}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))} className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
          {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option === 'all' ? 'All statuses' : option}</option>)}
        </select>
        <select value={filters.system} onChange={(e) => setFilters((prev) => ({ ...prev, system: e.target.value }))} className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
          {SYSTEM_OPTIONS.map((option) => <option key={option} value={option}>{option === 'all' ? 'All systems' : option}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2 xl:col-span-2">
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100" />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100" />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading error dashboard..." />
      ) : !filteredRows.length ? (
        <EmptyState title="No errors found" description="No error aggregations match current filters." />
      ) : (
        <>
        <AdminTable
          rows={filteredRows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          columns={[
            {
              key: 'error_type',
              label: 'Error',
              sortable: false,
              render: (row) => (
                <div>
                  <p className="font-medium text-gray-100">{row.error_type || 'Unknown error'}</p>
                  <p className="text-xs text-gray-400">{row.error_message || 'No message'}</p>
                  <p className="text-[11px] text-gray-500">{row.error_hash}</p>
                </div>
              ),
            },
            {
              key: 'page_route',
              label: 'Route/System',
              sortable: false,
              render: (row) => (
                <div className="text-xs text-gray-300">
                  <p>{row.page_route || '—'}</p>
                  <p className="text-gray-500">{row.system || 'unknown'}</p>
                </div>
              ),
            },
            {
              key: 'occurrence_count',
              label: 'Counts',
              sortable: false,
              render: (row) => (
                <div className="text-xs text-gray-300">
                  <p>{row.occurrence_count || 0} occurrences</p>
                  <p>{row.affected_user_count || 0} users</p>
                </div>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              render: (row) => <AdminBadge label={row.status || 'new'} variant={row.status || 'default'} />,
            },
            {
              key: 'severity',
              label: 'Severity',
              render: (row) => <AdminBadge label={row.severity || 'low'} variant={row.severity === 'critical' ? 'rejected' : 'default'} />,
            },
            {
              key: 'last_seen_at',
              label: 'Last Seen',
              render: (row) => (
                <span title={formatDate(row.last_seen_at)}>{formatDateShort(row.last_seen_at)}</span>
              ),
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (row) => (
                <PermissionGate permission="errors.status.manage">
                  <AdminRowActions>
                    <AdminActionButton
                      variant="primary"
                      disabled={Boolean(busyId)}
                      onClick={() => setStatusModal({
                        open: true,
                        row,
                        newStatus: ROW_STATUS_OPTIONS.includes(row.status) ? row.status : 'acknowledged',
                      })}
                    >
                      Update status
                    </AdminActionButton>
                  </AdminRowActions>
                </PermissionGate>
              ),
            },
          ]}
        />
        </>
      )}

      {!loading && filteredRows.length > 0 && (
      <PermissionGate permission="errors.status.manage">
      <BulkActionBar
        selectedCount={bulk.selectedCount}
        processing={bulk.processing}
        progressCurrent={bulk.progress.current}
        progressTotal={bulk.progress.total}
        onClearSelection={bulk.clearSelection}
        actions={[
          { key: 'updateStatus', label: 'Update Status', onClick: () => setBulkModal({ open: true, action: 'updateStatus', newStatus: 'acknowledged', newSeverity: 'medium' }) },
          { key: 'updateSeverity', label: 'Update Severity', onClick: () => setBulkModal({ open: true, action: 'updateSeverity', newStatus: 'acknowledged', newSeverity: 'medium' }) },
        ]}
      />
      </PermissionGate>
      )}

      <AdminModal
        open={bulkModal.open && bulkModal.action === 'updateStatus'}
        title={`Update status for ${bulk.selectedCount} error(s)`}
        onClose={() => setBulkModal({ open: false, action: null, newStatus: 'acknowledged', newSeverity: 'medium' })}
        onConfirm={confirmBulkAction}
        confirmLabel="Update Status"
      >
        <select
          value={bulkModal.newStatus}
          onChange={(event) => setBulkModal((prev) => ({ ...prev, newStatus: event.target.value }))}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {BULK_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </AdminModal>

      <AdminModal
        open={bulkModal.open && bulkModal.action === 'updateSeverity'}
        title={`Update severity for ${bulk.selectedCount} error(s)`}
        onClose={() => setBulkModal({ open: false, action: null, newStatus: 'acknowledged', newSeverity: 'medium' })}
        onConfirm={confirmBulkAction}
        confirmLabel="Update Severity"
      >
        <select
          value={bulkModal.newSeverity}
          onChange={(event) => setBulkModal((prev) => ({ ...prev, newSeverity: event.target.value }))}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {BULK_SEVERITY_OPTIONS.map((severity) => (
            <option key={severity} value={severity}>{severity}</option>
          ))}
        </select>
      </AdminModal>

      <AdminModal
        open={statusModal.open}
        title={statusModal.row ? `Update status — ${statusModal.row.error_type || 'Error'}` : 'Update status'}
        onClose={() => setStatusModal({ open: false, row: null, newStatus: 'acknowledged' })}
        onConfirm={confirmRowStatus}
        confirmLabel="Apply status"
      >
        <select
          value={statusModal.newStatus}
          onChange={(event) => setStatusModal((prev) => ({ ...prev, newStatus: event.target.value }))}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {ROW_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </AdminModal>
    </div>
  )
}
