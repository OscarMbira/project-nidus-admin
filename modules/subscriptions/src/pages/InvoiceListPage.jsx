import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  cancelInvoice,
  createInvoice,
  createRefund,
  fetchActiveCurrencies,
  fetchInvoices,
  fetchRefunds,
  formatCurrency,
  formatDate,
  issueInvoice,
  markInvoicePaid,
  navId,
  PermissionGate,
  updateInvoice,
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
  SelectField,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'
import InvoiceLineItemsEditor from '../components/InvoiceLineItemsEditor.jsx'
import {
  daysRemainingForRefund,
  isRefundableInvoice,
  refundWindowBadgeClass,
} from '../utils/refundEligibility.js'
import {
  createEmptyLineItem,
  normalizeLineItemsFromApi,
  serializeLineItemsForApi,
  sumLineItems,
  validateLineItems,
} from '../utils/invoiceLineItems.js'

const STATUS_FILTERS = ['all', 'draft', 'issued', 'paid', 'overdue', 'cancelled', 'refunded']
const SYSTEM_FILTERS = ['all', 'platform', 'simulator']

const EMPTY_FORM = {
  user_id: '',
  target_system: 'platform',
  currency: 'USD',
  subtotal: '0',
  tax_amount: '0',
  tax_rate_applied: '',
  subscription_id: '',
  due_at: '',
  notes: '',
  lineItems: [{ ...createEmptyLineItem(), description: 'Subscription' }],
}

const EMPTY_REFUND_FORM = {
  amount: '',
  currency: 'USD',
  reason: '',
  payment_transaction_id: '',
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const toDatetimeLocalValue = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const statusVariant = (status) => {
  if (status === 'paid') return 'active'
  if (status === 'draft') return 'pending_activation'
  if (status === 'issued' || status === 'overdue') return 'system_admin'
  if (status === 'cancelled' || status === 'refunded') return 'inactive'
  return 'content_admin'
}

const actionClass = {
  neutral: 'rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60',
  edit: 'rounded border border-amber-700 bg-amber-900/30 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900/50 disabled:opacity-60',
  issue: 'rounded border border-violet-700 bg-violet-900/30 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-60',
  paid: 'rounded border border-green-700 bg-green-900/30 px-2.5 py-1 text-xs text-green-200 hover:bg-green-900/50 disabled:opacity-60',
  cancel: 'rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60',
  refund: 'rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60',
}

export default function InvoiceListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [refunds, setRefunds] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [systemFilter, setSystemFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [viewingInvoice, setViewingInvoice] = useState(null)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [refundingInvoice, setRefundingInvoice] = useState(null)
  const [refundForm, setRefundForm] = useState(EMPTY_REFUND_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [viewTab, setViewTab] = useState('details')

  const refundIds = useMemo(() => refunds.map((r) => r.id).filter(Boolean), [refunds])
  const { displayIdMap: refundDisplayIdMap } = useDisplayIdMap('admin.refunds', refundIds)

  const refundsByInvoice = useMemo(() => {
    const map = new Map()
    refunds.forEach((refund) => {
      const list = map.get(refund.invoice_id) || []
      list.push(refund)
      map.set(refund.invoice_id, list)
    })
    return map
  }, [refunds])

  const loadData = async () => {
    setLoading(true)
    const [invoicesRes, currenciesRes, refundsRes] = await Promise.all([
      fetchInvoices(),
      fetchActiveCurrencies(),
      fetchRefunds(),
    ])
    if (invoicesRes.error) {
      showError(toErrorMessage(invoicesRes.error, 'Failed to load invoices.'))
      setLoading(false)
      return
    }
    setRows(invoicesRes.data || [])
    if (!refundsRes.error) setRefunds(refundsRes.data || [])
    if (!currenciesRes.error) {
      setCurrencies(currenciesRes.data || [])
      if (currenciesRes.data?.[0]?.currency_code) {
        setCreateForm((prev) => ({ ...prev, currency: prev.currency || currenciesRes.data[0].currency_code }))
      }
    }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (systemFilter !== 'all' && row.target_system !== systemFilter) return false
      if (!term) return true
      return [row.invoice_number, row.user_id, row.subscription_id, row.status, row.currency, row.notes]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, statusFilter, systemFilter])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.user_id.trim()) {
      showError('User ID is required.')
      return
    }
    const lineItemError = validateLineItems(createForm.lineItems)
    if (lineItemError) {
      showError(lineItemError)
      return
    }
    const lineItems = serializeLineItemsForApi(createForm.lineItems)
    const subtotal = sumLineItems(createForm.lineItems)
    const taxAmount = Number.parseFloat(createForm.tax_amount) || 0
    if (subtotal < 0) {
      showError('Subtotal must be non-negative.')
      return
    }
    setSaving(true)
    const { error } = await createInvoice({
      user_id: createForm.user_id.trim(),
      target_system: createForm.target_system,
      currency: createForm.currency,
      subtotal,
      tax_amount: taxAmount,
      total: subtotal + taxAmount,
      tax_rate_applied: createForm.tax_rate_applied ? Number.parseFloat(createForm.tax_rate_applied) : null,
      subscription_id: createForm.subscription_id.trim() || null,
      due_at: createForm.due_at ? new Date(createForm.due_at).toISOString() : null,
      line_items: lineItems,
      notes: createForm.notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create invoice.'))
      return
    }
    showSuccess('Invoice created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const openEdit = (invoice) => {
    const lineItems = normalizeLineItemsFromApi(invoice.line_items)
    setEditingInvoice(invoice)
    setEditForm({
      subtotal: String(sumLineItems(lineItems)),
      tax_amount: String(invoice.tax_amount ?? '0'),
      tax_rate_applied: invoice.tax_rate_applied != null ? String(invoice.tax_rate_applied) : '',
      due_at: toDatetimeLocalValue(invoice.due_at),
      lineItems,
      notes: invoice.notes || '',
    })
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingInvoice || !editForm) return
    const lineItemError = validateLineItems(editForm.lineItems)
    if (lineItemError) {
      showError(lineItemError)
      return
    }
    const lineItems = serializeLineItemsForApi(editForm.lineItems)
    const subtotal = sumLineItems(editForm.lineItems)
    const taxAmount = Number.parseFloat(editForm.tax_amount) || 0
    if (subtotal < 0) {
      showError('Subtotal must be non-negative.')
      return
    }
    setSaving(true)
    const { error } = await updateInvoice(editingInvoice.id, {
      subtotal,
      tax_amount: taxAmount,
      total: subtotal + taxAmount,
      tax_rate_applied: editForm.tax_rate_applied ? Number.parseFloat(editForm.tax_rate_applied) : null,
      due_at: editForm.due_at ? new Date(editForm.due_at).toISOString() : null,
      line_items: lineItems,
      notes: editForm.notes.trim() || null,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to update invoice.'))
      return
    }
    showSuccess('Invoice updated.')
    setEditingInvoice(null)
    setEditForm(null)
    await loadData()
  }

  const openRefund = (invoice) => {
    setRefundingInvoice(invoice)
    setRefundForm({
      amount: invoice.total != null ? String(invoice.total) : '',
      currency: invoice.currency || 'USD',
      reason: '',
      payment_transaction_id: invoice.payment_transaction_id || '',
    })
  }

  const handleRefundCreate = async (event) => {
    event.preventDefault()
    if (!refundingInvoice) return
    if (!refundForm.amount.trim() || !refundForm.reason.trim()) {
      showError('Amount and reason are required.')
      return
    }
    const amount = Number.parseFloat(refundForm.amount)
    if (Number.isNaN(amount) || amount <= 0) {
      showError('Amount must be a positive number.')
      return
    }
    setSaving(true)
    const { error } = await createRefund({
      invoice_id: refundingInvoice.id,
      amount,
      currency: refundForm.currency,
      reason: refundForm.reason.trim(),
      payment_transaction_id: refundForm.payment_transaction_id.trim() || null,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create refund.'))
      return
    }
    showSuccess('Refund request created.')
    setRefundingInvoice(null)
    setRefundForm(EMPTY_REFUND_FORM)
    await loadData()
  }

  const runConfirmAction = ({ invoice, title, message, confirmLabel, danger, action, successMessage, errorMessage }) => {
    confirm({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: async () => {
        setBusyId(invoice.id)
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

  const handleIssue = (invoice) => {
    runConfirmAction({
      invoice,
      title: `Issue ${invoice.invoice_number}?`,
      message: 'This will finalize the invoice and make it available for payment.',
      confirmLabel: 'Issue',
      action: () => issueInvoice(invoice.id),
      successMessage: 'Invoice issued.',
      errorMessage: 'Failed to issue invoice.',
    })
  }

  const handleMarkPaid = (invoice) => {
    runConfirmAction({
      invoice,
      title: `Mark ${invoice.invoice_number} as paid?`,
      message: 'Optionally link a payment transaction ID when recording payment.',
      confirmLabel: 'Mark Paid',
      action: () => markInvoicePaid(invoice.id, invoice.payment_transaction_id || null),
      successMessage: 'Invoice marked as paid.',
      errorMessage: 'Failed to mark invoice paid.',
    })
  }

  const handleCancel = (invoice) => {
    runConfirmAction({
      invoice,
      title: `Cancel ${invoice.invoice_number}?`,
      message: 'This invoice will be marked as cancelled and will no longer be billable.',
      confirmLabel: 'Cancel Invoice',
      danger: true,
      action: () => cancelInvoice(invoice.id),
      successMessage: 'Invoice cancelled.',
      errorMessage: 'Failed to cancel invoice.',
    })
  }

  const renderInvoiceActions = (invoice) => {
    const invoiceRefunds = refundsByInvoice.get(invoice.id) || []
    const canEdit = invoice.status === 'draft' || invoice.status === 'issued'
    const canCancel = ['draft', 'issued', 'overdue'].includes(invoice.status)
    const canRefund = isRefundableInvoice(invoice)
    const refundDaysLeft = invoice.paid_at ? daysRemainingForRefund(invoice.paid_at) : null

    return (
      <div className="flex flex-wrap justify-end gap-2">
        <AdminIconActionButton variant="view" label="View" onClick={() => { setViewingInvoice(invoice); setViewTab('details') }} />
        {canEdit && (
          <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(invoice)} disabled={busyId === invoice.id} />
        )}
        {invoice.status === 'draft' && (
          <button
            type="button"
            disabled={busyId === invoice.id}
            onClick={() => handleIssue(invoice)}
            className={actionClass.issue}
          >
            Issue
          </button>
        )}
        {(invoice.status === 'issued' || invoice.status === 'overdue') && (
          <button
            type="button"
            disabled={busyId === invoice.id}
            onClick={() => handleMarkPaid(invoice)}
            className={actionClass.paid}
          >
            Mark Paid
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={busyId === invoice.id}
            onClick={() => handleCancel(invoice)}
            className={actionClass.cancel}
          >
            Cancel
          </button>
        )}
        {canRefund && (
          <PermissionGate permission="refund:create">
            <button
              type="button"
              disabled={busyId === invoice.id}
              onClick={() => openRefund(invoice)}
              className={actionClass.refund}
              title={`${refundDaysLeft} day(s) left in refund window`}
            >
              Refund
            </button>
          </PermissionGate>
        )}
        {invoiceRefunds.length > 0 && (
          <button
            type="button"
            onClick={() => navigate(`/subscriptions/refund-detail?id=${navId(refundDisplayIdMap, invoiceRefunds[0].id)}`)}
            className={actionClass.neutral}
          >
            Refunds ({invoiceRefunds.length})
          </button>
        )}
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading invoices..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Invoices</h1>
          <p className="text-sm text-gray-500">Manage billing invoices, issue drafts, and record payments.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search number, user, status..." />
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((status) => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>)}
          </select>
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
            {SYSTEM_FILTERS.map((system) => <option key={system} value={system}>{system === 'all' ? 'All systems' : system}</option>)}
          </select>
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Invoice
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No invoices found" description="Create an invoice or adjust your filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((invoice) => (
                <tr key={invoice.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 font-mono text-xs">{invoice.user_id}</td>
                  <td className="px-4 py-3">{invoice.target_system}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={invoice.status} variant={statusVariant(invoice.status)} />
                  </td>
                  <td className="px-4 py-3">{formatCurrency(invoice.total, invoice.currency)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(invoice.due_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(invoice.created_at)}</td>
                  <td className="px-4 py-3">
                    {renderInvoiceActions(invoice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={Boolean(viewingInvoice)} title={viewingInvoice ? `Invoice ${viewingInvoice.invoice_number}` : 'Invoice'} onClose={() => setViewingInvoice(null)} size="xl">
        {viewingInvoice && (
          <div className="mt-2 space-y-4 text-sm text-gray-200">
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge label={viewingInvoice.status} variant={statusVariant(viewingInvoice.status)} />
              <span className="text-gray-400">{viewingInvoice.target_system}</span>
            </div>

            <DetailAuditTabList activeTab={viewTab} onChange={setViewTab} />

            {viewTab === 'audit' && (
              <AuditDetailsPanel description="Who created or changed this invoice, and how it is classified.">
                <AuditCard title="Identity" description="How this invoice is identified.">
                  <AuditField label="Invoice number" value={viewingInvoice.invoice_number} />
                  <AuditField label="User ID" value={viewingInvoice.user_id} />
                </AuditCard>
                <AuditCard title="Classification" description="Where this invoice sits.">
                  <AuditField label="Target system" value={viewingInvoice.target_system} />
                  <AuditField label="Status" value={viewingInvoice.status} />
                </AuditCard>
                <AuditCard title="Record history" description="When this invoice was created and last changed.">
                  <AuditField label="Created by" value={viewingInvoice.created_by || null} />
                  <AuditTimestampPair dateLabel="Created at" value={viewingInvoice.created_at} />
                  <AuditField label="Updated by" value={viewingInvoice.updated_by || null} />
                  <AuditTimestampPair dateLabel="Last updated" value={viewingInvoice.updated_at} />
                </AuditCard>
              </AuditDetailsPanel>
            )}

            {viewTab === 'details' && (
            <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-gray-500">User ID</dt>
                <dd className="font-mono text-xs">{viewingInvoice.user_id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Subscription ID</dt>
                <dd className="font-mono text-xs">{viewingInvoice.subscription_id || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Subtotal</dt>
                <dd>{formatCurrency(viewingInvoice.subtotal, viewingInvoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Tax</dt>
                <dd>{formatCurrency(viewingInvoice.tax_amount, viewingInvoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Total</dt>
                <dd className="font-medium">{formatCurrency(viewingInvoice.total, viewingInvoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Tax Rate</dt>
                <dd>{viewingInvoice.tax_rate_applied != null ? `${viewingInvoice.tax_rate_applied}%` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Issued</dt>
                <dd>{formatDate(viewingInvoice.issued_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Due</dt>
                <dd>{formatDate(viewingInvoice.due_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Paid</dt>
                <dd>{formatDate(viewingInvoice.paid_at)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-gray-500">Payment Transaction</dt>
                <dd className="font-mono text-xs">{viewingInvoice.payment_transaction_id || '—'}</dd>
              </div>
            </dl>
            {viewingInvoice.paid_at && (
              <p className={`text-xs ${refundWindowBadgeClass(daysRemainingForRefund(viewingInvoice.paid_at))}`}>
                Refund window: {daysRemainingForRefund(viewingInvoice.paid_at)} day(s) remaining
              </p>
            )}
            <div>
              <p className="mb-2 text-xs uppercase text-gray-500">Line Items</p>
              <InvoiceLineItemsEditor
                items={normalizeLineItemsFromApi(viewingInvoice.line_items)}
                currency={viewingInvoice.currency}
                readOnly
              />
            </div>
            {viewingInvoice.notes && (
              <div>
                <p className="text-xs uppercase text-gray-500">Notes</p>
                <p className="mt-1 text-gray-300">{viewingInvoice.notes}</p>
              </div>
            )}
            {(refundsByInvoice.get(viewingInvoice.id) || []).length > 0 && (
              <div>
                <p className="text-xs uppercase text-gray-500">Related Refunds</p>
                <ul className="mt-1 space-y-1">
                  {(refundsByInvoice.get(viewingInvoice.id) || []).map((refund) => (
                    <li key={refund.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setViewingInvoice(null)
                          navigate(`/subscriptions/refund-detail?id=${navId(refundDisplayIdMap, refund.id)}`)
                        }}
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        {formatCurrency(refund.amount, refund.currency)} — {refund.status}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </>
            )}
          </div>
        )}
      </AdminModal>

      <AdminModal open={Boolean(editingInvoice)} title={editingInvoice ? `Edit ${editingInvoice.invoice_number}` : 'Edit Invoice'} onClose={() => { setEditingInvoice(null); setEditForm(null) }}>
        {editingInvoice && editForm && (
          <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
            <AdminField label="Line Items" required>
              <InvoiceLineItemsEditor
                items={editForm.lineItems}
                currency={editingInvoice.currency}
                onChange={(lineItems) => setEditForm((prev) => ({
                  ...prev,
                  lineItems,
                  subtotal: String(sumLineItems(lineItems)),
                }))}
              />
            </AdminField>
            <div className="grid gap-4 sm:grid-cols-3">
              <AdminField label="Subtotal">
                <input type="number" readOnly className={`${inputClass} bg-gray-950 text-gray-300`} value={editForm.subtotal} />
                <p className="mt-1 text-xs text-gray-500">Calculated from line items</p>
              </AdminField>
              <AdminField label="Tax Amount">
                <input type="number" min={0} step="0.01" className={inputClass} value={editForm.tax_amount} onChange={(e) => setEditForm((prev) => ({ ...prev, tax_amount: e.target.value }))} />
              </AdminField>
              <AdminField label="Tax Rate %">
                <input type="number" min={0} max={100} step="0.01" className={inputClass} value={editForm.tax_rate_applied} onChange={(e) => setEditForm((prev) => ({ ...prev, tax_rate_applied: e.target.value }))} />
              </AdminField>
            </div>
            <AdminField label="Due Date">
              <input type="datetime-local" className={inputClass} value={editForm.due_at} onChange={(e) => setEditForm((prev) => ({ ...prev, due_at: e.target.value }))} />
            </AdminField>
            <AdminField label="Notes">
              <textarea rows={2} className={inputClass} value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </AdminField>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditingInvoice(null); setEditForm(null) }} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
              <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </AdminForm>
        )}
      </AdminModal>

      <AdminModal open={Boolean(refundingInvoice)} title={refundingInvoice ? `Refund ${refundingInvoice.invoice_number}` : 'Create Refund'} onClose={() => { setRefundingInvoice(null); setRefundForm(EMPTY_REFUND_FORM) }}>
        {refundingInvoice && (
          <AdminForm onSubmit={handleRefundCreate} className="mt-2 space-y-3">
            <p className="text-xs text-gray-400">
              Invoice total: {formatCurrency(refundingInvoice.total, refundingInvoice.currency)}
              {' · '}
              <span className={refundWindowBadgeClass(daysRemainingForRefund(refundingInvoice.paid_at))}>
                {daysRemainingForRefund(refundingInvoice.paid_at)} day(s) left in refund window
              </span>
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Amount" required>
                <input type="number" min={0} step="0.01" className={inputClass} value={refundForm.amount} onChange={(e) => setRefundForm((prev) => ({ ...prev, amount: e.target.value }))} />
              </AdminField>
              <AdminField label="Currency" required>
                <input className={inputClass} value={refundForm.currency} onChange={(e) => setRefundForm((prev) => ({ ...prev, currency: e.target.value }))} />
              </AdminField>
            </div>
            <AdminField label="Reason" required>
              <textarea rows={3} className={inputClass} value={refundForm.reason} onChange={(e) => setRefundForm((prev) => ({ ...prev, reason: e.target.value }))} />
            </AdminField>
            <AdminField label="Payment Transaction ID">
              <input className={`${inputClass} font-mono text-xs`} value={refundForm.payment_transaction_id} onChange={(e) => setRefundForm((prev) => ({ ...prev, payment_transaction_id: e.target.value }))} />
            </AdminField>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setRefundingInvoice(null); setRefundForm(EMPTY_REFUND_FORM) }} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
              <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create Refund'}</button>
            </div>
          </AdminForm>
        )}
      </AdminModal>

      <AdminModal open={showCreate} title="Create Invoice" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          <AdminField label="User ID" required>
            <input className={inputClass} value={createForm.user_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, user_id: e.target.value }))} />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Target System" required>
              <select className={inputClass} value={createForm.target_system} onChange={(e) => setCreateForm((prev) => ({ ...prev, target_system: e.target.value }))}>
                <option value="platform">Platform</option>
                <option value="simulator">Simulator</option>
              </select>
            </AdminField>
            <AdminField label="Currency" required>
              <SelectField
                value={createForm.currency}
                onChange={(v) => setCreateForm((prev) => ({ ...prev, currency: v }))}
                placeholder="Select currency..."
                searchPlaceholder="Search currency..."
                forceSearchable
                options={currencies.map((currency) => ({
                  value: currency.currency_code,
                  label: `${currency.currency_code} — ${currency.currency_name}`,
                }))}
              />
            </AdminField>
          </div>
          <AdminField label="Line Items" required>
            <InvoiceLineItemsEditor
              items={createForm.lineItems}
              currency={createForm.currency}
              onChange={(lineItems) => setCreateForm((prev) => ({
                ...prev,
                lineItems,
                subtotal: String(sumLineItems(lineItems)),
              }))}
            />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-3">
            <AdminField label="Subtotal">
              <input type="number" readOnly className={`${inputClass} bg-gray-950 text-gray-300`} value={createForm.subtotal} />
              <p className="mt-1 text-xs text-gray-500">Calculated from line items</p>
            </AdminField>
            <AdminField label="Tax Amount">
              <input type="number" min={0} step="0.01" className={inputClass} value={createForm.tax_amount} onChange={(e) => setCreateForm((prev) => ({ ...prev, tax_amount: e.target.value }))} />
            </AdminField>
            <AdminField label="Tax Rate %">
              <input type="number" min={0} max={100} step="0.01" className={inputClass} value={createForm.tax_rate_applied} onChange={(e) => setCreateForm((prev) => ({ ...prev, tax_rate_applied: e.target.value }))} />
            </AdminField>
          </div>
          <AdminField label="Subscription ID">
            <input className={inputClass} value={createForm.subscription_id} onChange={(e) => setCreateForm((prev) => ({ ...prev, subscription_id: e.target.value }))} />
          </AdminField>
          <AdminField label="Due Date">
            <input type="datetime-local" className={inputClass} value={createForm.due_at} onChange={(e) => setCreateForm((prev) => ({ ...prev, due_at: e.target.value }))} />
          </AdminField>
          <AdminField label="Notes">
            <textarea rows={2} className={inputClass} value={createForm.notes} onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
