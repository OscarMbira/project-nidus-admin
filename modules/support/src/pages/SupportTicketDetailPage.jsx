import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  assignTicket,
  createTicketReply,
  fetchAdminUsers,
  fetchErrorAggregationByHash,
  fetchLatestErrorLogEntry,
  fetchTicketById,
  fetchTicketMessages,
  formatDate,
  PermissionGate,
  updateTicketPriority,
  updateTicketStatus,
  useDisplayId,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']

export default function SupportTicketDetailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const idParam = searchParams.get('id')
  const { uuid: ticketId, loading: resolving, error: resolveError } = useDisplayId('admin.support_tickets', idParam)

  const [ticket, setTicket] = useState(null)
  const [messages, setMessages] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [statusDraft, setStatusDraft] = useState('open')
  const [priorityDraft, setPriorityDraft] = useState('medium')
  const [assigneeDraft, setAssigneeDraft] = useState('unassigned')
  const [replyText, setReplyText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [showInternalNotes, setShowInternalNotes] = useState(false)
  const [errorContext, setErrorContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = async () => {
    if (!ticketId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const [ticketRes, messagesRes, adminsRes] = await Promise.all([
      fetchTicketById(ticketId),
      fetchTicketMessages(ticketId),
      fetchAdminUsers(),
    ])

    if (ticketRes.error || messagesRes.error || adminsRes.error) {
      setError(
        ticketRes.error?.message
        || messagesRes.error?.message
        || adminsRes.error?.message
        || String(ticketRes.error || messagesRes.error || adminsRes.error),
      )
      setLoading(false)
      return
    }

    setTicket(ticketRes.data || null)
    setMessages(messagesRes.data || [])
    setAdminUsers((adminsRes.data || []).filter((u) => u.activation_status === 'active'))
    setStatusDraft(ticketRes.data?.status || 'open')
    setPriorityDraft(ticketRes.data?.priority || 'medium')
    setAssigneeDraft(ticketRes.data?.assigned_to || 'unassigned')
    setShowInternalNotes(Boolean(ticketRes.data?.is_auto_created))

    if (ticketRes.data?.source_error_hash) {
      const [aggRes, logRes] = await Promise.all([
        fetchErrorAggregationByHash(ticketRes.data.source_error_hash),
        fetchLatestErrorLogEntry(ticketRes.data.source_error_hash),
      ])
      if (!aggRes.error && !logRes.error) {
        setErrorContext({
          aggregation: aggRes.data,
          latestLog: logRes.data,
        })
      } else {
        setErrorContext(null)
      }
    } else {
      setErrorContext(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setLoading(false)
      return
    }
    loadData()
  }, [ticketId, resolving, resolveError])

  const assigneeMap = useMemo(
    () => Object.fromEntries(adminUsers.map((u) => [u.id, u.full_name || u.email || u.id])),
    [adminUsers],
  )

  const visibleMessages = useMemo(
    () => messages.filter((msg) => showInternalNotes || !msg.is_internal),
    [messages, showInternalNotes],
  )

  const applyStatusChange = (nextStatus) => {
    if (!ticket || !nextStatus || nextStatus === ticket.status) return

    confirm({
      title: `Update ticket status to ${nextStatus.replaceAll('_', ' ')}?`,
      message: `Current status: ${ticket.status || '—'}.`,
      confirmLabel: 'Update Status',
      onConfirm: async () => {
        const { error: mutationError } = await updateTicketStatus(ticket.id, nextStatus)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Ticket status updated.')
        await loadData()
      },
    })
  }

  const applyPriorityChange = () => {
    if (!ticket || !priorityDraft || priorityDraft === ticket.priority) return

    confirm({
      title: `Update ticket priority to ${priorityDraft}?`,
      message: `Current priority: ${ticket.priority || '—'}.`,
      confirmLabel: 'Update Priority',
      onConfirm: async () => {
        const { error: mutationError } = await updateTicketPriority(ticket.id, priorityDraft)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Ticket priority updated.')
        await loadData()
      },
    })
  }

  const applyAssignment = () => {
    if (!ticket || !assigneeDraft || assigneeDraft === 'unassigned' || assigneeDraft === ticket.assigned_to) return

    confirm({
      title: 'Assign this ticket?',
      message: `Assign to ${assigneeMap[assigneeDraft] || assigneeDraft}.`,
      confirmLabel: 'Assign',
      onConfirm: async () => {
        const { error: mutationError } = await assignTicket(ticket.id, assigneeDraft)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Ticket assigned.')
        await loadData()
      },
    })
  }

  const submitReply = async (event) => {
    event.preventDefault()
    if (!ticket) return
    const body = replyText.trim()
    if (!body) {
      showError('Reply message is required.')
      return
    }
    const { error: mutationError } = await createTicketReply(ticket.id, body, isInternal)
    if (mutationError) {
      showError(mutationError.message || String(mutationError))
      return
    }
    showSuccess(isInternal ? 'Internal note added.' : 'Reply sent.')
    setReplyText('')
    setIsInternal(false)
    await loadData()
  }

  if (resolving || loading) return <LoadingState message="Loading support ticket detail..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!ticketId) return <EmptyState title="Missing ticket id" description="Open this page with ?id=<ticket-id>." />
  if (!ticket) return <EmptyState title="Ticket not found" description="No support ticket exists for the provided id." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/support/support-ticket-list')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to ticket list
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">{ticket.subject || 'Support Ticket'}</h1>
          <p className="mt-1 text-sm text-gray-500">Ticket ID: {ticket.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="support.tickets.manage">
            <button
              type="button"
              onClick={() => applyStatusChange('resolved')}
              className="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/60"
            >
              Resolve
            </button>
          </PermissionGate>
          <PermissionGate permission="support.tickets.manage">
            <button
              type="button"
              onClick={() => applyStatusChange('closed')}
              className="rounded border border-red-700 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/60"
            >
              Close
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
          <div className="mt-2">
            <AdminBadge label={(ticket.status || 'unknown').replaceAll('_', ' ')} variant={ticket.status || 'default'} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Priority</p>
          <div className="mt-2">
            <AdminBadge label={ticket.priority || '—'} variant={ticket.priority === 'urgent' ? 'rejected' : 'default'} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Category</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{ticket.category || '—'}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Assigned To</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{ticket.assigned_to ? assigneeMap[ticket.assigned_to] || ticket.assigned_to : 'Unassigned'}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Created</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{formatDate(ticket.created_at)}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Updated</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{formatDate(ticket.updated_at)}</p>
        </div>
      </div>

      {ticket.is_auto_created && errorContext && (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-amber-200">Linked Error Diagnostics</h2>
              <p className="mt-1 text-xs text-gray-400">
                Auto-generated from error hash {ticket.source_error_hash || '—'}
              </p>
            </div>
            {errorContext.aggregation?.id && (
              <button
                type="button"
                onClick={() => navigate(`/errors/error-detail?id=${errorContext.aggregation.id}`)}
                className="rounded border border-blue-700 bg-blue-900/40 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-900/70"
              >
                Open Error Dashboard
              </button>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Error Type</p>
              <p className="mt-1 text-sm text-gray-100">{errorContext.latestLog?.error_type || errorContext.aggregation?.error_type || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Route</p>
              <p className="mt-1 text-sm text-gray-100">{errorContext.latestLog?.page_route || errorContext.aggregation?.page_route || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Component</p>
              <p className="mt-1 text-sm text-gray-100">{errorContext.latestLog?.component_name || errorContext.aggregation?.component_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Occurrences</p>
              <p className="mt-1 text-sm text-gray-100">{errorContext.aggregation?.occurrence_count ?? '—'}</p>
            </div>
          </div>
          {(errorContext.latestLog?.error_message || errorContext.aggregation?.error_message) && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Latest Message</p>
              <p className="mt-1 text-sm text-gray-200">{errorContext.latestLog?.error_message || errorContext.aggregation?.error_message}</p>
            </div>
          )}
          {errorContext.latestLog?.stack_trace && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Latest Stack Trace</p>
              <pre className="mt-2 max-h-72 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 text-xs text-red-200 whitespace-pre-wrap">
                {errorContext.latestLog.stack_trace}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <PermissionGate permission="support.tickets.manage">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Update Status</label>
            <div className="flex gap-2">
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => applyStatusChange(statusDraft)}
                className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-xs text-blue-200 hover:bg-blue-900/70"
              >
                Apply
              </button>
            </div>
          </div>
        </PermissionGate>

        <PermissionGate permission="support.tickets.manage">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Update Priority</label>
            <div className="flex gap-2">
              <select
                value={priorityDraft}
                onChange={(event) => setPriorityDraft(event.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyPriorityChange}
                className="rounded border border-amber-700 bg-amber-900/40 px-3 py-2 text-xs text-amber-200 hover:bg-amber-900/70"
              >
                Apply
              </button>
            </div>
          </div>
        </PermissionGate>

        <PermissionGate permission="support.tickets.assign">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Assign To Admin</label>
            <div className="flex gap-2">
              <select
                value={assigneeDraft}
                onChange={(event) => setAssigneeDraft(event.target.value)}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="unassigned">Select assignee...</option>
                {adminUsers.map((admin) => (
                  <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || admin.id}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyAssignment}
                className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-900/70"
              >
                Assign
              </button>
            </div>
          </div>
        </PermissionGate>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Message Thread</h2>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={showInternalNotes}
              onChange={(event) => setShowInternalNotes(event.target.checked)}
              className="rounded border-gray-600 bg-gray-800"
            />
            Show internal notes
          </label>
        </div>
        {visibleMessages.length === 0 ? (
          <EmptyState title="No messages yet" description="Replies and notes will appear here." />
        ) : (
          <div className="space-y-3">
            {visibleMessages.map((msg) => (
              <div key={msg.id} className={`rounded border p-3 ${msg.is_internal ? 'border-amber-800 bg-amber-900/20' : 'border-gray-700 bg-gray-950/60'}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <AdminBadge label={msg.sender_type || 'unknown'} variant={msg.sender_type === 'admin' ? 'system_admin' : 'default'} />
                  {msg.is_internal && <AdminBadge label="internal" variant="pending_activation" />}
                  <span className="text-gray-500">{formatDate(msg.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-100">{msg.message_body || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <PermissionGate permission="support.tickets.manage">
        <form onSubmit={submitReply} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Reply</h2>
          <textarea
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
            rows={4}
            className="mt-3 w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            placeholder="Write your response..."
          />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(event) => setIsInternal(event.target.checked)}
                className="rounded border-gray-600 bg-gray-800"
              />
              Internal note (not visible to end user)
            </label>
            <button
              type="submit"
              className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/70"
            >
              Send Reply
            </button>
          </div>
        </form>
      </PermissionGate>

      {modal}
    </div>
  )
}
