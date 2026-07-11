import { useEffect, useState } from 'react'
import {
  LIFECYCLE_PILOT_TABLES,
  PermissionGate,
  fetchArchiveConfigs,
  upsertArchiveConfig,
} from '@nidus-admin/shared'
import { AdminField, AdminForm, AdminTable, EmptyState, LoadingState, inputClass, useToast } from '@nidus-admin/ui'

const EMPTY = {
  table_name: 'subscription_plans',
  history_retention_days: '',
  auto_archive_enabled: false,
  archive_retention_years: '',
  override_reason: '',
  regulatory_reference: '',
  effective_from: '',
  effective_until: '',
  is_active: true,
}

export default function ArchiveRetentionRulesPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchArchiveConfigs()
    if (error) showError(error.message || String(error))
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const edit = (row) => {
    setForm({
      table_name: row.table_name,
      history_retention_days: row.history_retention_days ?? '',
      auto_archive_enabled: row.auto_archive_enabled ?? false,
      archive_retention_years: row.archive_retention_years ?? '',
      override_reason: row.override_reason || '',
      regulatory_reference: row.regulatory_reference || '',
      effective_from: row.effective_from || '',
      effective_until: row.effective_until || '',
      is_active: row.is_active,
    })
  }

  const save = async (event) => {
    event.preventDefault()
    if (!form.override_reason.trim()) {
      showError('Override reason is required')
      return
    }
    setSaving(true)
    const { error } = await upsertArchiveConfig({
      ...form,
      history_retention_days: form.history_retention_days === '' ? null : Number(form.history_retention_days),
      archive_retention_years: form.archive_retention_years === '' ? null : Number(form.archive_retention_years),
      effective_from: form.effective_from || null,
      effective_until: form.effective_until || null,
    })
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Archive retention rule saved')
    setForm(EMPTY)
    load()
  }

  if (loading) return <LoadingState message="Loading archive rules..." />

  return (
    <PermissionGate permission="lifecycle.configure">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Archive Retention Rules</h1>
          <p className="text-sm text-gray-500">Regulatory overrides for history → archive retention per table.</p>
        </div>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-200">Rule editor</h2>
          <AdminForm onSubmit={save}>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="Table">
                <select className={inputClass} value={form.table_name} onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}>
                  {LIFECYCLE_PILOT_TABLES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Override reason">
                <input className={inputClass} value={form.override_reason} onChange={(e) => setForm((f) => ({ ...f, override_reason: e.target.value }))} required />
              </AdminField>
              <AdminField label="History retention (days)">
                <input className={inputClass} value={form.history_retention_days} onChange={(e) => setForm((f) => ({ ...f, history_retention_days: e.target.value }))} />
              </AdminField>
              <AdminField label="Archive retention (years)">
                <input className={inputClass} value={form.archive_retention_years} onChange={(e) => setForm((f) => ({ ...f, archive_retention_years: e.target.value }))} />
              </AdminField>
              <AdminField label="Regulatory reference">
                <input className={inputClass} value={form.regulatory_reference} onChange={(e) => setForm((f) => ({ ...f, regulatory_reference: e.target.value }))} />
              </AdminField>
              <AdminField label="Auto-archive">
                <input type="checkbox" checked={form.auto_archive_enabled} onChange={(e) => setForm((f) => ({ ...f, auto_archive_enabled: e.target.checked }))} />
              </AdminField>
            </div>
            <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save rule'}
            </button>
          </AdminForm>
        </section>

        {rows.length === 0 ? (
          <EmptyState title="No archive overrides" description="Default table retention from lifecycle configuration applies." />
        ) : (
          <AdminTable
            columns={[
              { key: 'table_name', label: 'Table' },
              { key: 'override_reason', label: 'Reason' },
              { key: 'history_retention_days', label: 'History days' },
              { key: 'auto_archive_enabled', label: 'Auto', render: (v) => (v ? 'Yes' : 'No') },
            ]}
            rows={rows}
            onRowClick={edit}
          />
        )}
      </div>
    </PermissionGate>
  )
}
