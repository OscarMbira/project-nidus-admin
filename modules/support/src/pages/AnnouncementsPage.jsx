import { useEffect, useMemo, useState } from 'react'
import {
  archiveAnnouncement,
  createAnnouncement,
  fetchAnnouncements,
  formatDate,
  PermissionGate,
  publishAnnouncement,
  updateAnnouncement,
  useBulkSelection,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminModal,
  AdminTable,
  BulkActionBar,
  BulkConfirmModal,
  EmptyState,
  inputClass,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
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
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [bulkModal, setBulkModal] = useState({ open: false, action: null })

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

  const openEditModal = (row) => {
    setEditTarget(row)
    setForm({
      title: row.title || '',
      body: row.body || '',
      announcement_type: row.announcement_type || 'info',
      target_audience: row.target_audience || 'all',
      publish_at: row.publish_at ? new Date(row.publish_at).toISOString().slice(0, 16) : '',
      expires_at: row.expires_at ? new Date(row.expires_at).toISOString().slice(0, 16) : '',
    })
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
              { key: 'title', label: 'Title', render: (r) => r.title || '—' },
              {
                key: 'status',
                label: 'Status',
                render: (r) => <AdminBadge label={r.status || 'unknown'} variant={r.status || 'default'} />,
              },
              { key: 'announcement_type', label: 'Type', render: (r) => r.announcement_type || '—' },
              { key: 'target_audience', label: 'Audience', render: (r) => r.target_audience || '—' },
              { key: 'publish_at', label: 'Publish At', render: (r) => formatDate(r.publish_at) },
              { key: 'expires_at', label: 'Expires At', render: (r) => formatDate(r.expires_at) },
              {
                key: 'actions',
                label: 'Actions',
                sortable: false,
                render: (r) => (
                  <PermissionGate permission="support.announcements.create">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(r)}
                        className="rounded border border-blue-700 bg-blue-900/30 px-2 py-1 text-xs text-blue-200 hover:bg-blue-900/60"
                      >
                        Edit
                      </button>
                      {['draft', 'scheduled'].includes(r.status) && (
                        <button
                          type="button"
                          onClick={() => handlePublish(r)}
                          className="rounded border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/60"
                        >
                          Publish
                        </button>
                      )}
                      {!['archived'].includes(r.status) && (
                        <button
                          type="button"
                          onClick={() => handleArchive(r)}
                          className="rounded border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </PermissionGate>
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

      {modal}
    </div>
  )
}
