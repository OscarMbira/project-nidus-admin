import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildReviewFieldRows, fetchLifecycleRecordForReview } from '@nidus-admin/shared'
import { AdminModal } from './AdminModal.jsx'
import { LoadingState } from './LoadingState.jsx'

export function AuthoriserReviewModal({
  open,
  row,
  decision,
  tableLabel,
  submitterName,
  recordLink,
  onClose,
  onConfirm,
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [record, setRecord] = useState(null)
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const approve = decision === 'approve'
  const recordLabel = row?.record_label || row?.record_id || 'Record'

  useEffect(() => {
    if (!open || !row?.table_name || !row?.record_id) {
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setReason('')
    setSubmitting(false)

    fetchLifecycleRecordForReview(row.table_name, row.record_id).then((result) => {
      if (cancelled) return
      if (result.error && !result.record) {
        setError(result.error)
        setRecord(null)
        setPending(null)
      } else {
        setRecord(result.record)
        setPending(result.pending)
        if (result.error) setError(result.error)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [open, row?.table_name, row?.record_id])

  const fieldRows = useMemo(
    () => (record ? buildReviewFieldRows(row?.table_name, record, pending, {
      original_changes: row?.original_changes,
      new_changes: row?.new_changes,
    }) : []),
    [record, pending, row?.table_name, row?.original_changes, row?.new_changes],
  )

  const changedCount = fieldRows.filter((field) => field.changed).length

  const handleConfirm = async () => {
    if (!reason.trim() || submitting) return
    setSubmitting(true)
    try {
      await onConfirm(reason.trim())
    } catch {
      setSubmitting(false)
    }
  }

  if (!open || !row) return null

  return (
    <AdminModal
      open
      size="xl"
      title={approve ? 'Review and approve submission' : 'Review and reject submission'}
      onClose={onClose}
      hideFooter
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-700 bg-gray-950/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-100">{recordLabel}</h3>
              <p className="text-sm text-gray-500">{tableLabel || row.table_name}</p>
            </div>
            {recordLink && (
              <Link
                to={recordLink}
                className="text-sm text-violet-300 hover:text-violet-200"
                onClick={onClose}
              >
                Open full record →
              </Link>
            )}
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Submitted by</dt>
              <dd className="text-gray-200">{submitterName || row.submitted_by || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">Submitted</dt>
              <dd className="text-gray-200">
                {row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'}
              </dd>
            </div>
            {row.submission_notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-gray-500">Submission note</dt>
                <dd className="text-gray-300">{row.submission_notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {loading ? (
          <LoadingState message="Loading record details…" />
        ) : error && !record ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-200">Record review</h4>
              <span className="text-xs text-gray-500">
                {changedCount > 0
                  ? `${changedCount} field${changedCount === 1 ? '' : 's'} changing`
                  : 'No deferred field diff — review full record before deciding'}
              </span>
            </div>

            <div className="max-h-[24rem] overflow-auto rounded-lg border border-gray-700">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-950/95 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Field</th>
                    <th className="px-3 py-2 font-medium">Current (approved)</th>
                    <th className="px-3 py-2 font-medium">Proposed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {fieldRows.map((field) => (
                    <tr
                      key={field.key}
                      className={field.changed ? 'bg-amber-950/20' : 'bg-gray-900/30'}
                    >
                      <td className="px-3 py-2 align-top font-medium text-gray-200">
                        <div className="flex items-center gap-2">
                          <span>{field.label}</span>
                          {field.changed && (
                            <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                              Changed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-pre-wrap text-gray-400">
                        {field.currentDisplay}
                      </td>
                      <td className={`px-3 py-2 align-top whitespace-pre-wrap ${field.changed ? 'text-amber-200' : 'text-gray-300'}`}>
                        {field.afterApprovalDisplay}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div>
          <label htmlFor="authoriser-justification" className="mb-1 block text-sm font-medium text-gray-200">
            Authoriser justification
            <span className="text-red-400"> *</span>
          </label>
          <textarea
            id="authoriser-justification"
            className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            placeholder={approve
              ? 'Explain why you are approving this submission…'
              : 'Explain why you are rejecting this submission…'}
            rows={4}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || loading || !reason.trim() || !record}
          className={`rounded px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 ${approve ? 'bg-green-700 hover:bg-green-600' : 'bg-red-700 hover:bg-red-600'}`}
        >
          {submitting ? 'Saving…' : approve ? 'Approve' : 'Reject'}
        </button>
      </div>
    </AdminModal>
  )
}
