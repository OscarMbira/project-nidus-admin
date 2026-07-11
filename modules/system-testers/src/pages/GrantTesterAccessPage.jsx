import { useEffect, useState } from 'react'
import {
  assignTesterToProject,
  fetchAccounts,
  fetchAllProjects,
  fetchSystemSettings,
  fetchTesterCapacity,
  grantTesterAccess,
  searchUsersForTesterGrant,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'
import TesterCapacityBar from '../components/TesterCapacityBar.jsx'
import { ORG_ROLES, PROJECT_ROLES, toError } from '../utils/testerUi.js'

export default function GrantTesterAccessPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [capacity, setCapacity] = useState({ activeCount: 0, maxTesters: 100 })
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [projects, setProjects] = useState([])
  const [form, setForm] = useState({
    systems: ['platform'],
    moratorium_months: 10,
    grant_note: '',
    assign_now: false,
    account_id: '',
    project_id: '',
    org_role: 'team_member',
    project_role: 'team_member',
  })
  const [busy, setBusy] = useState(false)

  const atLimit = capacity.activeCount >= capacity.maxTesters

  useEffect(() => {
    ;(async () => {
      const [capRes, settingsRes, accRes, projRes] = await Promise.all([
        fetchTesterCapacity(),
        fetchSystemSettings(),
        fetchAccounts(),
        fetchAllProjects(),
      ])
      if (capRes.data) setCapacity(capRes.data)
      const months = settingsRes.data?.find((s) => s.setting_key === 'testers.default_moratorium_months')
      setForm((f) => ({ ...f, moratorium_months: Number(months?.setting_value || 10) }))
      setAccounts(accRes.data || [])
      setProjects(projRes.data || [])
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!search.trim()) {
        setUsers([])
        return
      }
      const { data } = await searchUsersForTesterGrant(search)
      setUsers(data || [])
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const accountProjects = projects.filter((p) => p.account_id === form.account_id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedUser) {
      showError('Select a user first.')
      return
    }
    if (!form.systems.length) {
      showError('Select at least one system.')
      return
    }
    setBusy(true)
    const { data: testerId, error } = await grantTesterAccess({
      user_id: selectedUser.id,
      systems: form.systems,
      moratorium_months: Number(form.moratorium_months),
      grant_note: form.grant_note,
    })
    if (error) {
      setBusy(false)
      showError(toError(error))
      return
    }
    if (form.assign_now && form.account_id && testerId) {
      await assignTesterToProject({
        tester_id: testerId,
        account_id: form.account_id,
        project_id: form.project_id || null,
        org_role: form.org_role,
        project_role: form.project_role,
      })
    }
    setBusy(false)
    showSuccess('Tester access granted.')
    setSelectedUser(null)
    setSearch('')
    const capRes = await fetchTesterCapacity()
    if (capRes.data) setCapacity(capRes.data)
  }

  if (loading) return <LoadingState message="Loading..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Grant Direct Access</h1>
        <p className="text-sm text-gray-500">Grant tester access without an application (e.g. internal pilots).</p>
      </div>

      <TesterCapacityBar activeCount={capacity.activeCount} maxTesters={capacity.maxTesters} />

      <AdminForm onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-6">
        <AdminField label="Search user (email or name)">
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
        </AdminField>
        {users.length > 0 && !selectedUser && (
          <ul className="rounded border border-gray-700 bg-gray-800">
            {users.map((u) => (
              <li key={u.id}>
                <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-gray-700" onClick={() => setSelectedUser(u)}>
                  {u.full_name || u.email} — {u.email}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedUser && (
          <p className="text-sm text-emerald-400">
            Selected: {selectedUser.full_name || selectedUser.email}
            <button type="button" className="ml-2 text-gray-400 underline" onClick={() => setSelectedUser(null)}>Change</button>
          </p>
        )}

        <AdminField label="Target systems">
          {['platform', 'simulator'].map((sys) => (
            <label key={sys} className="mr-4 inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={form.systems.includes(sys)}
                onChange={(e) => {
                  const systems = e.target.checked
                    ? [...form.systems, sys]
                    : form.systems.filter((s) => s !== sys)
                  setForm({ ...form, systems })
                }}
              />
              {sys}
            </label>
          ))}
        </AdminField>

        <AdminField label="Moratorium months">
          <input type="number" min={1} max={120} className={inputClass} value={form.moratorium_months} onChange={(e) => setForm({ ...form, moratorium_months: e.target.value })} />
        </AdminField>

        <AdminField label="Grant note">
          <textarea className={inputClass} rows={2} value={form.grant_note} onChange={(e) => setForm({ ...form, grant_note: e.target.value })} />
        </AdminField>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.assign_now} onChange={(e) => setForm({ ...form, assign_now: e.target.checked })} />
          Assign to org/project immediately
        </label>

        {form.assign_now && (
          <>
            <AdminField label="Organisation">
              <select className={inputClass} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, project_id: '' })}>
                <option value="">Select account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.account_name}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Project (optional)">
              <select className={inputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                <option value="">Org-level only</option>
                {accountProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_name}</option>
                ))}
              </select>
            </AdminField>
            <AdminField label="Org role">
              <select className={inputClass} value={form.org_role} onChange={(e) => setForm({ ...form, org_role: e.target.value })}>
                {ORG_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </AdminField>
            <AdminField label="Project role">
              <select className={inputClass} value={form.project_role} onChange={(e) => setForm({ ...form, project_role: e.target.value })}>
                {PROJECT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </AdminField>
          </>
        )}

        <button type="submit" disabled={busy || atLimit} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">
          {atLimit ? 'At tester limit' : 'Grant access'}
        </button>
      </AdminForm>

      {!accounts.length && <EmptyState title="No organisations" description="Create organisations before assigning testers." />}
    </div>
  )
}
