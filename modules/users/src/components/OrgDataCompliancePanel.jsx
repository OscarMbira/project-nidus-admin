/**
 * Monorepo v1358 Slice 2 (PRD D13, D14) — "Data & compliance" on Organisation detail.
 *   - Legal hold: place / lift (organisations.data.hold; reason required, audited). Blocks deletion, not exports.
 *   - Account Owner: transfer to a PMO Admin of this organisation (organisations.data.transfer; reason required,
 *     audited; both owners emailed). A small action dialog, not a record form (Admin rule 18 exclusion).
 *   - This organisation's export and deletion requests; deletion: open on the customer's behalf, approve / reject,
 *     cancel (organisations.data.approve; reason required, audited — Slice 3a, Admin SQL v266).
 * All data comes from the public.admin_organisation_* RPCs (Admin SQL v265, v266).
 */
import { useCallback, useEffect, useState } from 'react'
import {
  CANCELLABLE_DELETION_STATUSES,
  ORGANISATION_DATA_KIND_LABELS,
  ORGANISATION_DATA_STATUS_LABELS,
  PermissionGate,
  cancelOrganisationDeletion,
  decideOrganisationDeletion,
  fetchOrganisationDataOverview,
  openOrganisationDeletion,
  formatDataSize,
  formatDate,
  setOrganisationLegalHold,
  transferOrganisationOwner,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminFieldLabelWithHelp,
  AdminModal,
  AdminTable,
  EmptyState,
  SelectField,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const CARD = 'rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900'
const LABEL = 'text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400'
const BUTTON = 'rounded border px-3 py-1.5 text-xs font-medium disabled:opacity-50'

export default function OrgDataCompliancePanel({ accountId, accountName, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [newOwner, setNewOwner] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const load = useCallback(() => fetchOrganisationDataOverview(accountId).then((res) => {
    setData(res.data)
    setError(res.error)
  }), [accountId])

  useEffect(() => { if (accountId) load() }, [accountId, load])

  const toggleHold = () => {
    const placing = !data?.legal_hold
    confirm({
      title: placing ? `Place ${accountName || 'this organisation'} on legal hold?` : `Lift the legal hold on ${accountName || 'this organisation'}?`,
      message: placing
        ? 'While the hold is on, the organisation cannot be deleted: a deletion cannot be approved, and one already counting down will not delete until the hold is lifted. Exports still work. The organisation is not told.'
        : 'Deletion requests can be approved again, and a deletion already counting down continues on its date.',
      confirmLabel: placing ? 'Place hold' : 'Lift hold',
      danger: !placing,
      requireReason: true,
      reasonLabel: 'Reason (required) — for example a dispute or a regulator request',
      onConfirm: async (why) => {
        const { error: err } = await setOrganisationLegalHold(accountId, placing, why)
        if (err) { showError(err); throw new Error(err) }
        showSuccess(placing ? 'Legal hold placed.' : 'Legal hold lifted.')
        await load()
        onChanged?.()
      },
    })
  }

  // Deletion (Slice 3a): every action needs a reason and is audited; approval still needs the owner's email confirmation.
  const deletionAction = ({ title, message, confirmLabel, danger, run, done }) => confirm({
    title, message, confirmLabel, danger, requireReason: true,
    reasonLabel: 'Reason (required)',
    onConfirm: async (why) => {
      const { error: err } = await run(why)
      if (err) { showError(err); throw new Error(err) }
      showSuccess(done)
      await load()
      onChanged?.()
    },
  })
  const openDeletion = () => deletionAction({
    title: `Open a deletion request for ${accountName || 'this organisation'}?`,
    message: 'Use this when the customer asked support to delete the organisation. It still needs approval, and the Account Owner must confirm by the emailed link before anything is locked.',
    confirmLabel: 'Open request',
    run: (why) => openOrganisationDeletion(accountId, why),
    done: 'Deletion request opened. It is waiting for approval.',
  })
  const decide = (row, approve) => deletionAction({
    title: approve ? `Approve deletion request ${row.reference || ''}?` : `Reject deletion request ${row.reference || ''}?`,
    message: approve
      ? 'The Account Owner is emailed a confirmation link valid for 7 days. Only when they confirm is the organisation locked; it is deleted permanently 30 days later.'
      : 'The Account Owner is told it was not approved, with your reason. Nothing is changed.',
    confirmLabel: approve ? 'Approve' : 'Reject',
    danger: approve,
    run: (why) => decideOrganisationDeletion(row.id, approve, why),
    done: approve ? 'Approved. The Account Owner has been emailed a confirmation link.' : 'Deletion request rejected.',
  })
  const cancelRequest = (row) => deletionAction({
    title: `Cancel deletion request ${row.reference || ''}?`,
    message: row.status === 'locked'
      ? 'The organisation is unlocked and its integrations switched back on. A cancelled subscription is not restarted.'
      : 'The request is closed and nothing is changed.',
    confirmLabel: 'Cancel the deletion',
    run: (why) => cancelOrganisationDeletion(row.id, why),
    done: 'Deletion cancelled.',
  })

  const openTransfer = () => { setNewOwner(''); setReason(''); setTransferOpen(true) }

  const doTransfer = async () => {
    if (!newOwner || !reason.trim()) { showError('Choose the new owner and give a reason.'); return }
    setSaving(true)
    const { error: err } = await transferOrganisationOwner(accountId, newOwner, reason.trim())
    setSaving(false)
    if (err) { showError(err); return }
    setTransferOpen(false)
    showSuccess('Ownership transferred. Both owners have been told by email.')
    await load()
    onChanged?.()
  }

  if (error) return <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">{error}</div>
  if (!data) return null

  const openDeletionRequest = (data.requests || []).some((r) => r.kind === 'deletion' && [...CANCELLABLE_DELETION_STATUSES, 'deleting'].includes(r.status))
  const candidates = (data.candidates || []).map((c) => ({ value: c.user_id, label: `${c.name}${c.email && c.email !== c.name ? ` (${c.email})` : ''}` }))

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Data &amp; compliance</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <AdminFieldLabelWithHelp as="p" helpKey="admin.accounts.legal_hold" className={LABEL}>Legal hold</AdminFieldLabelWithHelp>
              <div className="mt-2">
                <AdminBadge label={data.legal_hold ? 'On hold' : 'No hold'} variant={data.legal_hold ? 'suspended' : 'active'} />
              </div>
            </div>
            <PermissionGate permission="organisations.data.hold">
              <button
                type="button"
                onClick={toggleHold}
                className={`${BUTTON} ${data.legal_hold
                  ? 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'
                  : 'border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200 dark:hover:bg-amber-900/70'}`}
              >
                {data.legal_hold ? 'Lift hold' : 'Place hold'}
              </button>
            </PermissionGate>
          </div>
          {data.legal_hold && (
            <dl className="mt-3 space-y-1 text-sm">
              <div className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Reason: </span>{data.legal_hold_reason || '—'}</div>
              <div className="text-gray-700 dark:text-gray-300"><span className="text-gray-500 dark:text-gray-400">Since: </span>{formatDate(data.legal_hold_since)}{data.legal_hold_by_email ? ` by ${data.legal_hold_by_email}` : ''}</div>
            </dl>
          )}
        </div>

        <div className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={LABEL}>Account Owner</p>
              <p className="mt-2 text-sm text-gray-900 dark:text-gray-100">{data.owner?.name || '—'}</p>
              {data.owner?.email && data.owner.email !== data.owner.name && <p className="text-xs text-gray-500 dark:text-gray-400">{data.owner.email}</p>}
            </div>
            <PermissionGate permission="organisations.data.transfer">
              <button
                type="button"
                onClick={openTransfer}
                disabled={!candidates.length}
                title={candidates.length ? undefined : 'No PMO Admin in this organisation can take over'}
                className={`${BUTTON} border-blue-500 bg-blue-50 text-blue-800 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/70`}
              >
                Transfer ownership
              </button>
            </PermissionGate>
          </div>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Use this when the owner has left. Only PMO Admins who work in this organisation can take over.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200">Export and deletion requests</h3>
          <PermissionGate permission="organisations.data.approve">
            <button
              type="button"
              onClick={openDeletion}
              disabled={openDeletionRequest}
              title={openDeletionRequest ? 'A deletion request is already open' : undefined}
              className={`${BUTTON} border-red-400 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30`}
            >
              Open deletion request
            </button>
          </PermissionGate>
        </div>
        {data.locked_at && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            Locked since {formatDate(data.locked_at)}. Deleted permanently on {formatDate(data.deletion_due_at)}{data.legal_hold ? ' — paused while the legal hold is on' : ''}.
          </p>
        )}
        {(data.requests || []).length === 0 ? (
          <EmptyState title="No requests" description="This organisation has not asked for an export or a deletion." />
        ) : (
          <AdminTable
            rows={data.requests}
            pageSize={10}
            defaultSortKey="created_at"
            defaultSortDir="desc"
            columns={[
              { key: 'reference', label: 'Reference', render: (r) => <span className="font-mono text-blue-600 dark:text-blue-400">{r.reference || '—'}</span> },
              { key: 'kind', label: 'Type', render: (r) => ORGANISATION_DATA_KIND_LABELS[r.kind] || r.kind },
              { key: 'status', label: 'Status', render: (r) => <span title={r.error || undefined}>{ORGANISATION_DATA_STATUS_LABELS[r.status] || r.status}</span> },
              { key: 'created_at', label: 'Requested', render: (r) => formatDate(r.created_at) },
              { key: 'byte_size', label: 'Size', render: (r) => formatDataSize(r.byte_size) },
              { key: 'reason', label: <AdminFieldLabelWithHelp as="span" helpKey="admin.organisation_data_requests.deletion_reason">Reason</AdminFieldLabelWithHelp>, render: (r) => r.reason || '—' },
              {
                key: 'when',
                label: <AdminFieldLabelWithHelp as="span" helpKey="admin.organisation_data_requests.deletion_due_at">Due / available</AdminFieldLabelWithHelp>,
                sortable: false,
                render: (r) => (r.kind === 'deletion'
                  ? (r.deletion_due_at ? `Delete ${formatDate(r.deletion_due_at)}` : r.confirm_expires_at && r.status === 'awaiting_confirmation' ? `Confirm by ${formatDate(r.confirm_expires_at)}` : '—')
                  : (r.status === 'ready' ? formatDate(r.expires_at) : '—')),
              },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (r.kind !== 'deletion' ? null : (
                  <PermissionGate permission="organisations.data.approve">
                    <div className="flex flex-wrap gap-1">
                      {r.status === 'pending_approval' && (
                        <>
                          <button type="button" onClick={() => decide(r, true)} disabled={data.legal_hold}
                            title={data.legal_hold ? 'Lift the legal hold first' : undefined}
                            className={`${BUTTON} border-red-400 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30`}>Approve</button>
                          <button type="button" onClick={() => decide(r, false)} className={`${BUTTON} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}>Reject</button>
                        </>
                      )}
                      {CANCELLABLE_DELETION_STATUSES.includes(r.status) && (
                        <button type="button" onClick={() => cancelRequest(r)} className={`${BUTTON} border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800`}>Cancel</button>
                      )}
                    </div>
                  </PermissionGate>
                )),
              },
            ]}
          />
        )}
      </div>

      <AdminModal
        open={transferOpen}
        title={`Transfer ownership of ${accountName || 'this organisation'}`}
        onClose={() => setTransferOpen(false)}
        onConfirm={saving ? undefined : doTransfer}
        confirmLabel={saving ? 'Transferring…' : 'Transfer ownership'}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            The new owner gets the Account Owner role and can manage billing, the subscription and data exports. Billing delegates are
            removed, as in a normal transfer. Both the current and the new owner are emailed.
          </p>
          <div>
            <AdminFieldLabelWithHelp helpKey="admin.accounts.new_owner" htmlFor="org-new-owner" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              New Account Owner
            </AdminFieldLabelWithHelp>
            <SelectField id="org-new-owner" options={candidates} value={newOwner} onChange={setNewOwner} placeholder="Choose a PMO Admin…" />
          </div>
          <div>
            <AdminFieldLabelWithHelp helpKey="admin.accounts.transfer_reason" htmlFor="org-transfer-reason" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Reason (required)
            </AdminFieldLabelWithHelp>
            <textarea
              id="org-transfer-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: the previous owner left; confirmed by the Head of Finance on a support ticket"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
        </div>
      </AdminModal>
      {modal}
    </section>
  )
}
