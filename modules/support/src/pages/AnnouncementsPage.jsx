import { useEffect, useMemo, useState } from 'react'
import {
  PermissionGate,
  archiveAnnouncement,
  createAnnouncement,
  fetchAnnouncements,
  formatDate,
  formatDateShort,
  publishAnnouncement,
  updateAnnouncement,
  useBulkSelection,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminField,
  AdminIconActionButton,
  AdminModal,
  AdminRowActions,
  AdminRowManageModal,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
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

const PAGE_SIZE = 12
const STATUS_FILTERS = ['all', 'draft', 'scheduled', 'published', 'expired', 'archived']
const TYPE_OPTIONS = ['info', 'warning', 'maintenance', 'feature_update']
const AUDIENCE_OPTIONS = ['all', 'platform', 'simulator', 'subscription_tier']

const emptyForm = {
  title: '',
  body: '',
  announcement_type: 'info',
  target_audience: 'all',
  publish_at: '',
  expires_at: '',
}

export default function AnnouncementsPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [viewTarget, setViewTarget] = useState(null)
  const [manageRow, setManageRow] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [bulkModal, setBulkModal] = useState({ open: false, action: null })
  const [viewTab, setViewTab] = useState('details')

  const loadAnnouncements = async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchError } = await fetchAnnouncements()
    if (fetchError) {
      setError(fetchError.message || String(fetchError))
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAnnouncements()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!query) return true
      return [row.title, row.body, row.status, row.announcement_type, row.target_audience]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, statusFilter])

  const bulk = useBulkSelection({ rows: filteredRows, idKey: 'id' })

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const reportBulk = (outcome, label) => {
    if (outcome?.cancelled) return
    const total = (outcome?.succeeded?.length || 0) + (outcome?.failed?.length || 0)
    if (outcome?.failed?.length) showError(`${outcome.failed.length} of ${total} failed.`)
    else showSuccess(`${outcome.succeeded.length} ${label}.`)
  }

  const confirmBulkAction = async () => {
    const { action } = bulkModal
    setBulkModal({ open: false, action: null })
    let outcome
    if (action === 'publish') {
      outcome = await bulk.executeBulk((row) => {
        if (!['draft', 'scheduled'].includes(row.status)) return { error: 'Not publishable' }
        return publishAnnouncement(row.id)
      })
      reportBulk(outcome, 'announcement(s) published')
    } else if (action === 'archive') {
      outcome = await bulk.executeBulk((row) => {
        if (row.status === 'archived') return { error: 'Already archived' }
        return archiveAnnouncement(row.id)
      })
      reportBulk(outcome, 'announcement(s) archived')
    }
    await loadAnnouncements()
  }

  const openCreateModal = () => {
    setEditTarget(null)
    setForm(emptyForm)
    setCreateOpen(true)
  }

  const openViewModal = (row) => {
    setViewTarget(row)
    setViewTab('details')
  }

  const openEditFromView = () => {
    if (!viewTarget) return
    const row = viewTarget
    setViewTarget(null)
    openEditModal(row)
  }

  const toDatetimeLocal = (value) => (value ? new Date(value).toISOString().slice(0, 16) : '')

  const rowToForm = (row) => ({
    title: row.title || '',
    body: row.body || '',
    announcement_type: row.announcement_type || 'info',
    target_audience: row.target_audience || 'all',
    publish_at: toDatetimeLocal(row.publish_at),
    expires_at: toDatetimeLocal(row.expires_at),
  })

  const openEditModal = (row) => {
    setEditTarget(row)
    setForm(rowToForm(row))
    setCreateOpen(true)
  }

  const resetModal = () => {
    setCreateOpen(false)
    setEditTarget(null)
    setForm(emptyForm)
  }

  const toIsoOrNull = (value) => (value ? new Date(value).toISOString() : null)

  const submitForm = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.body.trim()) {
      showError('Title and body are required.')
      return
    }

    setSubmitting(true)
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      announcement_type: form.announcement_type,
      target_audience: form.target_audience,
      publish_at: toIsoOrNull(form.publish_at),
      expires_at: toIsoOrNull(form.expires_at),
    }

    const action = editTarget
      ? updateAnnouncement(editTarget.id, payload)
      : createAnnouncement(payload)

    const { error: mutationError } = await action
    setSubmitting(false)

    if (mutationError) {
      showError(mutationError.message || String(mutationError))
      return
    }

    showSuccess(editTarget ? 'Announcement updated.' : 'Announcement created.')
    resetModal()
    await loadAnnouncements()
  }

  const handlePublish = (row) => {
    confirm({
      title: `Publish "${row.title}"?`,
      message: 'The announcement will become visible to users based on audience settings.',
      confirmLabel: 'Publish',
      onConfirm: async () => {
        const { error: mutationError } = await publishAnnouncement(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Announcement published.')
        await loadAnnouncements()
      },
    })
  }

  const handleArchive = (row) => {
    confirm({
      title: `Archive "${row.title}"?`,
      message: 'Archived announcements are no longer active in workflow lists.',
      confirmLabel: 'Archive',
      danger: true,
      onConfirm: async () => {
        const { error: mutationError } = await archiveAnnouncement(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Announcement archived.')
        await loadAnnouncements()
      },
    })
  }

  const buildAnnouncementManageActions = (row) => {
    if (!row) return []
    const actions = []
    if (['draft', 'scheduled'].includes(row.status)) {
      actions.push({
        key: 'publish',
        label: 'Publish',
        variant: 'success',
        onClick: () => handlePublish(row),
      })
    }
    if (!['archived'].includes(row.status)) {
      actions.push({
        key: 'archive',
        label: 'Archive',
        variant: 'danger',
        onClick: () => handleArchive(row),
      })
    }
    return actions
  }

  if (loading) return <LoadingState message="Loading announcements..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Announcements</h1>
          <p className="text-sm text-gray-500">Create and manage announcement status workflow.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <SearchBar value={search} onChange={setSearch} placeholder="Search title, status, type, audience..." />
          <PermissionGate permission="support.announcements.create">
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
            >
              Create Announcement
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="max-w-xs">
        <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Status</label>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>{status === 'all' ? 'All statuses' : status}</option>
          ))}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No announcements found" description="Create one or adjust filters to see existing entries." />
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
              { key: 'title', label: 'Title', render: (r) => (
                <button
                  type="button"
                  className="max-w-xs truncate text-left text-blue-300 hover:underline"
                  onClick={() => openEditModal(r)}
                  title={r.title || '—'}
                >
                  {r.title || '—'}
                </button>
              ) },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={r.status || 'unknown'} variant={r.status || 'default'} />,
              },
              { key: 'announcement_type', label: 'Type', render: (r) => r.announcement_type || '—' },
              { key: 'target_audience', label: 'Audience', render: (r) => r.target_audience || '—' },
              { key: 'publish_at', label: 'Publish At', render: (r) => (
                <span title={formatDate(r.publish_at)}>{formatDateShort(r.publish_at)}</span>
              ) },
              { key: 'expires_at', label: 'Expires At', render: (r) => (
                <span title={formatDate(r.expires_at)}>{formatDateShort(r.expires_at)}</span>
              ) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <AdminRowActions>
                    <AdminIconActionButton variant="view" label="View" onClick={() => openViewModal(r)} />
                    <PermissionGate permission="support.announcements.create">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEditModal(r)} />
                      {buildAnnouncementManageActions(r).length > 0 && (
                        <AdminActionButton variant="default" onClick={() => setManageRow(r)}>
                          Manage
                        </AdminActionButton>
                      )}
                    </PermissionGate>
                  </AdminRowActions>
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
          { key: 'publish', label: 'Publish', onClick: () => setBulkModal({ open: true, action: 'publish' }) },
          { key: 'archive', label: 'Archive', variant: 'danger', onClick: () => setBulkModal({ open: true, action: 'archive' }) },
        ]}
      />

      <BulkConfirmModal
        open={bulkModal.open}
        title={bulkModal.action === 'publish' ? `Publish ${bulk.selectedCount} announcement(s)?` : `Archive ${bulk.selectedCount} announcement(s)?`}
        message={bulkModal.action === 'publish' ? 'Selected announcements will become visible to users.' : 'Archived announcements are no longer active in workflow lists.'}
        items={bulk.selectedItems}
        itemLabel={(item) => item.title || item.id}
        confirmLabel={bulkModal.action === 'publish' ? 'Publish' : 'Archive'}
        danger={bulkModal.action === 'archive'}
        onConfirm={confirmBulkAction}
        onClose={() => setBulkModal({ open: false, action: null })}
        processing={bulk.processing}
      />

      <AdminModal
        open={Boolean(viewTarget)}
        title={viewTarget ? `View ${viewTarget.title}` : 'View Announcement'}
        onClose={() => setViewTarget(null)}
      >
        {viewTarget && (
          <div className="space-y-3">
            <AdminBadge label={viewTarget.status || 'unknown'} variant={viewTarget.status || 'default'} />

            <DetailAuditTabList activeTab={viewTab} onChange={setViewTab} />

            {viewTab === 'audit' && (
              <AuditDetailsPanel description="Who created or changed this announcement, and how it is classified.">
                <AuditCard title="Identity" description="How this announcement is labelled.">
                  <AuditField label="Title" value={viewTarget.title} />
                </AuditCard>
                <AuditCard title="Classification" description="Where this announcement sits.">
                  <AuditField label="Type" value={viewTarget.announcement_type} />
                  <AuditField label="Audience" value={viewTarget.target_audience} />
                  <AuditField label="Status" value={viewTarget.status} />
                </AuditCard>
                <AuditCard title="Record history" description="When this announcement was created and last changed.">
                  <AuditField label="Created by" value={viewTarget.created_by || null} />
                  <AuditTimestampPair dateLabel="Created at" value={viewTarget.created_at} />
                  <AuditField label="Updated by" value={viewTarget.updated_by || null} />
                  <AuditTimestampPair dateLabel="Last updated" value={viewTarget.updated_at} />
                </AuditCard>
              </AuditDetailsPanel>
            )}

            {viewTab === 'details' && (
            <>
            <fieldset disabled className="space-y-3 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
              <AdminField label="Title">
                <input value={viewTarget.title || ''} readOnly className={inputClass} />
              </AdminField>
              <AdminField label="Body">
                <textarea rows={4} value={viewTarget.body || ''} readOnly className={inputClass} />
              </AdminField>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="Type">
                  <input value={viewTarget.announcement_type || ''} readOnly className={inputClass} />
                </AdminField>
                <AdminField label="Audience">
                  <input value={viewTarget.target_audience || ''} readOnly className={inputClass} />
                </AdminField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="Publish At">
                  <input value={toDatetimeLocal(viewTarget.publish_at)} readOnly className={inputClass} />
                </AdminField>
                <AdminField label="Expires At">
                  <input value={toDatetimeLocal(viewTarget.expires_at)} readOnly className={inputClass} />
                </AdminField>
              </div>
            </fieldset>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded px-3 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Close
              </button>
              <PermissionGate permission="support.announcements.create">
                <AdminIconActionButton variant="edit" label="Edit" onClick={openEditFromView} />
              </PermissionGate>
            </div>
            </>
            )}
          </div>
        )}
      </AdminModal>

      <AdminModal
        open={createOpen}
        title={editTarget ? 'Edit Announcement' : 'Create Announcement'}
        onClose={resetModal}
      >
        <form onSubmit={submitForm} className="space-y-3">
          <AdminField label="Title" required>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              className={inputClass}
              placeholder="System maintenance notice..."
            />
          </AdminField>
          <AdminField label="Body" required>
            <textarea
              rows={4}
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              className={inputClass}
              placeholder="Message body..."
            />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Type">
              <select
                value={form.announcement_type}
                onChange={(event) => setForm((prev) => ({ ...prev, announcement_type: event.target.value }))}
                className={inputClass}
              >
                {TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Audience">
              <select
                value={form.target_audience}
                onChange={(event) => setForm((prev) => ({ ...prev, target_audience: event.target.value }))}
                className={inputClass}
              >
                {AUDIENCE_OPTIONS.map((audience) => (
                  <option key={audience} value={audience}>{audience}</option>
                ))}
              </select>
            </AdminField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Publish At">
              <input
                type="datetime-local"
                value={form.publish_at}
                onChange={(event) => setForm((prev) => ({ ...prev, publish_at: event.target.value }))}
                className={inputClass}
              />
            </AdminField>
            <AdminField label="Expires At">
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={(event) => setForm((prev) => ({ ...prev, expires_at: event.target.value }))}
                className={inputClass}
              />
            </AdminField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={resetModal} className="rounded px-3 py-2 text-sm text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </AdminModal>

      <AdminRowManageModal
        open={Boolean(manageRow)}
        title="Manage announcement"
        subtitle={manageRow?.title}
        onClose={() => setManageRow(null)}
        actions={buildAnnouncementManageActions(manageRow)}
      />

      {modal}
    </div>
  )
}
