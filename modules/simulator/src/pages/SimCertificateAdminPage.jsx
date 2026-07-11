import { useEffect, useMemo, useState } from 'react'
import {
  fetchSimCertificates,
  formatDate,
  revokeSimCertificate,
  rowMatchesListSearch,
  useBulkSelection,
  useDisplayIdMap,
  useInitialUrlSearch,
} from '@nidus-admin/shared'
import {
  AdminBadge,
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

export default function SimCertificateAdminPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useInitialUrlSearch()
  const [statusFilter, setStatusFilter] = useState('all')
  const [bulkModal, setBulkModal] = useState({ open: false, reason: '' })

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('sim.certificates', rowIds)

  const loadCertificates = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchSimCertificates()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadCertificates()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.trim()
    return rows.filter((row) => {
      if (statusFilter === 'verified' && !row.is_verified) return false
      if (statusFilter === 'revoked' && row.is_verified) return false
      return rowMatchesListSearch(row, query, {
        extraTexts: [
          displayIdMap[row.id],
          row.certificate_name,
          row.certificate_type,
          row.user_id,
        ],
      })
    })
  }, [rows, search, statusFilter, displayIdMap])

  const bulk = useBulkSelection({
    rows: filteredRows,
    idKey: 'id',
  })

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const confirmBulkRevoke = async () => {
    const { reason } = bulkModal
    setBulkModal({ open: false, reason: '' })
    const outcome = await bulk.executeBulk((row) => {
      if (!row.is_verified) return { error: 'Already revoked' }
      return revokeSimCertificate(row.id, reason)
    })
    reportBulk(outcome, 'certificate(s) revoked')
    await loadCertificates()
  }

  const handleRevoke = (row) => {
    confirm({
      title: `Revoke "${row.certificate_name || row.id}"?`,
      message: 'This will revoke verification and add an audit trail reason.',
      confirmLabel: 'Revoke',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await revokeSimCertificate(row.id, reason)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Certificate revoked successfully.')
        await loadCertificates()
      },
    })
  }

  const verifiedCount = rows.filter((row) => row.is_verified).length

  if (loading) return <LoadingState message="Loading simulator certificates..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Simulator Certificates</h1>
          <p className="text-sm text-gray-500">Review certificate verification status and revoke compromised records.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by certificate, type, or user..." />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'All' },
          { key: 'verified', label: 'Verified' },
          { key: 'revoked', label: 'Revoked' },
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total certificates" value={rows.length} />
        <AdminCard title="Verified" value={verifiedCount} />
        <AdminCard title="Revoked" value={rows.length - verifiedCount} />
        <AdminCard title="Avg score" value={rows.length ? Math.round(rows.reduce((sum, row) => sum + Number(row.score || 0), 0) / rows.length) : 0} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No certificates found" description="Try broadening the filters to display certificate records." />
      ) : (
        <AdminTable
          rows={filteredRows}
          selectable
          selectedIds={bulk.selectedIds}
          onSelectionChange={bulk.setSelectedIds}
          selectableFilter={(row) => row.is_verified}
          columns={[
            { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
            { key: 'certificate_name', label: 'Certificate', render: (r) => r.certificate_name || '—' },
            { key: 'certificate_type', label: 'Type', render: (r) => r.certificate_type || '—' },
            { key: 'user_id', label: 'User ID', render: (r) => r.user_id || '—' },
            { key: 'score', label: 'Score', render: (r) => r.score ?? '—' },
            { key: 'issue_date', label: 'Issued', render: (r) => formatDate(r.issue_date) },
            {
              key: 'is_verified',
              label: 'Status',
              render: (r) => <AdminBadge label={r.is_verified ? 'verified' : 'revoked'} variant={r.is_verified ? 'active' : 'deactivated'} />,
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                r.is_verified ? (
                  <button
                    type="button"
                    onClick={() => handleRevoke(r)}
                    className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70"
                  >
                    Revoke
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">Already revoked</span>
                )
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
          { key: 'revoke', label: 'Revoke', variant: 'danger', onClick: () => setBulkModal({ open: true, reason: '' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={`Revoke ${bulk.selectedCount} certificate(s)?`}
        message="This will revoke verification and add an audit trail reason."
        items={bulk.selectedItems}
        itemLabel={(item) => item.certificate_name || item.id}
        confirmLabel="Revoke"
        danger
        requireReason
        reason={bulkModal.reason}
        onReasonChange={(value) => setBulkModal((prev) => ({ ...prev, reason: value }))}
        onConfirm={confirmBulkRevoke}
        onClose={() => setBulkModal({ open: false, reason: '' })}
        processing={bulk.processing}
      />

      {modal}
    </div>
  )
}
