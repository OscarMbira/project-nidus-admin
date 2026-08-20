import { useEffect, useMemo, useState } from 'react'
import { fetchSystemSettings, formatDate, updateSystemSetting } from '@nidus-admin/shared'
import {
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  SearchBar,
  useToast,
} from '@nidus-admin/ui'

const typeInputClass = 'w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none'

function coerceBoolean(value) {
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function normalizeValueByType(raw, type) {
  if (raw == null) return ''
  const value = String(raw)
  if (type === 'boolean') return coerceBoolean(raw)
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return value
}

export default function SystemSettingsPage() {
  const { showSuccess, showError } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState({})

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchSystemSettings()
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
  }, [])

  const groupedSettings = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = !term
      ? rows
      : rows.filter((row) => (
        String(row.setting_key || '').toLowerCase().includes(term)
        || String(row.description || '').toLowerCase().includes(term)
        || String(row.category || '').toLowerCase().includes(term)
      ))

    const groups = new Map()
    for (const row of filtered) {
      const category = row.category || 'uncategorized'
      if (!groups.has(category)) groups.set(category, [])
      groups.get(category).push(row)
    }

    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [rows, search])

  const startEdit = (setting) => {
    setEditing((prev) => ({
      ...prev,
      [setting.setting_key]: normalizeValueByType(setting.setting_value, setting.setting_type),
    }))
  }

  const cancelEdit = (settingKey) => {
    setEditing((prev) => {
      const next = { ...prev }
      delete next[settingKey]
      return next
    })
  }

  const handleSave = async (setting) => {
    const draft = editing[setting.setting_key]
    const value = setting.setting_type === 'boolean'
      ? (draft ? 'true' : 'false')
      : String(draft ?? '')

    setSavingKey(setting.setting_key)
    const { error } = await updateSystemSetting(setting.setting_key, value)
    setSavingKey('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(`Updated ${setting.setting_key}`)
    cancelEdit(setting.setting_key)
    await loadData()
  }

  const renderInput = (setting) => {
    const key = setting.setting_key
    const type = setting.setting_type || 'text'
    const value = editing[key]

    if (type === 'boolean') {
      return (
        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.checked }))}
            className="h-4 w-4 accent-blue-500"
          />
          Enabled
        </label>
      )
    }

    if (type === 'json') {
      return (
        <textarea
          rows={5}
          value={String(value ?? '')}
          onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
          className={typeInputClass}
        />
      )
    }

    const inputType = type === 'integer' || type === 'number'
      ? 'number'
      : type === 'email'
        ? 'email'
        : type === 'url'
          ? 'url'
          : 'text'

    return (
      <input
        type={inputType}
        value={String(value ?? '')}
        onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
        className={typeInputClass}
      />
    )
  }

  if (loading) return <LoadingState message="Loading system settings..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">System Settings</h1>
          <p className="text-sm text-gray-500">Grouped by category with inline, type-aware editing.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search settings by key, category, or description..." />
      </div>

      {!groupedSettings.length ? (
        <EmptyState title="No settings found" description="Try clearing filters or create settings via RPC update." />
      ) : (
        <div className="space-y-5">
          {groupedSettings.map(([category, settings]) => (
            <section key={category} className="rounded-lg border border-gray-700 bg-gray-900">
              <header className="border-b border-gray-800 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">{category}</p>
              </header>
              <div className="divide-y divide-gray-800">
                {settings.map((setting) => {
                  const isEditing = Object.prototype.hasOwnProperty.call(editing, setting.setting_key)
                  const isSensitive = Boolean(setting.is_sensitive)
                  const maskedValue = isSensitive ? '••••••••' : String(setting.setting_value ?? '')
                  const isSaving = savingKey === setting.setting_key
                  return (
                    <div key={setting.id || setting.setting_key} className="space-y-3 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-100">{setting.setting_key}</p>
                          <p className="text-xs text-gray-500">{setting.description || 'No description provided.'}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Type: {setting.setting_type || 'text'} · Updated: {formatDate(setting.updated_at)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSave(setting)}
                                className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-60"
                              >
                                {isSaving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => cancelEdit(setting.setting_key)}
                                className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <AdminIconActionButton variant="edit" label="Edit" onClick={() => startEdit(setting)} />
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div>{renderInput(setting)}</div>
                      ) : (
                        <div className="rounded border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
                          {maskedValue || '—'}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
