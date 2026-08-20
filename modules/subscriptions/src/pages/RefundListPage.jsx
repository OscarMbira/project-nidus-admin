import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  approveRefund,
  cancelRefund,
  createRefund,
  fetchInvoices,
  fetchRefunds,
  formatCurrency,
  formatDate,
  navId,
  PermissionGate,
  processRefund,
  rejectRefund,
  updateRefund,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'
import {
  daysRemainingForRefund,
  isRefundableInvoice,
  refundWindowBadgeClass,
} from '../utils/refundEligibility.js'

const STATUS_FILTERS = ['all', 'pending', 'approved', 'processed', 'rejected', 'cancelled']

const EMPTY_FORM = {
  invoice_id: '',
  amount: '',
  currency: 'USD',
  reason: '',
  payment_transaction_id: '',
}

const EMPTY_EDIT_FORM = {
  amount: '',
  reason: '',
}

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

const invoiceStatusVariant = (status) => {
  if (status === 'paid') return 'active'
  if (status === 'draft') return 'pending_activation'
  if (status === 'issued' || status === 'overdue') return 'system_admin'
  if (status === 'cancelled' || status === 'refunded') return 'inactive'
  return 'content_admin'
}

const actionClass = {
  neutral: 'rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60',
  edit: 'rounded border border-amber-700 bg-amber-900/30 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900/50 disabled:opacity-60',
  cancel: 'rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60',
  approve: 'rounded border border-green-700 bg-green-900/30 px-2.5 py-1 text-xs text-green-200 hover:bg-green-900/50 disabled:opacity-60',
  reject: 'rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60',
  process: 'rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60',
}

export default function RefundListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [invoices, setInvoices] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingRefund, setEditingRefund] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [viewingRefund, setViewingRefund] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [viewTab, setViewTab] = useState('details')

  const invoiceMap = useMemo(() => {
    const map = new Map()
    invoices.forEach((invoice) => map.set(invoice.id, invoice))
    return map
  }, [invoices])

  const refundIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('admin.refunds', refundIds)

  const refundableInvoices = useMemo(
    () => invoices.filter(isRefundableInvoice),
    [invoices],
  )

  const selectedInvoice = createForm.invoice_id ? invoiceMap.get(createForm.invoice_id) : null
  const selectedDaysLeft = selectedInvoice?.paid_at ? daysRemainingForRefund(selectedInvoice.paid_at) : null

  const loadData = async () => {
    setLoading(true)
    const [refundsRes, invoicesRes] = await Promise.all([
      fetchRefunds(),
      fetchInvoices(),
    ])
    if (refundsRes.error) {
      showError(toErrorMessage(refundsRes.error, 'Failed to load refunds.'))
      setLoading(false)
      return
    }
    if (invoicesRes.error) {
      showError(toErrorMessage(invoicesRes.error, 'Failed to load invoices.'))
      setLoading(false)
      return
    }
    setRows(refundsRes.data || [])
    setInvoices(invoicesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      const invoice = invoiceMap.get(row.invoice_id)
      if (!term) return true
      return [row.id, row.invoice_id, invoice?.invoice_number, row.reason, row.status, row.currency]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, statusFilter, invoiceMap])

  const handleInvoiceChange = (invoiceId) => {
    const invoice = invoiceMap.get(invoiceId)
    setCreateForm((prev) => ({
      ...prev,
      invoice_id: invoiceId,
      currency: invoice?.currency || prev.currency,
      amount: invoice?.total != null ? String(invoice.total) : prev.amount,
    }))
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.invoice_id || !createForm.amount.trim() || !createForm.reason.trim()) {
      showError('Invoice, amount, and reason are required.')
      return
    }
    const amount = Number.parseFloat(createForm.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Amount must be a positive number.')
      return
    }
    setSaving(true)
    const { error } = await createRefund({
      invoice_id: createForm.invoice_id,
      amount,
      currency: createForm.currency,
      reason: createForm.reason.trim(),
      payment_transaction_id: createForm.payment_transaction_id.trim() || null,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create refund.'))
      return
    }
    showSuccess('Refund request created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const openEdit = (refund) => {
    setEditingRefund(refund)
    setEditForm({
      amount: String(refund.amount ?? ''),
      reason: refund.reason || '',
    })
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingRefund) return
    const amount = Number.parseFloat(editForm.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Amount must be a positive number.')
      return
    }
    if (!editForm.reason.trim()) {
      showError('Reason is required.')
      return
    }
    setSaving(true)
    const { error } = await updateRefund(editingRefund.id, {
      amount,
      reason: editForm.reason.trim(),
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to update refund.'))
      return
    }
    showSuccess('Refund updated.')
    setEditingRefund(null)
    await loadData()
  }

  const runConfirmAction = ({ refund, title, message, confirmLabel, danger, action, successMessage, errorMessage }) => {
    confirm({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: async () => {
        setBusyId(refund.id)
        const { error } = await action()
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, errorMessage))
          return
        }
        showSuccess(successMessage)
        await loadData()
      },
    })
  }

  const viewingInvoice = viewingRefund ? invoiceMap.get(viewingRefund.invoice_id) : null
  const viewingDaysLeft = viewingInvoice?.paid_at ? daysRemainingForRefund(viewingInvoice.paid_at) : null

  const renderRefundActions = (refund, invoice) => (
    <div className="flex flex-wrap justify-end gap-2">
      <AdminIconActionButton variant="view" label="View" onClick={() => { setViewingRefund(refund); setViewTab('details') }} />
      <button
        type="button"
        onClick={() => navigate(`/subscriptions/refund-detail?id=${navId(displayIdMap, refund.id)}`)}
        className={actionClass.neutral}
      >
        Details
      </button>
      {refund.status === 'pending' && (
        <>
          <PermissionGate permission="refund:update">
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(refund)} disabled={busyId === refund.id} />
          </PermissionGate>
          <PermissionGate permission="refund:cancel">
            <button
              type="button"
              disabled={busyId === refund.id}
              onClick={() => runConfirmAction({
                refund,
                title: 'Cancel refund?',
                message: 'This pending refund request will be cancelled.',
                confirmLabel: 'Cancel Refund',
                danger: true,
                action: () => cancelRefund(refund.id),
                successMessage: 'Refund cancelled.',
                errorMessage: 'Failed to cancel refund.',
              })}
              className={actionClass.cancel}
            >
              Cancel
            </button>
          </PermissionGate>
          <PermissionGate permission="refund:approve">
            <button
              type="button"
              disabled={busyId === refund.id}
              onClick={() => runConfirmAction({
                refund,
                title: 'Approve refund?',
                message: `Approve ${formatCurrency(refund.amount, refund.currency)} refund.`,
                confirmLabel: 'Approve',
                action: () => approveRefund(refund.id),
                successMessage: 'Refund approved.',
                errorMessage: 'Failed to approve refund.',
              })}
              className={actionClass.approve}
            >
              Approve
            </button>
          </PermissionGate>
          <PermissionGate permission="refund:approve">
            <button
              type="button"
              disabled={busyId === refund.id}
              onClick={() => runConfirmAction({
                refund,
                title: 'Reject refund?',
                message: 'This refund request will be marked as rejected.',
                confirmLabel: 'Reject',
                danger: true,
                action: () => rejectRefund(refund.id),
                successMessage: 'Refund rejected.',
                errorMessage: 'Failed to reject refund.',
              })}
              className={actionClass.reject}
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
            disabled={busyId === refund.id}
            onClick={() => runConfirmAction({
              refund,
              title: 'Process refund?',
              message: 'Mark this refund as processed (payment issued).',
              confirmLabel: 'Process',
              action: () => processRefund(refund.id),
              successMessage: 'Refund processed.',
              errorMessage: 'Failed to process refund.',
            })}
            className={actionClass.process}
          >
            Process
          </button>
        </PermissionGate>
      )}
      {invoice?.invoice_number && (
        <button
          type="button"
          onClick={() => navigate('/subscriptions/invoices')}
          className={actionClass.neutral}
          title={`Go to invoices for ${invoice.invoice_number}`}
        >
          Invoice
        </button>
      )}
    </div>
  )

  if (loading) return <LoadingState message="Loading refunds..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Refunds</h1>
          <p className="text-sm text-gray-500">Review refund requests and manage approval workflow.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search invoice, reason..." />
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}
          </select>
          <PermissionGate permission="refund:create">
            <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
              New Refund
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No refunds found" description="Create a refund request or adjust your filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Processed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((refund) => {
                const invoice = invoiceMap.get(refund.invoice_id)
                return (
                  <tr key={refund.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <div className="font-medium">{invoice?.invoice_number || '—'}</div>
                      <div className="font-mono text-xs text-gray-500">{refund.invoice_id}</div>
                    </td>
                    <td className="px-4 py-3">{formatCurrency(refund.amount, refund.currency)}</td>
                    <td className="max-w-xs truncate px-4 py-3" title={refund.reason}>{refund.reason}</td>
                    <td className="px-4 py-3">
                      <AdminBadge label={refund.status} variant={statusVariant(refund.status)} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(refund.created_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(refund.processed_at)}</td>
                    <td className="px-4 py-3">
                      {renderRefundActions(refund, invoice)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal
        open={Boolean(viewingRefund)}
        title={viewingRefund ? `Refund — ${viewingInvoice?.invoice_number || viewingRefund.id}` : 'Refund'}
        onClose={() => setViewingRefund(null)}
      >
        {viewingRefund && (
          <div className="mt-2 space-y-4 text-sm text-gray-200">
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge label={viewingRefund.status} variant={statusVariant(viewingRefund.status)} />
              <span className="font-medium">{formatCurrency(viewingRefund.amount, viewingRefund.currency)}</span>
            </div>

            <DetailAuditTabList activeTab={viewTab} onChange={setViewTab} />

            {viewTab === 'audit' && (
              <AuditDetailsPanel description="Who created or changed this refund, and how it is classified.">
                <AuditCard title="Identity" description="How this refund is identified.">
                  <AuditField label="Refund ID" value={viewingRefund.id} />
                  <AuditField label="Payment transaction" value={viewingRefund.payment_transaction_id} />
                </AuditCard>
                <AuditCard title="Classification" description="Where this refund sits.">
                  <AuditField label="Status" value={viewingRefund.status} />
                  <AuditField label="Amount" value={formatCurrency(viewingRefund.amount, viewingRefund.currency)} />
                </AuditCard>
                <AuditCard title="Record history" description="When this refund was created and last changed.">
                  <AuditField label="Created by" value={viewingRefund.created_by || null} />
                  <AuditTimestampPair dateLabel="Created at" value={viewingRefund.created_at} />
                  <AuditField label="Updated by" value={viewingRefund.updated_by || null} />
                  <AuditTimestampPair dateLabel="Last updated" value={viewingRefund.updated_at} />
                </AuditCard>
              </AuditDetailsPanel>
            )}

            {viewTab === 'details' && (
            <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-gray-500">Refund ID</dt>
                <dd className="font-mono text-xs">{viewingRefund.id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Payment Transaction</dt>
                <dd className="font-mono text-xs">{viewingRefund.payment_transaction_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Created</dt>
                <dd>{formatDate(viewingRefund.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Updated</dt>
                <dd>{formatDate(viewingRefund.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Processed</dt>
                <dd>{formatDate(viewingRefund.processed_at)}</dd>
              </div>
            </dl>
            <div>
              <p className="text-xs uppercase text-gray-500">Reason</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-300">{viewingRefund.reason}</p>
            </div>
            {viewingInvoice && (
              <div className="rounded border border-gray-700 bg-gray-950 p-3">
                <p className="text-xs uppercase text-gray-500">Linked Invoice</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-gray-500">Number</dt>
                    <dd className="font-medium">{viewingInvoice.invoice_number}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Status</dt>
                    <dd><AdminBadge label={viewingInvoice.status} variant={invoiceStatusVariant(viewingInvoice.status)} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Total</dt>
                    <dd>{formatCurrency(viewingInvoice.total, viewingInvoice.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-gray-500">Paid</dt>
                    <dd>{formatDate(viewingInvoice.paid_at)}</dd>
                  </div>
                </dl>
                {viewingDaysLeft != null && (
                  <p className={`mt-2 text-xs ${refundWindowBadgeClass(viewingDaysLeft)}`}>
                    Refund window: {viewingDaysLeft === 0 ? 'closed' : `${viewingDaysLeft} day(s) remaining`}
                  </p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate('/subscriptions/invoices')}
                className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Go to Invoices
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewingRefund(null)
                  navigate(`/subscriptions/refund-detail?id=${navId(displayIdMap, viewingRefund.id)}`)
                }}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                Open Full Detail
              </button>
            </div>
            </>
            )}
          </div>
        )}
      </AdminModal>

      <AdminModal open={showCreate} title="Create Refund Request" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          <AdminField label="Invoice" required>
            <select className={inputClass} value={createForm.invoice_id} onChange={(e) => handleInvoiceChange(e.target.value)}>
              <option value="">Select invoice...</option>
              {refundableInvoices.map((invoice) => {
                const daysLeft = daysRemainingForRefund(invoice.paid_at)
                return (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number} — {formatCurrency(invoice.total, invoice.currency)} ({daysLeft} days left)
                  </option>
                )
              })}
            </select>
            {!refundableInvoices.length && (
              <p className="mt-1 text-xs text-gray-500">No paid invoices within the 30-day refund window.</p>
            )}
            {selectedDaysLeft != null && (
              <p className={`mt-1 text-xs ${refundWindowBadgeClass(selectedDaysLeft)}`}>
                {selectedDaysLeft === 0 ? 'Refund window has closed for this invoice.' : `${selectedDaysLeft} day${selectedDaysLeft === 1 ? '' : 's'} left to refund`}
              </p>
            )}
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Amount" required>
              <input type="number" min={0} step="0.01" className={inputClass} value={createForm.amount} onChange={(e) => setCreateForm((prev) => ({ ...prev, amount: e.target.value }))} />
            </AdminField>
            <AdminField label="Currency" required>
              <input className={inputClass} value={createForm.currency} onChange={(e) => setCreateForm((prev) => ({ ...prev, currency: e.target.value.toUpperCase() }))} maxLength={3} />
            </AdminField>
          </div>
          <AdminField label="Reason" required>
            <textarea rows={3} className={inputClass} value={createForm.reason} onChange={(e) => setCreateForm((prev) => ({ ...prev, reason: e.target.value }))} />
          </AdminField>
          <AdminField label="Payment Transaction ID">
            <input className={inputClass} value={createForm.payment_transaction_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, payment_transaction_id: e.target.value }))} />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving || !refundableInvoices.length} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingRefund)} title={`Edit Refund — ${invoiceMap.get(editingRefund?.invoice_id)?.invoice_number || editingRefund?.id || ''}`} onClose={() => setEditingRefund(null)}>
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          <AdminField label="Amount" required>
            <input type="number" min={0} step="0.01" className={inputClass} value={editForm.amount} onChange={(e) => setEditForm((prev) => ({ ...prev, amount: e.target.value }))} />
          </AdminField>
          <AdminField label="Reason" required>
            <textarea rows={3} className={inputClass} value={editForm.reason} onChange={(e) => setEditForm((prev) => ({ ...prev, reason: e.target.value }))} />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingRefund(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
