import { useEffect, useMemo, useState } from 'react'
import {
  createApiKey,
  fetchApiKeys,
  formatDate,
  revokeApiKey,
  updateApiKey,
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

const EMPTY_CREATE_FORM = {
  key_name: '',
  permissions: '',
  target_system: 'all',
  rate_limit_per_minute: '60',
  expires_at: '',
}

function parseListInput(value) {
  return String(value || '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function copyText(value, showSuccess) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    showSuccess('Copied to clipboard.')
  } catch {
    showSuccess('Copy failed — select text manually.')
  }
}

function rpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

export default function APIKeyListPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [editingKey, setEditingKey] = useState(null)
  const [editForm, setEditForm] = useState({ key_name: '', permissions: '', rate_limit_per_minute: '60', expires_at: '' })
  const [createdKey, setCreatedKey] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchApiKeys()
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
    return rows.filter((row) => [row.key_name, row.key_prefix, ...(row.permissions || [])]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const openEdit = (apiKey) => {
    setEditingKey(apiKey)
    setEditForm({
      key_name: apiKey.key_name || '',
      permissions: (apiKey.permissions || []).join(', '),
      rate_limit_per_minute: String(apiKey.rate_limit_per_minute ?? 60),
      expires_at: apiKey.expires_at ? apiKey.expires_at.slice(0, 16) : '',
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.key_name.trim()) {
      showError('Key name is required.')
      return
    }
    const keyName = createForm.key_name.trim()
    setSaving(true)
    const { data, error } = await createApiKey({
      key_name: keyName,
      permissions: parseListInput(createForm.permissions),
      target_system: createForm.target_system,
      rate_limit_per_minute: Number.parseInt(createForm.rate_limit_per_minute, 10) || 60,
      expires_at: createForm.expires_at ? new Date(createForm.expires_at).toISOString() : null,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    const row = rpcRow(data)
    setShowCreate(false)
    setCreateForm(EMPTY_CREATE_FORM)
    setCreatedKey({
      key_name: keyName,
      plain_api_key: row?.plain_api_key || '',
      key_prefix: row?.key_prefix || '',
    })
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingKey) return
    if (!editForm.key_name.trim()) {
      showError('Key name is required.')
      return
    }
    setSaving(true)
    const { error } = await updateApiKey(editingKey.id, {
      key_name: editForm.key_name.trim(),
      permissions: parseListInput(editForm.permissions),
      rate_limit_per_minute: Number.parseInt(editForm.rate_limit_per_minute, 10) || 60,
      expires_at: editForm.expires_at ? new Date(editForm.expires_at).toISOString() : null,
    })
    setSaving(false)
    if (error) {
      showError(error)
      return
    }
    showSuccess('API key updated.')
    setEditingKey(null)
    await loadData()
  }

  const handleRevoke = (apiKey) => {
    confirm({
      title: `Revoke ${apiKey.key_name}?`,
      message: 'This key will stop working immediately. This action cannot be undone.',
      confirmLabel: 'Revoke',
      danger: true,
      onConfirm: async () => {
        setBusyId(apiKey.id)
        const { error } = await revokeApiKey(apiKey.id)
        setBusyId('')
        if (error) {
          showError(error)
          return
        }
        showSuccess('API key revoked.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading API keys..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">API Keys</h1>
          <p className="text-sm text-gray-500">Manage integration keys. Only the prefix is stored for display after creation.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, prefix, permissions..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New API Key
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No API keys found" description="Create an API key or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Prefix</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Rate/min</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Used</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((apiKey) => (
                <tr key={apiKey.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{apiKey.key_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{apiKey.key_prefix}…</td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs text-gray-400" title={(apiKey.permissions || []).join(', ')}>
                    {(apiKey.permissions || []).length ? (apiKey.permissions || []).join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">{apiKey.target_system || 'all'}</td>
                  <td className="px-4 py-3">{apiKey.rate_limit_per_minute ?? 60}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={apiKey.is_active ? 'active' : 'revoked'} variant={apiKey.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(apiKey.last_used_at)}</td>
                  <td className="px-4 py-3 text-gray-400">{apiKey.expires_at ? formatDate(apiKey.expires_at) : 'Never'}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" disabled={!apiKey.is_active} onClick={() => openEdit(apiKey)} className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40">Edit</button>
                      <button type="button" disabled={!apiKey.is_active || busyId === apiKey.id} onClick={() => handleRevoke(apiKey)} className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-40">Revoke</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create API Key" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          <AdminField label="Key Name" required>
            <input className={inputClass} value={createForm.key_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, key_name: e.target.value }))} placeholder="Mobile App Integration" />
          </AdminField>
          <AdminField label="Permissions">
            <textarea rows={3} className={inputClass} value={createForm.permissions} onChange={(e) => setCreateForm((prev) => ({ ...prev, permissions: e.target.value }))} placeholder="users.read, subscriptions.read" />
            <p className="mt-1 text-xs text-gray-500">Comma-separated scopes, e.g. users.read, subscriptions.read</p>
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Target System">
              <select className={inputClass} value={createForm.target_system} onChange={(e) => setCreateForm((prev) => ({ ...prev, target_system: e.target.value }))}>
                <option value="all">All</option>
                <option value="platform">Platform</option>
                <option value="simulator">Simulator</option>
              </select>
            </AdminField>
            <AdminField label="Rate Limit (per minute)">
              <input type="number" min={1} className={inputClass} value={createForm.rate_limit_per_minute} onChange={(e) => setCreateForm((prev) => ({ ...prev, rate_limit_per_minute: e.target.value }))} />
            </AdminField>
          </div>
          <AdminField label="Expires At">
            <input type="datetime-local" className={inputClass} value={createForm.expires_at} onChange={(e) => setCreateForm((prev) => ({ ...prev, expires_at: e.target.value }))} />
            <p className="mt-1 text-xs text-gray-500">Leave blank for no expiry</p>
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingKey)} title={`Edit ${editingKey?.key_name || 'API Key'}`} onClose={() => setEditingKey(null)}>
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          <AdminField label="Key Name" required>
            <input className={inputClass} value={editForm.key_name} onChange={(e) => setEditForm((prev) => ({ ...prev, key_name: e.target.value }))} />
          </AdminField>
          <AdminField label="Permissions">
            <textarea rows={3} className={inputClass} value={editForm.permissions} onChange={(e) => setEditForm((prev) => ({ ...prev, permissions: e.target.value }))} />
            <p className="mt-1 text-xs text-gray-500">Comma-separated scopes</p>
          </AdminField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Rate Limit (per minute)">
              <input type="number" min={1} className={inputClass} value={editForm.rate_limit_per_minute} onChange={(e) => setEditForm((prev) => ({ ...prev, rate_limit_per_minute: e.target.value }))} />
            </AdminField>
            <AdminField label="Expires At">
              <input type="datetime-local" className={inputClass} value={editForm.expires_at} onChange={(e) => setEditForm((prev) => ({ ...prev, expires_at: e.target.value }))} />
            </AdminField>
          </div>
          <p className="text-xs text-gray-500">Prefix: <span className="font-mono text-gray-400">{editingKey?.key_prefix}…</span></p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingKey(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(createdKey)} title="API Key Created" onClose={() => setCreatedKey(null)}>
        <div className="mt-2 space-y-4">
          <div className="rounded border border-amber-700 bg-amber-900/20 p-3 text-sm text-amber-200">
            Copy this key now. It will not be shown again.
          </div>
          <AdminField label={`Key for ${createdKey?.key_name || 'integration'}`}>
            <div className="flex gap-2">
              <input readOnly className={`${inputClass} font-mono text-xs`} value={createdKey?.plain_api_key || ''} />
              <button type="button" onClick={() => copyText(createdKey?.plain_api_key, showSuccess)} className="shrink-0 rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                Copy
              </button>
            </div>
          </AdminField>
          {createdKey?.key_prefix && (
            <p className="text-xs text-gray-500">Prefix for identification: <span className="font-mono text-gray-400">{createdKey.key_prefix}</span></p>
          )}
          <div className="flex justify-end">
            <button type="button" onClick={() => setCreatedKey(null)} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">
              Done
            </button>
          </div>
        </div>
      </AdminModal>

      {modal}
    </div>
  )
}
