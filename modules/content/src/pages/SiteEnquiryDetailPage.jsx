/**
 * v212 (monorepo v1241 Amendment A) — One site enquiry: read the message, reply by email and set
 * its status. Route: /content/site-enquiry?ref=<reference> — the 8-character reference the visitor
 * was shown (Admin rule 13.1); a full id also works.
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchSiteEnquiries,
  setSiteEnquiryStatus,
  siteEnquiryReference,
  SITE_ENQUIRY_STATUSES,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'
import { ENQUIRY_BADGE, enquiryStatusLabel } from './SiteEnquiriesPage.jsx'

export default function SiteEnquiryDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ref = String(searchParams.get('ref') || searchParams.get('id') || '').trim()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('details')

  const load = async () => {
    const { data, error } = await fetchSiteEnquiries()
    if (error) showError(String(error))
    const row = (data || []).find((r) => r.id === ref || siteEnquiryReference(r.id) === ref.toUpperCase()) || null
    setRecord(row)
    setStatus(row?.status || '')
    setLoading(false)
  }
  useEffect(() => { load() }, [ref])

  const goBack = () => navigate('/content/site-enquiries')

  const saveStatus = async () => {
    setSaving(true)
    const { error } = await setSiteEnquiryStatus(record.id, status)
    setSaving(false)
    if (error) {
      showError(String(error))
      return
    }
    showSuccess(`Enquiry ${siteEnquiryReference(record.id)} marked ${enquiryStatusLabel(status)}.`)
    await load()
  }

  if (loading) return <LoadingState message="Loading enquiry..." />
  if (!record) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Enquiry not found" description={`No enquiry with reference "${ref}".`} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to enquiries
        </button>
      </div>
    )
  }

  const reference = siteEnquiryReference(record.id)
  const replyHref = `mailto:${record.email}?subject=${encodeURIComponent(`Re: your enquiry ${reference}`)}`

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to enquiries
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Enquiry {reference}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Received {new Date(record.created_at).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge label={enquiryStatusLabel(record.status)} variant={ENQUIRY_BADGE[record.status]} />
          <a href={replyHref} className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">Reply by email</a>
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="When this enquiry arrived and who last handled it.">
          <AuditCard title="Identity" description="How this enquiry is identified.">
            <AuditField label="Reference" value={reference} />
            <AuditField label="From" value={`${record.full_name} <${record.email}>`} />
          </AuditCard>
          <AuditCard title="Classification" description="What the enquiry is about.">
            <AuditField label="Topic" value={record.topic} />
            <AuditField label="Product" value={record.product_slug || null} />
            <AuditField label="Status" value={enquiryStatusLabel(record.status)} />
          </AuditCard>
          <AuditCard title="Record history" description="When this enquiry was received and last handled.">
            <AuditTimestampPair dateLabel="Received at" value={record.created_at} />
            <AuditField label="Handled by" value={record.handled_by || null} />
            <AuditTimestampPair dateLabel="Handled at" value={record.handled_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {[
              ['Name', record.full_name],
              ['Email', record.email],
              ['Organisation', record.organisation],
              ['Topic', record.topic],
              ['Product', record.product_slug],
              ['Sent from page', record.page_url],
              // v1263: email-gated blog downloads.
              ...(record.topic === 'download' ? [
                ['Document', record.document_name],
                ['Marketing opt-in', record.marketing_opt_in ? `Yes (${new Date(record.marketing_opt_in_at).toLocaleString()})` : 'No'],
              ] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</dt>
                <dd className="break-words text-gray-900 dark:text-gray-100">{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Message</p>
            <p className="mt-1 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">{record.message}</p>
          </div>
          <PermissionGate permission="system.public_site.edit">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Status
                <select className={`${inputClass} mt-1 w-48`} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {SITE_ENQUIRY_STATUSES.map((s) => <option key={s} value={s}>{enquiryStatusLabel(s)}</option>)}
                </select>
              </label>
              <button
                type="button"
                onClick={saveStatus}
                disabled={saving || status === record.status}
                className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Update status'}
              </button>
            </div>
          </PermissionGate>
        </div>
      )}
    </div>
  )
}
