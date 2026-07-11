import { useEffect, useMemo, useState } from 'react'
import {
  approveTesterApplication,
  enrichApplicationsWithReviewers,
  fetchSystemSettings,
  fetchTesterApplications,
  fetchTesterCapacity,
  formatDate,
  notifyEmailEvent,
  rejectTesterApplication,
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
import TesterCapacityBar from '../components/TesterCapacityBar.jsx'
import { statusVariant, toError } from '../utils/testerUi.js'

const statusClass = {
  green: 'bg-emerald-900/40 text-emerald-300',
  yellow: 'bg-amber-900/40 text-amber-300',
  red: 'bg-red-900/40 text-red-300',
  gray: 'bg-gray-800 text-gray-400',
}

export default function TesterApplicationsPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [capacity, setCapacity] = useState({ activeCount: 0, maxTesters: 100 })
  const [defaultMonths, setDefaultMonths] = useState(10)
  const [statusFilter, setStatusFilter] = useState('all')
  const [approveRow, setApproveRow] = useState(null)
  const [rejectRow, setRejectRow] = useState(null)
  const [approveForm, setApproveForm] = useState({ moratorium_months: 10, grant_note: '', systems: [] })
  const [rejectReason, setRejectReason] = useState('')
  const [busyId, setBusyId] = useState('')

  const atLimit = capacity.activeCount >= capacity.maxTesters

  const loadData = async () => {
    setLoading(true)
    const [appsRes, capRes, settingsRes] = await Promise.all([
      fetchTesterApplications(),
      fetchTesterCapacity(),
      fetchSystemSettings(),
    ])
    if (appsRes.error) showError(toError(appsRes.error, 'Failed to load applications.'))
    const enriched = await enrichApplicationsWithReviewers(appsRes.data || [])
    setRows(enriched)
    if (capRes.data) setCapacity(capRes.data)
    const months = settingsRes.data?.find((s) => s.setting_key === 'testers.default_moratorium_months')
    const m = Number(months?.setting_value || 10)
    setDefaultMonths(m)
    setApproveForm((f) => ({ ...f, moratorium_months: m }))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  const openApprove = (row) => {
    setApproveRow(row)
    setApproveForm({
      moratorium_months: defaultMonths,
      grant_note: '',
      systems: row.target_systems || [],
    })
  }

  const handleApprove = async (e) => {
    e.preventDefault()
    if (!approveRow) return
    setBusyId(approveRow.id)
    const { error } = await approveTesterApplication(approveRow.id, {
      moratorium_months: Number(approveForm.moratorium_months),
      grant_note: approveForm.grant_note,
      systems: approveForm.systems,
    })
    setBusyId('')
    if (error) {
      showError(toError(error, 'Failed to approve application.'))
      return
    }
    showSuccess('Application approved.')
    await notifyEmailEvent('tester_approved', approveRow.email, {
      first_name: approveRow.full_name?.split(' ')[0] || 'Tester',
      platform_name: 'Project Nidus',
      moratorium_months: String(approveForm.moratorium_months),
      login_url: 'https://app.projectnidus.com',
    })
    setApproveRow(null)
    await loadData()
  }

  const handleReject = async (e) => {
    e.preventDefault()
    if (!rejectRow) return
    setBusyId(rejectRow.id)
    const { error } = await rejectTesterApplication(rejectRow.id, rejectReason)
    setBusyId('')
    if (error) {
      showError(toError(error, 'Failed to reject application.'))
      return
    }
    showSuccess('Application rejected.')
    await notifyEmailEvent('tester_rejected', rejectRow.email, {
      first_name: rejectRow.full_name?.split(' ')[0] || 'Applicant',
      rejection_reason: rejectReason || 'Not specified',
    })
    setRejectRow(null)
    setRejectReason('')
    await loadData()
  }

  if (loading) return <LoadingState message="Loading applications..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Tester Applications</h1>
        <p className="text-sm text-gray-500">Review voluntary applications from prospective system testers.</p>
      </div>

      <TesterCapacityBar activeCount={capacity.activeCount} maxTesters={capacity.maxTesters} />

      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'approved', 'rejected'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded px-3 py-1 text-sm capitalize ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            {s}
          </button>
        ))}
      </div>

      {!filtered.length ? (
        <EmptyState title="No applications" description="Applications matching this filter will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Systems</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reviewed by</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{row.applicant_name}</td>
                  <td className="px-4 py-3">{row.applicant_email}</td>
                  <td className="px-4 py-3">{(row.target_systems || []).join(', ')}</td>
                  <td className="px-4 py-3">{formatDate(row.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass[statusVariant(row.status)]}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{row.reviewer?.email || '—'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {row.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === row.id || atLimit}
                          title={atLimit ? 'Tester limit reached — increase testers.max_active_testers in System Settings to approve more.' : 'Approve'}
                          onClick={() => openApprove(row)}
                          className="rounded bg-emerald-700 px-2 py-1 text-xs disabled:opacity-40"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === row.id}
                          onClick={() => setRejectRow(row)}
                          className="rounded bg-red-800 px-2 py-1 text-xs"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={!!approveRow} onClose={() => setApproveRow(null)} title="Approve application">
        <AdminForm onSubmit={handleApprove}>
          <AdminField label="Moratorium (months)">
            <input
              type="number"
              min={1}
              max={120}
              className={inputClass}
              value={approveForm.moratorium_months}
              onChange={(e) => setApproveForm({ ...approveForm, moratorium_months: e.target.value })}
            />
          </AdminField>
          <AdminField label="Systems">
            {['platform', 'simulator'].map((sys) => (
              <label key={sys} className="mr-4 inline-flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={approveForm.systems.includes(sys)}
                  onChange={(e) => {
                    const systems = e.target.checked
                      ? [...approveForm.systems, sys]
                      : approveForm.systems.filter((s) => s !== sys)
                    setApproveForm({ ...approveForm, systems })
                  }}
                />
                {sys}
              </label>
            ))}
          </AdminField>
          <AdminField label="Grant note (internal)">
            <textarea className={inputClass} rows={3} value={approveForm.grant_note} onChange={(e) => setApproveForm({ ...approveForm, grant_note: e.target.value })} />
          </AdminField>
          <button type="submit" disabled={!!busyId} className="rounded bg-emerald-600 px-4 py-2 text-sm text-white">Approve</button>
        </AdminForm>
      </AdminModal>

      <AdminModal open={!!rejectRow} onClose={() => setRejectRow(null)} title="Reject application">
        <AdminForm onSubmit={handleReject}>
          <AdminField label="Rejection reason">
            <textarea className={inputClass} rows={3} required value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </AdminField>
          <button type="submit" disabled={!!busyId} className="rounded bg-red-700 px-4 py-2 text-sm text-white">Reject</button>
        </AdminForm>
      </AdminModal>
    </div>
  )
}
