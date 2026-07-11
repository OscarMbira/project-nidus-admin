import { useEffect, useState } from 'react'
import {
  LIFECYCLE_PILOT_TABLES,
  PermissionGate,
  fetchLifecycleConfigs,
  upsertLifecycleConfig,
} from '@nidus-admin/shared'
import { AdminField, AdminForm, EmptyState, LoadingState, inputClass, useToast } from '@nidus-admin/ui'

const EMPTY = {
  table_name: 'subscription_plans',
  approval_enabled: true,
  level_approval_mode: 'any',
  history_retention_days: '',
  auto_archive_enabled: false,
  archive_retention_years: '',
  is_active: true,
}

export default function LifecycleConfigurationPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [configs, setConfigs] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchLifecycleConfigs()
    if (error) showError(error.message || String(error))
    setConfigs(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const edit = (row) => {
    setForm({
      table_name: row.table_name,
      approval_enabled: row.approval_enabled,
      level_approval_mode: row.level_approval_mode || 'any',
      history_retention_days: row.history_retention_days ?? '',
      auto_archive_enabled: row.auto_archive_enabled,
      archive_retention_years: row.archive_retention_years ?? '',
      is_active: row.is_active,
    })
  }

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    const { error } = await upsertLifecycleConfig({
      ...form,
      history_retention_days: form.history_retention_days === '' ? null : Number(form.history_retention_days),
      archive_retention_years: form.archive_retention_years === '' ? null : Number(form.archive_retention_years),
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Lifecycle configuration saved')
    setForm(EMPTY)
    load()
  }

  if (loading) return <LoadingState message="Loading lifecycle configuration..." />

  return (
    <PermissionGate permission="lifecycle.configure">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Lifecycle Configuration</h1>
          <p className="text-sm text-gray-500">Per-table approval and retention settings. Zero authorisers = immediate live (bypass).</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-200">Configured tables</h2>
            {configs.length === 0 ? (
              <EmptyState title="No config rows" description="Seed v101 or save a configuration below." />
            ) : (
              <ul className="space-y-2">
                {configs.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => edit(row)}
                      className="w-full rounded-lg border border-gray-700 px-3 py-2 text-left text-sm text-gray-200 hover:border-violet-500"
                    >
                      <span className="font-medium">{row.table_name}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {row.approval_enabled ? 'approval on' : 'approval off'} · {row.level_approval_mode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-200">Edit configuration</h2>
            <AdminForm onSubmit={save}>
              <AdminField label="Table">
                <select className={inputClass} value={form.table_name} onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}>
                  {LIFECYCLE_PILOT_TABLES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Approval enabled">
                <input type="checkbox" checked={form.approval_enabled} onChange={(e) => setForm((f) => ({ ...f, approval_enabled: e.target.checked }))} />
              </AdminField>
              <AdminField label="Level mode">
                <select className={inputClass} value={form.level_approval_mode} onChange={(e) => setForm((f) => ({ ...f, level_approval_mode: e.target.value }))}>
                  <option value="any">Any authoriser per level</option>
                  <option value="all">All authorisers per level</option>
                </select>
              </AdminField>
              <AdminField label="History retention (days)">
                <input className={inputClass} value={form.history_retention_days} onChange={(e) => setForm((f) => ({ ...f, history_retention_days: e.target.value }))} />
              </AdminField>
              <AdminField label="Auto-archive enabled">
                <input type="checkbox" checked={form.auto_archive_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_archive_enabled: e.target.checked }))} />
              </AdminField>
              <AdminField label="Archive retention (years)">
                <input className={inputClass} value={form.archive_retention_years} onChange={(e) => setForm((f) => ({ ...f, archive_retention_years: e.target.value }))} />
              </AdminField>
              <button type="submit" disabled={saving} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save configuration'}
              </button>
            </AdminForm>
          </section>
        </div>
      </div>
    </PermissionGate>
  )
}
