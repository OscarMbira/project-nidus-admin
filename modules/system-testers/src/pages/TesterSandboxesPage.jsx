import { useEffect, useState } from 'react'
import {
  createTesterSandbox,
  fetchAccountMembers,
  fetchAccounts,
  fetchSystemSettings,
  fetchTesterOrgSandboxes,
  formatDate,
  provisionSandboxMembers,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'
import { toError } from '../utils/testerUi.js'

export default function TesterSandboxesPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [sandboxes, setSandboxes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [membersSandbox, setMembersSandbox] = useState(null)
  const [members, setMembers] = useState([])
  const [form, setForm] = useState({
    account_id: '',
    sandbox_name: '',
    moratorium_months: 10,
    target_system: 'platform',
    notes: '',
  })
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [sRes, accRes, settingsRes] = await Promise.all([
      fetchTesterOrgSandboxes(),
      fetchAccounts(),
      fetchSystemSettings(),
    ])
    setSandboxes(sRes.data || [])
    setAccounts(accRes.data || [])
    const months = settingsRes.data?.find((s) => s.setting_key === 'testers.default_moratorium_months')
    setForm((f) => ({ ...f, moratorium_months: Number(months?.setting_value || 10) }))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const handleCreate = async (e) => {
    e.preventDefault()
    const { error } = await createTesterSandbox(form)
    if (error) {
      showError(toError(error))
      return
    }
    showSuccess('Sandbox created.')
    setShowCreate(false)
    await loadData()
  }

  const viewMembers = async (sandbox) => {
    setMembersSandbox(sandbox)
    const { data, error } = await fetchAccountMembers(sandbox.account_id)
    if (error) showError(toError(error))
    setMembers(data || [])
  }

  const handleProvision = async (sandboxId) => {
    setBusyId(sandboxId)
    const { data, error } = await provisionSandboxMembers(sandboxId)
    setBusyId('')
    if (error) {
      showError(toError(error))
      return
    }
    showSuccess(`Provisioned ${data} member(s).`)
    await loadData()
  }

  if (loading) return <LoadingState message="Loading sandboxes..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Sandbox Orgs</h1>
          <p className="text-sm text-gray-500">Full team project runs without individual subscriptions.</p>
        </div>
        <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => setShowCreate(true)}>
          Create sandbox
        </button>
      </div>

      {!sandboxes.length ? (
        <EmptyState title="No sandboxes" description="Link an organisation as a tester sandbox for team runs." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3">Moratorium end</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sandboxes.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{row.sandbox_name || '—'}</td>
                  <td className="px-4 py-3">{accountById[row.account_id]?.account_name || row.account_id}</td>
                  <td className="px-4 py-3">{row.target_system}</td>
                  <td className="px-4 py-3">{formatDate(row.moratorium_end)}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button type="button" className="text-xs text-blue-400" onClick={() => viewMembers(row)}>Members</button>
                    <button
                      type="button"
                      disabled={busyId === row.id || row.status !== 'active'}
                      className="text-xs text-emerald-400 disabled:opacity-40"
                      onClick={() => handleProvision(row.id)}
                    >
                      Bulk provision
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} onClose={() => setShowCreate(false)} title="Create sandbox">
        <AdminForm onSubmit={handleCreate}>
          <AdminField label="Organisation">
            <select className={inputClass} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} required>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </AdminField>
          <AdminField label="Sandbox name">
            <input className={inputClass} value={form.sandbox_name} onChange={(e) => setForm({ ...form, sandbox_name: e.target.value })} />
          </AdminField>
          <AdminField label="Target system">
            <select className={inputClass} value={form.target_system} onChange={(e) => setForm({ ...form, target_system: e.target.value })}>
              <option value="platform">platform</option>
              <option value="simulator">simulator</option>
              <option value="both">both</option>
            </select>
          </AdminField>
          <AdminField label="Moratorium months">
            <input type="number" min={1} max={120} className={inputClass} value={form.moratorium_months} onChange={(e) => setForm({ ...form, moratorium_months: e.target.value })} />
          </AdminField>
          <AdminField label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </AdminField>
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Create</button>
        </AdminForm>
      </AdminModal>

      <AdminModal open={!!membersSandbox} onClose={() => setMembersSandbox(null)} title="Sandbox members">
        {!members.length ? (
          <p className="text-sm text-gray-400">No members found for this organisation.</p>
        ) : (
          <ul className="space-y-2 text-sm text-gray-300">
            {members.map((m) => (
              <li key={m.id} className="flex justify-between border-b border-gray-800 py-2">
                <span>{m.full_name || m.email}</span>
                <span className="text-gray-500">{m.member_role}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminModal>
    </div>
  )
}
