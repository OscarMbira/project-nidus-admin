import { useEffect, useState } from 'react'
import {
  LIFECYCLE_PILOT_TABLES,
  PermissionGate,
  fetchAdminUsers,
  fetchLifecycleAuthorisers,
  upsertRecordAuthoriser,
} from '@nidus-admin/shared'
import { AdminField, AdminForm, AdminTable, EmptyState, LoadingState, SearchableSelect, inputClass, useToast } from '@nidus-admin/ui'

const EMPTY = {
  table_name: 'subscription_plans',
  authoriser_admin_user_id: '',
  approval_level: 1,
  role_label: '',
  is_active: true,
}

export default function AuthorisersPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [admins, setAdmins] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const [authRes, usersRes] = await Promise.all([
      fetchLifecycleAuthorisers(),
      fetchAdminUsers(),
    ])
    if (authRes.error) showError(authRes.error.message || String(authRes.error))
    if (usersRes.error) showError(usersRes.error.message || String(usersRes.error))
    setRows(authRes.data || [])
    setAdmins(usersRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const adminOptions = admins.map((u) => ({
    value: u.id,
    label: u.full_name || u.email || u.id,
  }))

  const save = async (event) => {
    event.preventDefault()
    if (!form.authoriser_admin_user_id) {
      showError('Select an admin user')
      return
    }
    setSaving(true)
    const { error } = await upsertRecordAuthoriser(form)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Authoriser saved')
    setForm(EMPTY)
    load()
  }

  if (loading) return <LoadingState message="Loading authorisers..." />

  return (
    <PermissionGate permission="lifecycle.configure">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Record Authorisers</h1>
          <p className="text-sm text-gray-500">Assign admin users who can validate unauthorised records per table.</p>
        </div>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-200">Add / update authoriser</h2>
          <AdminForm onSubmit={save}>
            <div className="grid gap-4 md:grid-cols-2">
              <AdminField label="Table">
                <select className={inputClass} value={form.table_name} onChange={(e) => setForm((f) => ({ ...f, table_name: e.target.value }))}>
                  {LIFECYCLE_PILOT_TABLES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Authoriser">
                <SearchableSelect
                  options={adminOptions}
                  value={form.authoriser_admin_user_id}
                  onChange={(value) => setForm((f) => ({ ...f, authoriser_admin_user_id: value }))}
                  placeholder="Select admin user"
                />
              </AdminField>
              <AdminField label="Approval level">
                <input type="number" min={1} className={inputClass} value={form.approval_level} onChange={(e) => setForm((f) => ({ ...f, approval_level: Number(e.target.value) }))} />
              </AdminField>
              <AdminField label="Role label">
                <input className={inputClass} value={form.role_label} onChange={(e) => setForm((f) => ({ ...f, role_label: e.target.value }))} />
              </AdminField>
            </div>
            <button type="submit" disabled={saving} className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save authoriser'}
            </button>
          </AdminForm>
        </section>

        <AdminTable
          columns={[
            { key: 'table_name', label: 'Table' },
            { key: 'authoriser_admin_user_id', label: 'Admin user' },
            { key: 'approval_level', label: 'Level' },
            { key: 'role_label', label: 'Role' },
            { key: 'is_active', label: 'Active', render: (v) => (v ? 'Yes' : 'No') },
          ]}
          rows={rows}
          emptyMessage="No authorisers assigned — all tables use zero-authoriser bypass."
        />
      </div>
    </PermissionGate>
  )
}
