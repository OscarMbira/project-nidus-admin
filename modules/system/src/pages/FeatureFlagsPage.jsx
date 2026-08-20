import { useEffect, useMemo, useState } from 'react'
import { createFeatureFlag, deleteFeatureFlag, fetchFeatureFlags, formatDate, getAdminDb, toggleFeatureFlag } from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
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

const APPLIES_TO_OPTIONS = ['all', 'platform', 'simulator', 'both', 'admin']
const EDITABLE_APPLIES_TO_OPTIONS = ['platform', 'simulator', 'both', 'admin']
const EMPTY_FORM = {
  flag_key: '',
  flag_name: '',
  description: '',
  applies_to: 'platform',
}

export default function FeatureFlagsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal: confirmModal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [appliesToFilter, setAppliesToFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingFlag, setEditingFlag] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const opts = appliesToFilter === 'all' ? {} : { appliesTo: appliesToFilter }
    const { data, error } = await fetchFeatureFlags(opts)
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [appliesToFilter])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => (
      String(row.flag_key || '').toLowerCase().includes(term)
      || String(row.flag_name || '').toLowerCase().includes(term)
      || String(row.description || '').toLowerCase().includes(term)
      || String(row.applies_to || '').toLowerCase().includes(term)
    ))
  }, [rows, search])

  const handleToggle = async (flagId) => {
    setBusyId(flagId)
    const { error } = await toggleFeatureFlag(flagId)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Feature flag toggled.')
    await loadData()
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.flag_key.trim() || !createForm.flag_name.trim()) {
      showError('Flag key and name are required.')
      return
    }
    setSaving(true)
    const { error } = await createFeatureFlag({
      flag_key: createForm.flag_key.trim(),
      flag_name: createForm.flag_name.trim(),
      description: createForm.description.trim(),
      applies_to: createForm.applies_to,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Feature flag created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const openEditModal = (flag) => {
    setEditingFlag(flag)
    setEditTab('details')
    setEditForm({
      flag_key: flag.flag_key || '',
      flag_name: flag.flag_name || '',
      description: flag.description || '',
      applies_to: flag.applies_to || 'platform',
    })
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    const db = getAdminDb()
    if (!db) {
      showError('Database not configured')
      return
    }
    setSaving(true)
    const { error } = await db
      .from('feature_flags')
      .update({
        flag_key: editForm.flag_key.trim(),
        flag_name: editForm.flag_name.trim(),
        description: editForm.description.trim() || null,
        applies_to: editForm.applies_to,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingFlag.id)
      .select()
      .single()
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Feature flag updated.')
    setEditingFlag(null)
    await loadData()
  }

  const handleDelete = (flag) => {
    confirm({
      title: 'Delete feature flag',
      message: `Delete ${flag.flag_key}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await deleteFeatureFlag(flag.id)
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Feature flag deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading feature flags..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Feature Flags</h1>
          <p className="text-sm text-gray-500">Toggle, create, edit, and retire runtime flags per target system.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search flag key, name, or description..." />
          <select
            value={appliesToFilter}
            onChange={(e) => setAppliesToFilter(e.target.value)}
            className="rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
          >
            {APPLIES_TO_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All targets' : option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Flag
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No feature flags found" description="Try changing filters or create a new flag." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3">Applies To</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((flag) => {
                const isBusy = busyId === flag.id
                return (
                  <tr key={flag.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-100">{flag.flag_name || flag.flag_key}</p>
                      <p className="text-xs text-gray-500">{flag.flag_key}</p>
                      {flag.description && <p className="mt-1 text-xs text-gray-400">{flag.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{flag.applies_to || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${flag.is_enabled ? 'border-green-700 bg-green-900/40 text-green-300' : 'border-gray-600 bg-gray-800 text-gray-300'}`}>
                        {flag.is_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{formatDate(flag.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggle(flag.id)}
                          className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
                        >
                          {isBusy ? 'Working...' : 'Toggle'}
                        </button>
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEditModal(flag)} />
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(flag)} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Feature Flag" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2">
          <AdminField label="Flag Key" required>
            <input
              value={createForm.flag_key}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, flag_key: e.target.value }))}
              className={inputClass}
              placeholder="new_feature_key"
            />
          </AdminField>
          <AdminField label="Flag Name" required>
            <input
              value={createForm.flag_name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, flag_name: e.target.value }))}
              className={inputClass}
              placeholder="New Feature"
            />
          </AdminField>
          <AdminField label="Description">
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Applies To">
            <select
              value={createForm.applies_to}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, applies_to: e.target.value }))}
              className={inputClass}
            >
              {EDITABLE_APPLIES_TO_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingFlag)} title="Edit Feature Flag" onClose={() => setEditingFlag(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingFlag && (
          <AuditDetailsPanel description="How this flag is classified and when it last changed.">
            <AuditCard title="Identity" description="How this flag is labelled.">
              <AuditField label="Flag key" value={editingFlag.flag_key} />
              <AuditField label="Flag name" value={editingFlag.flag_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this flag applies.">
              <AuditField label="Applies to" value={editingFlag.applies_to} />
              <AuditField label="Enabled" value={editingFlag.is_enabled ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this flag was created and last changed.">
              <AuditTimestampPair dateLabel="Created at" value={editingFlag.created_at} />
              <AuditTimestampPair dateLabel="Last updated" value={editingFlag.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2">
          <AdminField label="Flag Key" required>
            <input
              value={editForm.flag_key}
              onChange={(e) => setEditForm((prev) => ({ ...prev, flag_key: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Flag Name" required>
            <input
              value={editForm.flag_name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, flag_name: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Description">
            <textarea
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              className={inputClass}
            />
          </AdminField>
          <AdminField label="Applies To">
            <select
              value={editForm.applies_to}
              onChange={(e) => setEditForm((prev) => ({ ...prev, applies_to: e.target.value }))}
              className={inputClass}
            >
              {EDITABLE_APPLIES_TO_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingFlag(null)} className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {confirmModal}
    </div>
  )
}
