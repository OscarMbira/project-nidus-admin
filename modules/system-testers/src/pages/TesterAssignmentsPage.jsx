import { useEffect, useState } from 'react'
import {
  assignTesterToProject,
  enrichTestersWithUsers,
  fetchAccounts,
  fetchAllProjects,
  fetchSystemTesters,
  fetchTesterProjectAssignments,
  formatDate,
  revokeTesterAssignment,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { ORG_ROLES, PROJECT_ROLES, toError } from '../utils/testerUi.js'

export default function TesterAssignmentsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [testers, setTesters] = useState([])
  const [accounts, setAccounts] = useState([])
  const [projects, setProjects] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [form, setForm] = useState({
    tester_ids: [],
    tester_id: '',
    account_id: '',
    project_id: '',
    org_role: 'team_member',
    project_role: 'team_member',
    notes: '',
  })
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [aRes, tRes, accRes, pRes] = await Promise.all([
      fetchTesterProjectAssignments({ is_active: true }),
      fetchSystemTesters({ status: 'active' }),
      fetchAccounts(),
      fetchAllProjects(),
    ])
    const enriched = await enrichTestersWithUsers(tRes.data || [])
    setAssignments(aRes.data || [])
    setTesters(enriched)
    setAccounts(accRes.data || [])
    setProjects(pRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const accountProjects = projects.filter((p) => p.account_id === form.account_id)
  const testerById = Object.fromEntries(testers.map((t) => [t.id, t]))
  const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]))
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]))

  const handleCreate = async (e) => {
    e.preventDefault()
    const ids = bulkMode ? form.tester_ids : [form.tester_id]
    if (!ids.length || !form.account_id) {
      showError('Select tester(s) and organisation.')
      return
    }
    setBusy(true)
    for (const testerId of ids) {
      const { error } = await assignTesterToProject({
        tester_id: testerId,
        account_id: form.account_id,
        project_id: form.project_id || null,
        org_role: form.org_role,
        project_role: form.project_role,
        notes: form.notes,
      })
      if (error) {
        setBusy(false)
        showError(toError(error))
        return
      }
    }
    setBusy(false)
    showSuccess('Assignment(s) created.')
    setShowCreate(false)
    await loadData()
  }

  if (loading) return <LoadingState message="Loading assignments..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Project & Role Assignments</h1>
          <p className="text-sm text-gray-500">Assign Platform testers to organisations and projects.</p>
        </div>
        <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm text-white" onClick={() => setShowCreate(true)}>
          New assignment
        </button>
      </div>

      {!assignments.length ? (
        <EmptyState title="No assignments" description="Create an assignment to track tester org and project roles." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Tester</th>
                <th className="px-4 py-3">Organisation</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Org role</th>
                <th className="px-4 py-3">Project role</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{testerById[row.tester_id]?.email || row.user_id}</td>
                  <td className="px-4 py-3">{accountById[row.account_id]?.account_name || row.account_id}</td>
                  <td className="px-4 py-3">{projectById[row.project_id]?.project_name || '—'}</td>
                  <td className="px-4 py-3">{row.org_role}</td>
                  <td className="px-4 py-3">{row.project_role || '—'}</td>
                  <td className="px-4 py-3">{formatDate(row.assigned_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-xs text-red-400"
                      onClick={() => confirm({
                        title: 'Revoke assignment?',
                        message: 'This marks the assignment inactive.',
                        danger: true,
                        onConfirm: async () => {
                          const { error } = await revokeTesterAssignment(row.id, 'Revoked from admin')
                          if (error) showError(toError(error))
                          else {
                            showSuccess('Assignment revoked.')
                            await loadData()
                          }
                        },
                      })}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal}

      <AdminModal open={showCreate} onClose={() => setShowCreate(false)} title="Create assignment">
        <AdminForm onSubmit={handleCreate}>
          <label className="mb-2 flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={bulkMode} onChange={(e) => setBulkMode(e.target.checked)} />
            Bulk assign multiple testers to one project
          </label>

          {bulkMode ? (
            <AdminField label="Testers">
              {testers.map((t) => (
                <label key={t.id} className="block text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.tester_ids.includes(t.id)}
                    onChange={(e) => {
                      const tester_ids = e.target.checked
                        ? [...form.tester_ids, t.id]
                        : form.tester_ids.filter((id) => id !== t.id)
                      setForm({ ...form, tester_ids })
                    }}
                  />
                  {' '}{t.email}
                </label>
              ))}
            </AdminField>
          ) : (
            <AdminField label="Tester">
              <select className={inputClass} value={form.tester_id} onChange={(e) => setForm({ ...form, tester_id: e.target.value })} required>
                <option value="">Select tester</option>
                {testers.map((t) => <option key={t.id} value={t.id}>{t.email}</option>)}
              </select>
            </AdminField>
          )}

          <AdminField label="Organisation">
            <select className={inputClass} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value, project_id: '' })} required>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
            </select>
          </AdminField>

          <AdminField label="Project">
            <select className={inputClass} value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
              <option value="">Org-level only</option>
              {accountProjects.map((p) => <option key={p.id} value={p.id}>{p.project_name}</option>)}
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

          <AdminField label="Notes">
            <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </AdminField>

          <button type="submit" disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Create</button>
        </AdminForm>
      </AdminModal>
    </div>
  )
}
