import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  approveRefund,
  cancelRefund,
  fetchInvoices,
  fetchRefundById,
  formatCurrency,
  formatDate,
  notifyEmailEvent,
  PermissionGate,
  processRefund,
  rejectRefund,
  updateRefund,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import {
  daysRemainingForRefund,
  daysSincePaid,
  refundWindowBadgeClass,
} from '../utils/refundEligibility.js'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const statusVariant = (status) => {
  if (status === 'approved' || status === 'processed') return 'active'
  if (status === 'pending') return 'pending_activation'
  if (status === 'rejected' || status === 'cancelled') return 'suspended'
  return 'content_admin'
}

function RefundTimeline({ refund }) {
  const steps = useMemo(() => {
    if (!refund) return []
    const items = [{ key: 'created', label: 'Request created', at: refund.created_at, state: 'done' }]

    if (refund.status === 'cancelled') {
      items.push({ key: 'cancelled', label: 'Cancelled', at: refund.updated_at, state: 'done' })
      return items
    }
    if (refund.status === 'rejected') {
      items.push({ key: 'rejected', label: 'Rejected', at: refund.updated_at, state: 'done' })
      return items
    }
    if (refund.status === 'pending') {
      items.push({ key: 'pending', label: 'Awaiting approval', at: null, state: 'current' })
      return items
    }
    items.push({ key: 'approved', label: 'Approved', at: refund.updated_at, state: 'done' })
    if (refund.status === 'processed') {
      items.push({ key: 'processed', label: 'Payment issued', at: refund.processed_at, state: 'done' })
    } else {
      items.push({ key: 'process', label: 'Awaiting processing', at: null, state: 'current' })
    }
    return items
  }, [refund])

  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                step.state === 'done'
                  ? 'border-green-600 bg-green-900/40 text-green-200'
                  : step.state === 'current'
                    ? 'border-blue-600 bg-blue-900/40 text-blue-200'
                    : 'border-gray-600 bg-gray-800 text-gray-400'
              }`}
            >
              {index + 1}
            </span>
            {index < steps.length - 1 && <span className="mt-1 h-full min-h-[1.5rem] w-px bg-gray-700" />}
          </div>
          <div className="pb-2 pt-1">
            <p className="text-sm font-medium text-gray-100">{step.label}</p>
            {step.at && <p className="text-xs text-gray-500">{formatDate(step.at)}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function RefundDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const refundId = searchParams.get('id')
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [loading, setLoading] = useState(true)
  const [refund, setRefund] = useState(null)
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ amount: '', reason: '' })

  const loadDetail = async () => {
    if (!refundId) {
      setError('Refund ID is required.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [refundRes, invoicesRes] = await Promise.all([
      fetchRefundById(refundId),
      fetchInvoices(),
    ])
    if (refundRes.error || !refundRes.data) {
      setError(toErrorMessage(refundRes.error, 'Refund not found.'))
      setLoading(false)
      return
    }
    setRefund(refundRes.data)
    const matchedInvoice = (invoicesRes.data || []).find((row) => row.id === refundRes.data.invoice_id) || null
    setInvoice(matchedInvoice)
    setLoading(false)
  }

  useEffect(() => { loadDetail() }, [refundId])

  const openEdit = () => {
    if (!refund) return
    setEditForm({
      amount: String(refund.amount ?? ''),
      reason: refund.reason || '',
    })
    setShowEdit(true)
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!refund) return
    const amount = Number.parseFloat(editForm.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Amount must be a positive number.')
      return
    }
    if (!editForm.reason.trim()) {
      showError('Reason is required.')
      return
    }
    setBusy(true)
    const { error: updateError } = await updateRefund(refund.id, {
      amount,
      reason: editForm.reason.trim(),
    })
    setBusy(false)
    if (updateError) {
      showError(toErrorMessage(updateError, 'Failed to update refund.'))
      return
    }
    showSuccess('Refund updated.')
    setShowEdit(false)
    await loadDetail()
  }

  const runAction = (options) => {
    confirm({
      ...options,
      onConfirm: async () => {
        setBusy(true)
        const { error: actionError } = await options.action()
        setBusy(false)
        if (actionError) {
          showError(toErrorMessage(actionError, options.errorMessage))
          return
        }
        showSuccess(options.successMessage)
        if (options.emailEvent && refund?.customer_email) {
          await notifyEmailEvent(options.emailEvent, refund.customer_email, {
            first_name: refund.customer_name?.split(' ')[0] || 'Customer',
            amount: String(refund.amount ?? ''),
            currency: refund.currency || '$',
            refund_id: refund.id,
            rejection_reason: 'See support for details',
            support_url: 'https://projectnidus.com/support',
          })
        }
        await loadDetail()
      },
    })
  }

  const daysLeft = invoice?.paid_at ? daysRemainingForRefund(invoice.paid_at) : null
  const daysSince = invoice?.paid_at ? daysSincePaid(invoice.paid_at) : null

  if (loading) return <LoadingState message="Loading refund detail..." />

  if (error || !refund) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="Refund unavailable" description={error || 'Refund not found.'} />
        <button type="button" onClick={() => navigate('/subscriptions/refunds')} className="mt-4 text-sm text-blue-400 hover:text-blue-300">
          Back to refunds
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate('/subscriptions/refunds')} className="mb-2 text-sm text-gray-500 hover:text-gray-300">
            ← Back to refunds
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-100">Refund Detail</h1>
            <AdminBadge label={refund.status} variant={statusVariant(refund.status)} />
          </div>
          <p className="mt-1 font-mono text-xs text-gray-500">{refund.id}</p>
          <p className="mt-1 text-sm text-gray-500">Created {formatDate(refund.created_at)}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {refund.status === 'pending' && (
            <>
              <PermissionGate permission="refund:update">
                <button type="button" disabled={busy} onClick={openEdit} className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-60">
                  Edit
                </button>
              </PermissionGate>
              <PermissionGate permission="refund:cancel">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction({
                    title: 'Cancel refund?',
                    message: 'This pending refund request will be cancelled.',
                    confirmLabel: 'Cancel Refund',
                    danger: true,
                    action: () => cancelRefund(refund.id),
                    successMessage: 'Refund cancelled.',
                    errorMessage: 'Failed to cancel refund.',
                  })}
                  className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-60"
                >
                  Cancel
                </button>
              </PermissionGate>
              <PermissionGate permission="refund:approve">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction({
                    title: 'Approve refund?',
                    message: `Approve ${formatCurrency(refund.amount, refund.currency)} refund.`,
                    confirmLabel: 'Approve',
                    action: () => approveRefund(refund.id),
                    emailEvent: 'refund_approved',
                    successMessage: 'Refund approved.',
                    errorMessage: 'Failed to approve refund.',
                  })}
                  className="rounded border border-green-700 bg-green-900/30 px-3 py-1.5 text-sm text-green-200 hover:bg-green-900/50 disabled:opacity-60"
                >
                  Approve
                </button>
              </PermissionGate>
              <PermissionGate permission="refund:approve">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runAction({
                    title: 'Reject refund?',
                    message: 'This refund request will be marked as rejected.',
                    confirmLabel: 'Reject',
                    danger: true,
                    action: () => rejectRefund(refund.id),
                    emailEvent: 'refund_rejected',
                    successMessage: 'Refund rejected.',
                    errorMessage: 'Failed to reject refund.',
                  })}
                  className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-sm text-red-200 hover:bg-red-900/50 disabled:opacity-60"
                >
                  Reject
                </button>
              </PermissionGate>
            </>
          )}
          {refund.status === 'approved' && (
            <PermissionGate permission="refund:process">
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction({
                  title: 'Process refund?',
                  message: 'Mark this refund as processed (payment issued).',
                  confirmLabel: 'Process',
                  action: () => processRefund(refund.id),
                  successMessage: 'Refund processed.',
                  errorMessage: 'Failed to process refund.',
                })}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60"
              >
                Process
              </button>
            </PermissionGate>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Invoice</h2>
          {invoice ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Invoice number</dt>
                <dd className="font-medium text-gray-100">{invoice.invoice_number || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Total</dt>
                <dd className="text-gray-100">{formatCurrency(invoice.total, invoice.currency)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Status</dt>
                <dd><AdminBadge label={invoice.status} variant={statusVariant(invoice.status)} /></dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Paid date</dt>
                <dd className="text-gray-100">{formatDate(invoice.paid_at)}</dd>
              </div>
              {daysSince != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Days since payment</dt>
                  <dd className="text-gray-100">{daysSince}</dd>
                </div>
              )}
              {daysLeft != null && (
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Refund window</dt>
                  <dd className={refundWindowBadgeClass(daysLeft)}>
                    {daysLeft === 0 ? 'Window closed' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="mt-4 text-sm text-gray-500">Invoice not found.</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Refund Info</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Amount</dt>
              <dd className="font-medium text-gray-100">{formatCurrency(refund.amount, refund.currency)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Reason</dt>
              <dd className="mt-1 whitespace-pre-wrap text-gray-100">{refund.reason}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Payment transaction</dt>
              <dd className="font-mono text-xs text-gray-300">{refund.payment_transaction_id || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Processed</dt>
              <dd className="text-gray-100">{formatDate(refund.processed_at)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Timeline</h2>
        <div className="mt-4 max-w-md">
          <RefundTimeline refund={refund} />
        </div>
      </section>

      <AdminModal open={showEdit} title="Edit Refund" onClose={() => setShowEdit(false)}>
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          <AdminField label="Amount" required>
            <input type="number" min={0} step="0.01" className={inputClass} value={editForm.amount} onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))} />
          </AdminField>
          <AdminField label="Reason" required>
            <textarea rows={4} className={inputClass} value={editForm.reason} onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))} />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowEdit(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={busy} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
