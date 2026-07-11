import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  assignTicket,
  exportToFile,
  fetchAdminUsers,
  fetchSupportTickets,
  formatDate,
  generateExportFilename,
  PermissionGate,
  updateTicketPriority,
  updateTicketStatus,
  navId,
  useBulkSelection,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminCard,
  AdminModal,
  AdminTable,
  BulkActionBar,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const PAGE_SIZE = 12
const STATUS_FILTERS = ['all', 'open', 'in_progress', 'waiting_user', 'resolved', 'closed']
const PRIORITY_FILTERS = ['all', 'low', 'medium', 'high', 'urgent']
const CATEGORY_FILTERS = ['all', 'billing', 'technical', 'account', 'simulator', 'general']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']
const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']

export default function SupportTicketListPage() {
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [pendingPriority, setPendingPriority] = useState({})
  const [pendingAssignee, setPendingAssignee] = useState({})
  const [page, setPage] = useState(1)
  const [bulkModal, setBulkModal] = useState({
    open: false,
    action: null,
    assigneeId: '',
    newStatus: 'open',
    newPriority: 'medium',
  })

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('admin.support_tickets', rowIds)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const [ticketsRes, adminsRes] = await Promise.all([fetchSupportTickets(), fetchAdminUsers()])

    if (ticketsRes.error || adminsRes.error) {
      setError(
        ticketsRes.error?.message
        || adminsRes.error?.message
        || String(ticketsRes.error || adminsRes.error),
      )
      setRows([])
      setAdminUsers([])
      setLoading(false)
      return
    }

    const ticketRows = ticketsRes.data || []
    const adminRows = (adminsRes.data || []).filter((u) => u.activation_status === 'active')

    setRows(ticketRows)
    setAdminUsers(adminRows)
    setPendingPriority(Object.fromEntries(ticketRows.map((t) => [t.id, t.priority || 'medium'])))
    setPendingAssignee(Object.fromEntries(ticketRows.map((t) => [t.id, t.assigned_to || 'unassigned'])))
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const assigneeMap = useMemo(
    () => Object.fromEntries(adminUsers.map((u) => [u.id, u.full_name || u.email || u.id])),
    [adminUsers],
  )

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (priorityFilter !== 'all' && row.priority !== priorityFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (assigneeFilter === 'unassigned' && row.assigned_to) return false
      if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && row.assigned_to !== assigneeFilter) return false
      if (!query) return true
      return [row.subject, row.category, row.status, row.priority, row.user_id, row.id]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter, priorityFilter, categoryFilter, assigneeFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, priorityFilter, categoryFilter, assigneeFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const handleExport = () => {
    const exportRows = filteredRows.map((row) => ({
      ...row,
      display_id: displayIdMap[row.id] || row.id,
      assignee: row.assigned_to ? assigneeMap[row.assigned_to] || row.assigned_to : 'Unassigned',
    }))
    const { error: exportError } = exportToFile(
      exportRows,
      [
        { key: 'display_id', label: 'Display ID' },
        { key: 'subject', label: 'Subject' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'category', label: 'Category' },
        { key: 'assignee', label: 'Assigned To' },
        { key: 'created_at', label: 'Created' },
      ],
      generateExportFilename('support_tickets', { status: statusFilter, priority: priorityFilter }),
    )
    if (exportError) showError(exportError)
    else showSuccess('Support tickets exported.')
  }

  const confirmBulkAction = async () => {
    const { action, assigneeId, newStatus, newPriority } = bulkModal
    if (action === 'assign' && !assigneeId) {
      showError('Select an assignee before applying assignment.')
      return
    }
    setBulkModal({ open: false, action: null, assigneeId: '', newStatus: 'open', newPriority: 'medium' })
    let outcome
    if (action === 'assign') {
      outcome = await bulk.executeBulk((row) => assignTicket(row.id, assigneeId))
      reportBulk(outcome, 'ticket(s) assigned')
    } else if (action === 'updateStatus') {
      outcome = await bulk.executeBulk((row) => updateTicketStatus(row.id, newStatus))
      reportBulk(outcome, 'ticket status(es) updated')
    } else if (action === 'updatePriority') {
      outcome = await bulk.executeBulk((row) => updateTicketPriority(row.id, newPriority))
      reportBulk(outcome, 'ticket priority(ies) updated')
    }
    await loadData()
  }

  const updatePriorityForTicket = (ticket) => {
    const nextPriority = pendingPriority[ticket.id] || ticket.priority
    if (!nextPriority || nextPriority === ticket.priority) return

    confirm({
      title: `Update priority for ticket ${ticket.id}?`,
      message: `Change priority from "${ticket.priority || '—'}" to "${nextPriority}".`,
      confirmLabel: 'Update Priority',
      onConfirm: async () => {
        const { error: mutationError } = await updateTicketPriority(ticket.id, nextPriority)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Ticket priority updated.')
        await loadData()
      },
    })
  }

  const assignTicketToAdmin = (ticket) => {
    const selected = pendingAssignee[ticket.id]
    if (!selected || selected === 'unassigned') {
      showError('Select an assignee before applying assignment.')
      return
    }
    if (selected === ticket.assigned_to) return

    confirm({
      title: `Assign ticket ${ticket.id}?`,
      message: `Assign this ticket to ${assigneeMap[selected] || selected}.`,
      confirmLabel: 'Assign',
      onConfirm: async () => {
        const { error: mutationError } = await assignTicket(ticket.id, selected)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Ticket assigned.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading support tickets..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Support Tickets</h1>
          <p className="text-sm text-gray-500">Filter, assign, and prioritize support workload.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by subject, id, category, user..." />
          <button
            type="button"
            onClick={handleExport}
            className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
          >
            Export
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {STATUS_FILTERS.map((status) => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Priority</label>
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {PRIORITY_FILTERS.map((priority) => (
              <option key={priority} value={priority}>{priority === 'all' ? 'All priorities' : priority}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Category</label>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {CATEGORY_FILTERS.map((category) => (
              <option key={category} value={category}>{category === 'all' ? 'All categories' : category}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Assigned To</label>
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="all">All assignees</option>
            <option value="unassigned">Unassigned</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || admin.id}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Total tickets" value={rows.length} />
        <AdminCard title="Filtered tickets" value={filteredRows.length} />
        <AdminCard title="Open / In Progress" value={rows.filter((r) => ['open', 'in_progress'].includes(r.status)).length} />
        <AdminCard title="Unassigned" value={rows.filter((r) => !r.assigned_to).length} />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No support tickets found" description="Try adjusting one or more filters." />
      ) : (
        <>
          <AdminTable
            rows={filteredRows}
            page={page}
            pageSize={PAGE_SIZE}
            selectable
            selectedIds={bulk.selectedIds}
            onSelectionChange={bulk.setSelectedIds}
            columns={[
              { key: 'display_id', label: 'Display ID', sortable: false, render: (r) => displayIdMap[r.id] || '—' },
              { key: 'subject', label: 'Subject', render: (r) => r.subject || '—' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={(r.status || 'unknown').replaceAll('_', ' ')} variant={r.status || 'default'} />,
              },
              {
                key: 'priority',
                label: 'Priority',
                render: (r) => <AdminBadge label={r.priority || '—'} variant={r.priority === 'urgent' ? 'rejected' : 'default'} />,
              },
              { key: 'category', label: 'Category', render: (r) => r.category || '—' },
              { key: 'assigned_to', label: 'Assigned To', render: (r) => (r.assigned_to ? assigneeMap[r.assigned_to] || r.assigned_to : 'Unassigned') },
              { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/70"
                      onClick={() => navigate(`/support/support-ticket-detail?id=${navId(displayIdMap, r.id)}`)}
                    >
                      View Detail
                    </button>
                    <PermissionGate permission="support.tickets.assign">
                      <div className="flex items-center gap-2">
                        <select
                          value={pendingAssignee[r.id] || 'unassigned'}
                          onChange={(event) => setPendingAssignee((prev) => ({ ...prev, [r.id]: event.target.value }))}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                        >
                          <option value="unassigned">Assign to...</option>
                          {adminUsers.map((admin) => (
                            <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || admin.id}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded border border-cyan-700 bg-cyan-900/30 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-900/60"
                          onClick={() => assignTicketToAdmin(r)}
                        >
                          Assign
                        </button>
                      </div>
                    </PermissionGate>
                    <PermissionGate permission="support.tickets.manage">
                      <div className="flex items-center gap-2">
                        <select
                          value={pendingPriority[r.id] || r.priority || 'medium'}
                          onChange={(event) => setPendingPriority((prev) => ({ ...prev, [r.id]: event.target.value }))}
                          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none"
                        >
                          {PRIORITY_OPTIONS.map((priority) => (
                            <option key={priority} value={priority}>{priority}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="rounded border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-900/60"
                          onClick={() => updatePriorityForTicket(r)}
                        >
                          Priority
                        </button>
                      </div>
                    </PermissionGate>
                  </div>
                ),
              },
            ]}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <BulkActionBar
        selectedCount={bulk.selectedCount}
        processing={bulk.processing}
        progressCurrent={bulk.progress.current}
        progressTotal={bulk.progress.total}
        onClearSelection={bulk.clearSelection}
        actions={[
          { key: 'assign', label: 'Assign', onClick: () => setBulkModal({ open: true, action: 'assign', assigneeId: adminUsers[0]?.id || '', newStatus: 'open', newPriority: 'medium' }) },
          { key: 'updateStatus', label: 'Update Status', onClick: () => setBulkModal({ open: true, action: 'updateStatus', assigneeId: '', newStatus: 'open', newPriority: 'medium' }) },
          { key: 'updatePriority', label: 'Update Priority', onClick: () => setBulkModal({ open: true, action: 'updatePriority', assigneeId: '', newStatus: 'open', newPriority: 'medium' }) },
        ]}
      />

      <AdminModal
        open={bulkModal.open && bulkModal.action === 'assign'}
        title={`Assign ${bulk.selectedCount} ticket(s)`}
        onClose={() => setBulkModal({ open: false, action: null, assigneeId: '', newStatus: 'open', newPriority: 'medium' })}
        onConfirm={confirmBulkAction}
        confirmLabel="Assign"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-400">Select an admin to assign all selected tickets.</p>
          <select
            value={bulkModal.assigneeId}
            onChange={(event) => setBulkModal((prev) => ({ ...prev, assigneeId: event.target.value }))}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">Select assignee...</option>
            {adminUsers.map((admin) => (
              <option key={admin.id} value={admin.id}>{admin.full_name || admin.email || admin.id}</option>
            ))}
          </select>
        </div>
      </AdminModal>

      <AdminModal
        open={bulkModal.open && bulkModal.action === 'updateStatus'}
        title={`Update status for ${bulk.selectedCount} ticket(s)`}
        onClose={() => setBulkModal({ open: false, action: null, assigneeId: '', newStatus: 'open', newPriority: 'medium' })}
        onConfirm={confirmBulkAction}
        confirmLabel="Update Status"
      >
        <select
          value={bulkModal.newStatus}
          onChange={(event) => setBulkModal((prev) => ({ ...prev, newStatus: event.target.value }))}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
          ))}
        </select>
      </AdminModal>

      <AdminModal
        open={bulkModal.open && bulkModal.action === 'updatePriority'}
        title={`Update priority for ${bulk.selectedCount} ticket(s)`}
        onClose={() => setBulkModal({ open: false, action: null, assigneeId: '', newStatus: 'open', newPriority: 'medium' })}
        onConfirm={confirmBulkAction}
        confirmLabel="Update Priority"
      >
        <select
          value={bulkModal.newPriority}
          onChange={(event) => setBulkModal((prev) => ({ ...prev, newPriority: event.target.value }))}
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100"
        >
          {PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority}>{priority}</option>
          ))}
        </select>
      </AdminModal>

      {modal}
    </div>
  )
}
