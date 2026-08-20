import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createEmailTemplate,
  deleteEmailTemplate,
  fetchEmailTemplates,
  toggleEmailTemplate,
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
} from '@nidus-admin/ui'

const CATEGORIES = ['all', 'auth', 'billing', 'support', 'system', 'affiliate', 'testers', 'marketing']
const TARGET_SYSTEMS = ['all', 'platform', 'simulator']

const EMPTY_CREATE = {
  template_key: '',
  template_name: '',
  subject: '',
  body_html: '<p></p>',
  category: 'system',
  target_system: 'all',
  is_active: true,
}

export default function EmailTemplateListPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchEmailTemplates({
      category: categoryFilter === 'all' ? null : categoryFilter,
    })
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [categoryFilter])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.template_key, row.template_name, row.subject]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.template_key.trim() || !createForm.template_name.trim() || !createForm.subject.trim()) {
      showError('Template key, name, and subject are required.')
      return
    }
    setSaving(true)
    const { data, error } = await createEmailTemplate({
      template_key: createForm.template_key.trim(),
      template_name: createForm.template_name.trim(),
      subject: createForm.subject.trim(),
      body_html: createForm.body_html.trim() || '<p></p>',
      category: createForm.category,
      target_system: createForm.target_system,
      is_active: createForm.is_active,
      variables: [],
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Email template created.')
    setShowCreate(false)
    setCreateForm(EMPTY_CREATE)
    const newId = typeof data === 'string' ? data : (data?.id || data?.template_id)
    if (newId) {
      navigate(`/content/email-template-editor?id=${encodeURIComponent(newId)}`)
      return
    }
    await loadData()
  }

  const handleToggle = async (template) => {
    setBusyId(template.id)
    const { error } = await toggleEmailTemplate(template.id)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(template.is_active ? 'Template deactivated.' : 'Template activated.')
    await loadData()
  }

  const handleDelete = (template) => {
    confirm({
      title: `Delete ${template.template_name}?`,
      message: 'This permanently removes the email template. Sends already logged are retained.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(template.id)
        const { error } = await deleteEmailTemplate(template.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Email template deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading email templates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Email Templates</h1>
          <p className="text-sm text-gray-500">Manage transactional email templates for Platform and Simulator.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search key, name, subject..." />
          <select
            className={inputClass}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat === 'all' ? 'All categories' : cat}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => navigate('/content/email-template-editor')}
            className="rounded border border-gray-600 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-800"
          >
            Full Editor
          </button>
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
        <EmptyState title="No email templates found" description="Create a template or adjust your filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((template) => (
                <tr key={template.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-mono text-xs">{template.template_key}</td>
                  <td className="px-4 py-3 font-medium">{template.template_name}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{template.subject}</td>
                  <td className="px-4 py-3 capitalize">{template.category}</td>
                  <td className="px-4 py-3 capitalize">{template.target_system}</td>
                  <td className="px-4 py-3">
                    <AdminBadge
                      label={template.is_active ? 'active' : 'inactive'}
                      variant={template.is_active ? 'active' : 'inactive'}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/email-template-editor?id=${encodeURIComponent(template.id)}`)} />
                      <button
                        type="button"
                        disabled={busyId === template.id}
                        onClick={() => handleToggle(template)}
                        className="rounded border border-violet-700 bg-violet-900/30 px-2.5 py-1 text-xs text-violet-200 hover:bg-violet-900/50 disabled:opacity-60"
                      >
                        {template.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(template)} disabled={busyId === template.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Email Template" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          <AdminField label="Template Key" required>
            <input
              className={inputClass}
              value={createForm.template_key}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, template_key: e.target.value }))}
              placeholder="welcome_email"
            />
          </AdminField>
          <AdminField label="Template Name" required>
            <input
              className={inputClass}
              value={createForm.template_name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, template_name: e.target.value }))}
            />
          </AdminField>
          <AdminField label="Subject" required>
            <input
              className={inputClass}
              value={createForm.subject}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Category">
              <select
                className={inputClass}
                value={createForm.category}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
              >
                {CATEGORIES.filter((c) => c !== 'all').map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Target System">
              <select
                className={inputClass}
                value={createForm.target_system}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, target_system: e.target.value }))}
              >
                {TARGET_SYSTEMS.map((sys) => (
                  <option key={sys} value={sys}>{sys}</option>
                ))}
              </select>
            </AdminField>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={createForm.is_active}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            Active
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Creating...' : 'Create & Edit'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
