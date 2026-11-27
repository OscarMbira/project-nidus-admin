/**
 * Monorepo v1358 Slice 3b (PRD D6, D15) — one organisation deletion record on Organisation detail › Data & compliance:
 * who asked, approved and confirmed; dates; what was deleted and what was kept; problems; the PDF certificate.
 * Read-only (Admin SQL v267, organisations.data.view). The certificate downloads through a 5-minute link.
 */
import { useState } from 'react'
import { DELETION_RECORD_STATUS_LABELS, formatDate, getDeletionCertificateUrl } from '@nidus-admin/shared'
import { AdminBadge, useToast } from '@nidus-admin/ui'

const LABEL = 'text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400'
const n = (value) => Number(value || 0).toLocaleString('en-GB')

export function useCertificateDownload() {
  const { showError } = useToast()
  const [busy, setBusy] = useState(null)
  const download = async (record) => {
    setBusy(record.id)
    const { url, error } = await getDeletionCertificateUrl(record.certificate_path)
    setBusy(null)
    if (error || !url) { showError(error || 'The certificate could not be opened'); return }
    window.open(url, '_blank', 'noopener')
  }
  return { download, busy }
}

function Fact({ label, children }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{children || '—'}</dd>
    </div>
  )
}

export default function OrgDeletionRecordCard({ record }) {
  const { download, busy } = useCertificateDownload()
  const r = record || {}
  const completed = r.status === 'completed'
  const warnings = Array.isArray(r.warnings) ? r.warnings : []
  const kept = Array.isArray(r.kept) ? r.kept : []

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={LABEL}>Deletion record</p>
          <p className="mt-1 font-mono text-sm text-blue-600 dark:text-blue-400">{r.reference || '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge label={DELETION_RECORD_STATUS_LABELS[r.status] || r.status} variant={completed ? 'archived' : 'pending'} />
          {r.certificate_path && (
            <button
              type="button"
              onClick={() => download(r)}
              disabled={busy === r.id}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === r.id ? 'Opening…' : 'Download certificate'}
            </button>
          )}
        </div>
      </div>

      {r.error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {r.error}
        </p>
      )}
      {!completed && r.legal_hold && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
          Paused while the legal hold is on. It carries on within an hour of the hold being lifted.
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Organisation">{r.organisation}</Fact>
        <Fact label="Deletion request">{r.request_reference}</Fact>
        <Fact label="Asked by">{r.requested_by || (r.opened_by_email ? `${r.opened_by_email} (support, on their behalf)` : null)}{r.requested_at ? `, ${formatDate(r.requested_at)}` : ''}</Fact>
        <Fact label="Reason">{r.reason}</Fact>
        <Fact label="Approved by">{r.approved_by_email}{r.approved_at ? `, ${formatDate(r.approved_at)}` : ''}</Fact>
        <Fact label="Confirmed by">{r.confirmed_by}{r.confirmed_at ? `, ${formatDate(r.confirmed_at)}` : ''}</Fact>
        <Fact label="Locked">{r.locked_at ? formatDate(r.locked_at) : null}</Fact>
        <Fact label="Deletion started">{r.started_at ? formatDate(r.started_at) : null}</Fact>
        <Fact label="Deleted">{r.finished_at ? formatDate(r.finished_at) : null}</Fact>
      </dl>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact label="Records deleted">{`${n(r.rows_deleted)} in ${n(r.table_count)} tables`}</Fact>
        <Fact label="Files removed">{`${n(r.files_done)} of ${n(r.files_total)}${r.files_not_removed ? ` (${n(r.files_not_removed)} not removed)` : ''}`}</Fact>
        <Fact label="Members">{completed ? `${n(r.members_removed)} removed, ${n(r.members_kept)} kept their account` : null}</Fact>
        <Fact label="Certificate">
          {r.certificate_sent_at
            ? `Sent ${formatDate(r.certificate_sent_at)}${(r.recipients || []).length ? ` to ${(r.recipients || []).map((x) => x.name).filter(Boolean).join(', ')}` : ''}`
            : completed ? 'Being sent' : 'After the deletion'}
        </Fact>
      </dl>

      {kept.length > 0 && (
        <div>
          <p className={LABEL}>Kept, and why</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {kept.map((k) => <li key={k.table}><span className="font-mono">{k.table}</span>: {n(k.rows)} — {k.reason}</li>)}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div>
          <p className={LABEL}>Notes ({warnings.length})</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600 dark:text-gray-400">
            {warnings.map((w, i) => <li key={i}>{[w.step, w.table, w.column, w.rows != null ? `${w.rows} rows` : null, w.sign_in, w.profile, w.error].filter(Boolean).join(' · ')}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
