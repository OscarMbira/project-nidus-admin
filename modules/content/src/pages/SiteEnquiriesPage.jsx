/**
 * v212 (monorepo v1241 Amendment A) — Site enquiries: messages sent from the brand site's
 * Contact page (public.site_enquiries via SQL/v230). Newest first by default — an inbox, not a
 * register (documented exception to Admin rule 12.1 in the v212 plan).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSiteEnquiries,
  siteEnquiryReference,
  SITE_ENQUIRY_STATUSES,
  getDisplayRowNumber,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  AdminTable,
  EmptyState,
  ExportListMenu,
  LoadingState,
  SearchBar,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

export const ENQUIRY_BADGE = { new: 'pending', in_progress: 'retrying', answered: 'success', closed: 'archived', spam: 'rejected' }
export const enquiryStatusLabel = (s) => String(s || '').replace('_', ' ')
const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '—')

export default function SiteEnquiriesPage() {
  const navigate = useNavigate()
  const { showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')

  useEffect(() => {
    ;(async () => {
      const { data, error } = await fetchSiteEnquiries()
      if (error) showError(String(error))
      setRows(data || [])
      setLoading(false)
    })()
  }, [])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((r) => (status === 'all' ? true : status === 'open' ? ['new', 'in_progress'].includes(r.status) : r.status === status))
      .filter((r) => !term || [r.full_name, r.email, r.organisation, r.topic, r.message, siteEnquiryReference(r.id)].some((v) => String(v ?? '').toLowerCase().includes(term)))
      .map((r, i) => ({ ...r, reference: siteEnquiryReference(r.id), received: fmt(r.created_at), opt_in: r.marketing_opt_in ? 'Yes' : '', '#': getDisplayRowNumber(i, { page: 1, pageSize: rows.length || 1 }) }))
  }, [rows, search, status])

  const counts = useMemo(() => Object.fromEntries(SITE_ENQUIRY_STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])), [rows])

  if (loading) return <LoadingState message="Loading enquiries..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Site Enquiries</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Messages sent from the Contact page of the public Nidus site. Newest first.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, email, reference..." />
          <select className={`${inputClass} sm:w-48`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="open">Open (new + in progress)</option>
            <option value="all">All</option>
            {SITE_ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{enquiryStatusLabel(s)} ({counts[s] || 0})</option>)}
          </select>
          <ExportListMenu
            columns={[{ key: '#', label: '#' }, { key: 'reference', label: 'Reference' }, { key: 'received', label: 'Received' }, { key: 'full_name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'topic', label: 'Topic' }, { key: 'document_name', label: 'Document' }, { key: 'opt_in', label: 'Marketing opt-in' }, { key: 'status', label: 'Status' }, { key: 'message', label: 'Message' }]}
            data={visible}
            baseFilename="site_enquiries"
            disabled={!visible.length}
          />
        </div>
      </div>

      {!visible.length ? (
        <EmptyState title="No enquiries" description={status === 'open' ? 'Nothing waiting for a reply.' : 'No enquiries match this filter.'} />
      ) : (
        <AdminTable
          rows={visible}
          pageSize={25}
          columns={[
            { key: 'reference', label: 'Reference', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.reference}</span> },
            { key: 'created_at', label: 'Received', render: (r) => r.received },
            { key: 'full_name', label: 'From', render: (r) => <div><div className="font-medium">{r.full_name}</div><div className="text-xs text-gray-500 dark:text-gray-400">{r.email}</div></div> },
            { key: 'topic', label: 'Topic', render: (r) => (r.topic === 'download' ? <span>download<span className="block text-xs text-gray-500 dark:text-gray-400">{r.document_name}{r.marketing_opt_in ? ' · opted in' : ''}</span></span> : r.topic) },
            { key: 'status', label: 'Status', render: (r) => <AdminBadge label={enquiryStatusLabel(r.status)} variant={ENQUIRY_BADGE[r.status]} /> },
            {
              key: 'actions', label: 'Actions', sortable: false,
              render: (r) => (
                <AdminRowActions>
                  <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/content/site-enquiry?ref=${r.reference}`)} />
                </AdminRowActions>
              ),
            },
          ]}
        />
      )}
    </div>
  )
}
