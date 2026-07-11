import { useEffect, useMemo, useState } from 'react'
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  fetchNotificationTemplates,
  toggleNotificationTemplate,
  updateNotificationTemplate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  SearchBar,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const CATEGORY_OPTIONS = ['billing', 'security', 'system', 'support']
const CHANNEL_OPTIONS = ['in_app', 'email', 'both']

const EMPTY_FORM = {
  template_key: '',
  template_name: '',
  category: 'system',
  channel: 'in_app',
  subject_template: '',
  body_template: '',
  is_active: true,
}

export default function NotificationTemplatesPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchNotificationTemplates()
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
    return rows.filter((row) => [
      row.template_key,
      row.template_name,
      row.category,
      row.channel,
      row.subject_template,
    ].some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const openEdit = (template) => {
    setEditingTemplate(template)
    setEditForm({
      template_key: template.template_key || '',
      template_name: template.template_name || '',
      category: template.category || 'system',
      channel: template.channel || 'in_app',
      subject_template: template.subject_template || '',
      body_template: template.body_template || '',
      is_active: template.is_active !== false,
    })
  }

  const handleToggle = async (templateId) => {
    setBusyId(templateId)
    const { error } = await toggleNotificationTemplate(templateId)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Template toggled.')
    await loadData()
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.template_key.trim() || !createForm.template_name.trim() || !createForm.body_template.trim()) {
      showError('Template key, name, and body are required.')
      return
    }
    setSaving(true)
    const { error } = await createNotificationTemplate({
      template_key: createForm.template_key.trim(),
      template_name: createForm.template_name.trim(),
      category: createForm.category,
      channel: createForm.channel,
      subject_template: createForm.subject_template.trim() || null,
      body_template: createForm.body_template.trim(),
      is_active: createForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Notification template created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingTemplate) return
    if (!editForm.template_name.trim() || !editForm.body_template.trim()) {
      showError('Template name and body are required.')
      return
    }
    setSaving(true)
    const { error } = await updateNotificationTemplate(editingTemplate.id, {
      template_name: editForm.template_name.trim(),
      category: editForm.category,
      channel: editForm.channel,
      subject_template: editForm.subject_template.trim() || null,
      body_template: editForm.body_template.trim(),
      is_active: editForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Notification template updated.')
    setEditingTemplate(null)
    await loadData()
  }

  const handleDelete = (template) => {
    confirm({
      title: `Delete ${template.template_key}?`,
      message: 'Alert rules referencing this template will lose their template link.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(template.id)
        const { error } = await deleteNotificationTemplate(template.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Notification template deleted.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Template Key" required>
        <input
          className={inputClass}
          value={form.template_key}
          readOnly={isEdit}
          onChange={(e) => setForm((prev) => ({ ...prev, template_key: e.target.value }))}
          placeholder="subscription_expiry_warning"
        />
      </AdminField>
      <AdminField label="Template Name" required>
        <input
          className={inputClass}
          value={form.template_name}
          onChange={(e) => setForm((prev) => ({ ...prev, template_name: e.target.value }))}
          placeholder="Subscription Expiry Warning"
        />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Category" required>
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Channel" required>
          <select
            className={inputClass}
            value={form.channel}
            onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
          >
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </AdminField>
      </div>
      {(form.channel === 'email' || form.channel === 'both') && (
        <AdminField label="Subject Template">
          <input
            className={inputClass}
            value={form.subject_template}
            onChange={(e) => setForm((prev) => ({ ...prev, subject_template: e.target.value }))}
            placeholder="Subscription expiring for {{org_name}}"
          />
        </AdminField>
      )}
      <AdminField label="Body Template" required>
        <textarea
          rows={5}
          className={inputClass}
          value={form.body_template}
          onChange={(e) => setForm((prev) => ({ ...prev, body_template: e.target.value }))}
          placeholder="Your subscription expires on {{expiry_date}}."
        />
      </AdminField>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
        />
        Active
      </label>
    </>
  )

  if (loading) return <LoadingState message="Loading notification templates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Notification Templates</h1>
          <p className="text-sm text-gray-500">Reusable in-app and email notification templates for alert rules.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search key, name, category..." />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Template
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No notification templates found" description="Create a template or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((template) => {
                const isBusy = busyId === template.id
                return (
                  <tr key={template.id} className="border-t border-gray-800">
                    <td className="px-4 py-3 font-medium">{template.template_key}</td>
                    <td className="px-4 py-3">{template.template_name}</td>
                    <td className="px-4 py-3">{template.category}</td>
                    <td className="px-4 py-3">{template.channel}</td>
                    <td className="px-4 py-3">
                      <AdminBadge
                        label={template.is_active ? 'active' : 'inactive'}
                        variant={template.is_active ? 'active' : 'inactive'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggle(template.id)}
                          className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
                        >
                          {isBusy ? 'Working...' : 'Toggle'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(template)}
                          className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(template)}
                          className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Notification Template" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal
        open={Boolean(editingTemplate)}
        title={`Edit ${editingTemplate?.template_key || 'Template'}`}
        onClose={() => setEditingTemplate(null)}
      >
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingTemplate(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
