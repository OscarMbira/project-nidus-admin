import { useEffect, useMemo, useState } from 'react'
import {
  createSupportedLanguage,
  deleteSupportedLanguage,
  fetchSupportedLanguages,
  updateSupportedLanguage,
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

const TARGET_SYSTEMS = ['all', 'platform', 'simulator']

const EMPTY_FORM = {
  language_code: '',
  language_name: '',
  native_name: '',
  is_default: false,
  is_active: true,
  target_system: 'all',
}

function languageToForm(language) {
  return {
    language_code: language.language_code || '',
    language_name: language.language_name || '',
    native_name: language.native_name || '',
    is_default: Boolean(language.is_default),
    is_active: language.is_active !== false,
    target_system: language.target_system || 'all',
  }
}

function completionColor(percentage) {
  if (percentage >= 90) return 'text-emerald-400'
  if (percentage >= 50) return 'text-amber-400'
  return 'text-red-400'
}

export default function LanguageListPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingLanguage, setEditingLanguage] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchSupportedLanguages()
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
    return rows.filter((row) => [row.language_code, row.language_name, row.native_name]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const openEdit = (language) => {
    setEditingLanguage(language)
    setEditForm(languageToForm(language))
    setEditTab('details')
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Language Code" required>
        <input
          className={inputClass}
          value={form.language_code}
          readOnly={isEdit}
          maxLength={5}
          onChange={(e) => setForm((prev) => ({ ...prev, language_code: e.target.value.toLowerCase() }))}
          placeholder="en"
        />
      </AdminField>
      <AdminField label="Language Name" required>
        <input
          className={inputClass}
          value={form.language_name}
          onChange={(e) => setForm((prev) => ({ ...prev, language_name: e.target.value }))}
        />
      </AdminField>
      <AdminField label="Native Name">
        <input
          className={inputClass}
          value={form.native_name}
          onChange={(e) => setForm((prev) => ({ ...prev, native_name: e.target.value }))}
        />
      </AdminField>
      <AdminField label="Target System">
        <select
          className={inputClass}
          value={form.target_system}
          onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}
        >
          {TARGET_SYSTEMS.map((sys) => (
            <option key={sys} value={sys}>{sys}</option>
          ))}
        </select>
      </AdminField>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.is_default}
          onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
        />
        Default language
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
        />
        Active
      </label>
      {form.is_default && (
        <p className="text-xs text-amber-300">Only one language can be the default at a time.</p>
      )}
    </>
  )

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.language_code.trim() || !createForm.language_name.trim()) {
      showError('Language code and name are required.')
      return
    }
    setSaving(true)
    const { error } = await createSupportedLanguage({
      language_code: createForm.language_code.trim(),
      language_name: createForm.language_name.trim(),
      native_name: createForm.native_name.trim() || null,
      is_default: createForm.is_default,
      is_active: createForm.is_active,
      target_system: createForm.target_system,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Language created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingLanguage) return
    setSaving(true)
    const { error } = await updateSupportedLanguage(editingLanguage.id, {
      language_name: editForm.language_name.trim(),
      native_name: editForm.native_name.trim() || null,
      is_default: editForm.is_default,
      is_active: editForm.is_active,
      target_system: editForm.target_system,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Language updated.')
    setEditingLanguage(null)
    await loadData()
  }

  const handleDelete = (language) => {
    confirm({
      title: `Delete ${language.language_name}?`,
      message: 'Translations for this language will also be removed.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(language.id)
        const { error } = await deleteSupportedLanguage(language.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Language deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading languages..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Supported Languages</h1>
          <p className="text-sm text-gray-500">Manage localization languages and track translation completion.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search code, name..." />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Language
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No languages found" description="Create a language or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Native Name</th>
                <th className="px-4 py-3">Completion</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Default</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((language) => (
                <tr key={language.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-mono">{language.language_code}</td>
                  <td className="px-4 py-3 font-medium">{language.language_name}</td>
                  <td className="px-4 py-3">{language.native_name || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded bg-gray-800">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${language.completion_percentage ?? 0}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${completionColor(language.completion_percentage ?? 0)}`}>
                        {language.completion_percentage ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{language.target_system}</td>
                  <td className="px-4 py-3">
                    <AdminBadge
                      label={language.is_active ? 'active' : 'inactive'}
                      variant={language.is_active ? 'active' : 'inactive'}
                    />
                  </td>
                  <td className="px-4 py-3">{language.is_default ? '★ Default' : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(language)} />
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(language)} disabled={busyId === language.id || language.is_default} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Language" onClose={() => setShowCreate(false)}>
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

      <AdminModal open={Boolean(editingLanguage)} title={`Edit ${editingLanguage?.language_name || 'Language'}`} onClose={() => setEditingLanguage(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingLanguage && (
          <AuditDetailsPanel description="Who created or changed this language, and how it is classified.">
            <AuditCard title="Identity" description="How this language is labelled.">
              <AuditField label="Language code" value={editingLanguage.language_code} />
              <AuditField label="Language name" value={editingLanguage.language_name} />
              <AuditField label="Native name" value={editingLanguage.native_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this language sits.">
              <AuditField label="Target system" value={editingLanguage.target_system} />
              <AuditField label="Active" value={editingLanguage.is_active ? 'Yes' : 'No'} />
              <AuditField label="Default" value={editingLanguage.is_default ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this language was created and last changed.">
              <AuditField label="Created by" value={editingLanguage.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingLanguage.created_at} />
              <AuditField label="Updated by" value={editingLanguage.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editingLanguage.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          {editingLanguage && (
            <p className="text-xs text-gray-500">
              Completion: {editingLanguage.completion_percentage ?? 0}% (updated automatically)
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingLanguage(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
