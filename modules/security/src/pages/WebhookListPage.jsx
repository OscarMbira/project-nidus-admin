import { useEffect, useMemo, useState } from 'react'
import {
  createWebhook,
  deleteWebhook,
  fetchWebhooks,
  formatDate,
  testWebhookDelivery,
  toggleWebhook,
  updateWebhook,
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

const COMMON_EVENTS = [
  'user.created',
  'user.updated',
  'user.deleted',
  'subscription.created',
  'subscription.updated',
  'subscription.cancelled',
  'payment.succeeded',
  'payment.failed',
  'test.event',
]

const EMPTY_FORM = {
  webhook_name: '',
  endpoint_url: '',
  target_system: 'all',
  retry_count: '3',
  is_active: true,
  custom_events: '',
  selected_events: [],
}

function parseListInput(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function mergeEvents(selected, customText) {
  const merged = new Set([...selected, ...parseListInput(customText)])
  return Array.from(merged)
}

function eventsToForm(events = []) {
  const known = new Set(COMMON_EVENTS)
  const selected = events.filter((event) => known.has(event))
  const custom = events.filter((event) => !known.has(event))
  return {
    selected_events: selected,
    custom_events: custom.join(', '),
  }
}

export default function WebhookListPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingWebhook, setEditingWebhook] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchWebhooks()
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.webhook_name, row.endpoint_url, ...(row.events || [])]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const toggleEvent = (setForm, event) => {
    setForm((prev) => {
      const selected = new Set(prev.selected_events)
      if (selected.has(event)) selected.delete(event)
      else selected.add(event)
      return { ...prev, selected_events: Array.from(selected) }
    })
  }

  const openEdit = (webhook) => {
    const eventFields = eventsToForm(webhook.events || [])
    setEditingWebhook(webhook)
    setEditTab('details')
    setEditForm({
      webhook_name: webhook.webhook_name || '',
      endpoint_url: webhook.endpoint_url || '',
      target_system: webhook.target_system || 'all',
      retry_count: String(webhook.retry_count ?? 3),
      is_active: webhook.is_active !== false,
      ...eventFields,
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    const events = mergeEvents(createForm.selected_events, createForm.custom_events)
    if (!createForm.webhook_name.trim() || !createForm.endpoint_url.trim()) {
      showError('Webhook name and endpoint URL are required.')
      return
    }
    if (!events.length) {
      showError('Select at least one event.')
      return
    }
    setSaving(true)
    const { error } = await createWebhook({
      webhook_name: createForm.webhook_name.trim(),
      endpoint_url: createForm.endpoint_url.trim(),
      events,
      target_system: createForm.target_system,
      retry_count: Number.parseInt(createForm.retry_count, 10) || 3,
      is_active: createForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Webhook created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingWebhook) return
    const events = mergeEvents(editForm.selected_events, editForm.custom_events)
    if (!editForm.webhook_name.trim() || !editForm.endpoint_url.trim()) {
      showError('Webhook name and endpoint URL are required.')
      return
    }
    if (!events.length) {
      showError('Select at least one event.')
      return
    }
    setSaving(true)
    const { error } = await updateWebhook(editingWebhook.id, {
      webhook_name: editForm.webhook_name.trim(),
      endpoint_url: editForm.endpoint_url.trim(),
      events,
      target_system: editForm.target_system,
      retry_count: Number.parseInt(editForm.retry_count, 10) || 3,
      is_active: editForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('Webhook updated.')
    setEditingWebhook(null)
    await loadData()
  }

  const handleToggle = async (webhook) => {
    setBusyId(webhook.id)
    const { error } = await toggleWebhook(webhook.id)
    setBusyId('')
    if (error) {
      showError(error)
      return
    }
    showSuccess(webhook.is_active ? 'Webhook disabled.' : 'Webhook enabled.')
    await loadData()
  }

  const handleTest = async (webhook) => {
    const eventType = (webhook.events || [])[0] || 'test.event'
    setBusyId(webhook.id)
    const { error } = await testWebhookDelivery(webhook.id, eventType)
    setBusyId('')
    if (error) {
      showError(error)
      return
    }
    showSuccess(`Test delivery queued (${eventType}). Check the webhook log for results.`)
  }

  const handleDelete = (webhook) => {
    confirm({
      title: `Delete ${webhook.webhook_name}?`,
      message: 'This removes the webhook endpoint and its delivery history.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(webhook.id)
        const { error } = await deleteWebhook(webhook.id)
        setBusyId('')
        if (error) {
          showError(error)
          return
        }
        showSuccess('Webhook deleted.')
        await loadData()
      },
    })
  }

  const renderEventFields = (form, setForm) => (
    <>
      <AdminField label="Events">
        <div className="grid gap-2 sm:grid-cols-2">
          {COMMON_EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.selected_events.includes(event)}
                onChange={() => toggleEvent(setForm, event)}
              />
              <span className="font-mono text-xs">{event}</span>
            </label>
          ))}
        </div>
      </AdminField>
      <AdminField label="Custom Events">
        <input className={inputClass} value={form.custom_events} onChange={(e) => setForm((prev) => ({ ...prev, custom_events: e.target.value }))} placeholder="invoice.paid, custom.event" />
        <p className="mt-1 text-xs text-gray-500">Additional comma-separated event types</p>
      </AdminField>
    </>
  )

  const renderFormFields = (form, setForm) => (
    <>
      <AdminField label="Webhook Name" required>
        <input className={inputClass} value={form.webhook_name} onChange={(e) => setForm((prev) => ({ ...prev, webhook_name: e.target.value }))} placeholder="Production Notifications" />
      </AdminField>
      <AdminField label="Endpoint URL" required>
        <input className={inputClass} value={form.endpoint_url} onChange={(e) => setForm((prev) => ({ ...prev, endpoint_url: e.target.value }))} placeholder="https://example.com/webhooks/nidus" />
        <p className="mt-1 text-xs text-gray-500">Must be HTTPS</p>
      </AdminField>
      {renderEventFields(form, setForm)}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Target System">
          <select className={inputClass} value={form.target_system} onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}>
            <option value="all">All</option>
            <option value="platform">Platform</option>
            <option value="simulator">Simulator</option>
          </select>
        </AdminField>
        <AdminField label="Retry Count">
          <input type="number" min={0} className={inputClass} value={form.retry_count} onChange={(e) => setForm((prev) => ({ ...prev, retry_count: e.target.value }))} />
        </AdminField>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
        Active
      </label>
    </>
  )

  if (loading) return <LoadingState message="Loading webhooks..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Webhooks</h1>
          <p className="text-sm text-gray-500">Configure outbound event notifications to external HTTPS endpoints.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, URL, events..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Webhook
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No webhooks found" description="Create a webhook or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Endpoint</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Retries</th>
                <th className="px-4 py-3">Failures</th>
                <th className="px-4 py-3">Last Triggered</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((webhook) => (
                <tr key={webhook.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{webhook.webhook_name}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-gray-400" title={webhook.endpoint_url}>{webhook.endpoint_url}</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-gray-400" title={(webhook.events || []).join(', ')}>
                    {(webhook.events || []).length ? (webhook.events || []).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">{webhook.target_system || 'all'}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={webhook.is_active ? 'active' : 'inactive'} variant={webhook.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3">{webhook.retry_count ?? 3}</td>
                  <td className="px-4 py-3">{webhook.failure_count ?? 0}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(webhook.last_triggered_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(webhook)} />
                      <button type="button" disabled={busyId === webhook.id} onClick={() => handleToggle(webhook)} className="rounded border border-violet-700 bg-violet-900/30 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-60">
                        {webhook.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button type="button" disabled={busyId === webhook.id || !webhook.is_active} onClick={() => handleTest(webhook)} className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60">Test</button>
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(webhook)} disabled={busyId === webhook.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Webhook" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingWebhook)} title={`Edit ${editingWebhook?.webhook_name || 'Webhook'}`} onClose={() => setEditingWebhook(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingWebhook && (
          <AuditDetailsPanel description="Who created this webhook, and how it is classified.">
            <AuditCard title="Identity" description="How this webhook is labelled.">
              <AuditField label="Webhook name" value={editingWebhook.webhook_name} />
              <AuditField label="Endpoint URL" value={editingWebhook.endpoint_url} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this webhook sits.">
              <AuditField label="Target system" value={editingWebhook.target_system} />
              <AuditField label="Active" value={editingWebhook.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this webhook was created.">
              <AuditField label="Created by" value={editingWebhook.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingWebhook.created_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingWebhook(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
