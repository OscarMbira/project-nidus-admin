/**
 * Monorepo v1358 Slice 2 — Users & Organisations › Organisation Data Requests (/users/org-data-requests).
 * Every organisation's export and deletion requests, the deletion records with their PDF certificates (Slice 3b,
 * Admin SQL v267), and the organisations on legal hold. Read-only here; holds, ownership transfers and deletion
 * decisions are made on the organisation's detail page (Data & compliance).
 * Lists: search, Card / Table toggle defaulting to table (rule 12), # numbers (AdminTable / RowNumberBadge),
 * export (rule 11), default order newest first for requests (a queue; owner exception noted in the v1358 plan),
 * organisation name A→Z for holds (rule 12.1).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DELETION_RECORD_STATUS_LABELS,
  ORGANISATION_DATA_KIND_LABELS,
  ORGANISATION_DATA_STATUS_LABELS,
  fetchOrganisationDataRequests,
  fetchOrganisationDeletionRecords,
  formatDataSize,
  formatDate,
  getDisplayRowNumber,
} from '@nidus-admin/shared'
import {
  AdminFieldLabelWithHelp,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  RowNumberBadge,
  SearchBar,
  ViewToggle,
} from '@nidus-admin/ui'
import { useCertificateDownload } from '../components/OrgDeletionRecordCard.jsx'

const VIEW_KEY = 'nidus.admin.org-data-requests.view'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) || 'table' } catch { return 'table' } }

export default function OrgDataRequestsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState({ requests: [], holds: [] })
  const [records, setRecords] = useState([])
  const { download, busy } = useCertificateDownload()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState(readView)

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view) } catch { /* ignore */ } }, [view])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchOrganisationDataRequests(), fetchOrganisationDeletionRecords()]).then(([res, rec]) => {
      if (cancelled) return
      setData(res.data)
      setRecords(rec.data)
      setError(res.error || rec.error)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => (data.requests || []).map((r) => ({
    ...r,
    kind_label: ORGANISATION_DATA_KIND_LABELS[r.kind] || r.kind,
    status_label: ORGANISATION_DATA_STATUS_LABELS[r.status] || r.status,
    requested_label: formatDate(r.created_at),
    size_label: formatDataSize(r.byte_size),
    hold_label: r.legal_hold ? 'On hold' : '',
  })), [data.requests])

  const q = search.trim().toLowerCase()
  const visible = rows.filter((r) => !q || [r.reference, r.account_name, r.account_code, r.kind_label, r.status_label, r.requested_by]
    .some((v) => String(v ?? '').toLowerCase().includes(q)))

  const exportColumns = [
    { key: 'reference', label: 'Reference' },
    { key: 'account_name', label: 'Organisation' },
    { key: 'kind_label', label: 'Type' },
    { key: 'status_label', label: 'Status' },
    { key: 'requested_by', label: 'Requested by' },
    { key: 'requested_label', label: 'Requested' },
    { key: 'size_label', label: 'Size' },
    { key: 'hold_label', label: 'Legal hold' },
  ]
  const recordRows = useMemo(() => records.map((r) => ({
    ...r,
    status_label: DELETION_RECORD_STATUS_LABELS[r.status] || r.status,
    deleted_label: r.finished_at ? formatDate(r.finished_at) : '—',
    rows_label: Number(r.rows_deleted || 0).toLocaleString('en-GB'),
  })), [records])
  const visibleRecords = recordRows.filter((r) => !q || [r.reference, r.organisation, r.request_reference, r.status_label]
    .some((v) => String(v ?? '').toLowerCase().includes(q)))

  const openOrg = (r) => navigate(`/users/org-detail?id=${encodeURIComponent(r.account_id)}`)

  if (loading) return <LoadingState message="Loading organisation data requests..." />

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Organisation Data Requests</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Exports and deletions the Account Owners asked for, deletion records with their certificates, and organisations on legal
          hold. Open an organisation to place or lift a hold, transfer ownership or decide a deletion.
        </p>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>}

      <section className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Requests</h2>
          <ExportListMenu columns={exportColumns} data={visible} baseFilename="organisation_data_requests" disabled={!visible.length} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <SearchBar value={search} onChange={setSearch} placeholder="Search requests..." />
          <ViewToggle view={view} onChange={setView} />
        </div>
        {visible.length === 0 ? (
          <EmptyState title="No requests" description={q ? 'Nothing matches your search.' : 'No organisation has asked for an export yet.'} />
        ) : view === 'card' ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openOrg(r)}
                className="space-y-1 rounded-lg border border-gray-200 bg-white p-4 text-left text-sm hover:border-blue-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-blue-500"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-blue-600 dark:text-blue-400">{r.reference || '—'}</span>
                  <RowNumberBadge number={getDisplayRowNumber(i, { page: 1, pageSize: visible.length })} />
                </div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{r.account_name}</p>
                <p className="text-gray-600 dark:text-gray-300">{r.kind_label} · {r.status_label}{r.legal_hold ? ' · On hold' : ''}</p>
                <p className="text-gray-500 dark:text-gray-400">{r.requested_label}{r.requested_by ? ` · ${r.requested_by}` : ''} · {r.size_label}</p>
              </button>
            ))}
          </div>
        ) : (
          <AdminTable
            rows={visible}
            pageSize={50}
            defaultSortKey="created_at"
            defaultSortDir="desc"
            columns={[
              {
                key: 'reference',
                label: <AdminFieldLabelWithHelp as="span" helpKey="admin.organisation_data_requests.reference">Reference</AdminFieldLabelWithHelp>,
                render: (r) => (
                  <button type="button" onClick={() => openOrg(r)} className="font-mono text-blue-600 hover:underline dark:text-blue-400">{r.reference || '—'}</button>
                ),
              },
              { key: 'account_name', label: 'Organisation', render: (r) => <span className="text-gray-900 dark:text-gray-100">{r.account_name}</span> },
              { key: 'kind_label', label: 'Type' },
              {
                key: 'status_label',
                label: <AdminFieldLabelWithHelp as="span" helpKey="admin.organisation_data_requests.status">Status</AdminFieldLabelWithHelp>,
                render: (r) => <span title={r.error || undefined}>{r.status_label}</span>,
              },
              { key: 'requested_by', label: 'Requested by', render: (r) => r.requested_by || '—' },
              { key: 'created_at', label: 'Requested', render: (r) => r.requested_label },
              { key: 'byte_size', label: 'Size', render: (r) => r.size_label },
              { key: 'hold_label', label: 'Legal hold', render: (r) => (r.legal_hold ? <span className="font-medium text-amber-700 dark:text-amber-300">On hold</span> : '—') },
            ]}
          />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Deletion records</h2>
          <ExportListMenu
            columns={[
              { key: 'reference', label: 'Reference' },
              { key: 'organisation', label: 'Organisation' },
              { key: 'request_reference', label: 'Request' },
              { key: 'status_label', label: 'Status' },
              { key: 'deleted_label', label: 'Deleted' },
              { key: 'rows_label', label: 'Records deleted' },
            ]}
            data={visibleRecords}
            baseFilename="organisation_deletion_records"
            disabled={!visibleRecords.length}
          />
        </div>
        {visibleRecords.length === 0 ? (
          <EmptyState title="No deletion records" description={q ? 'Nothing matches your search.' : 'No organisation has been deleted yet.'} />
        ) : (
          <AdminTable
            rows={visibleRecords}
            pageSize={50}
            defaultSortKey="created_at"
            defaultSortDir="desc"
            columns={[
              {
                key: 'reference',
                label: 'Reference',
                render: (r) => (
                  <button type="button" onClick={() => openOrg(r)} className="font-mono text-blue-600 hover:underline dark:text-blue-400">{r.reference || '—'}</button>
                ),
              },
              { key: 'organisation', label: 'Organisation', render: (r) => <span className="text-gray-900 dark:text-gray-100">{r.organisation}</span> },
              { key: 'request_reference', label: 'Request', render: (r) => r.request_reference || '—' },
              { key: 'status_label', label: 'Status', render: (r) => <span title={r.error || undefined} className={r.error ? 'text-red-700 dark:text-red-300' : undefined}>{r.status_label}</span> },
              { key: 'finished_at', label: 'Deleted', render: (r) => r.deleted_label },
              { key: 'rows_deleted', label: 'Records deleted', render: (r) => r.rows_label },
              {
                key: 'certificate',
                label: 'Certificate',
                sortable: false,
                render: (r) => (r.certificate_path ? (
                  <button type="button" onClick={() => download(r)} disabled={busy === r.id}
                    className="text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400">
                    {busy === r.id ? 'Opening…' : 'Download'}
                  </button>
                ) : '—'),
              },
            ]}
          />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Organisations on legal hold</h2>
        {(data.holds || []).length === 0 ? (
          <EmptyState title="No legal holds" description="No organisation is on legal hold." />
        ) : (
          <AdminTable
            rows={data.holds}
            idKey="account_id"
            pageSize={50}
            columns={[
              {
                key: 'account_name',
                label: 'Organisation',
                render: (r) => (
                  <button type="button" onClick={() => openOrg(r)} className="text-blue-600 hover:underline dark:text-blue-400">{r.account_name}</button>
                ),
              },
              { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
              { key: 'since', label: 'Since', render: (r) => formatDate(r.since) },
              { key: 'by_email', label: 'Placed by', render: (r) => r.by_email || '—' },
            ]}
          />
        )}
      </section>
    </div>
  )
}
