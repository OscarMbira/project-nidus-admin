import { useEffect, useMemo, useState } from 'react'
import {
  daysUntilExpiry,
  enrichTestersWithUsers,
  expiryBadgeVariant,
  extendTesterMoratorium,
  fetchSystemTesters,
  fetchTesterCapacity,
  formatDate,
  markTesterConverted,
  revokeTesterAccess,
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
import TesterCapacityBar from '../components/TesterCapacityBar.jsx'
import { statusVariant, toError } from '../utils/testerUi.js'

const badgeClass = {
  green: 'bg-emerald-900/40 text-emerald-300',
  yellow: 'bg-amber-900/40 text-amber-300',
  red: 'bg-red-900/40 text-red-300',
  gray: 'bg-gray-800 text-gray-400',
}

export default function ActiveTestersPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [capacity, setCapacity] = useState({ activeCount: 0, maxTesters: 100 })
  const [statusFilter, setStatusFilter] = useState('active')
  const [detail, setDetail] = useState(null)
  const [extendRow, setExtendRow] = useState(null)
  const [extendMonths, setExtendMonths] = useState(3)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [testersRes, capRes] = await Promise.all([
      fetchSystemTesters(statusFilter === 'all' ? {} : { status: statusFilter }),
      fetchTesterCapacity(),
    ])
    if (testersRes.error) showError(toError(testersRes.error))
    const enriched = await enrichTestersWithUsers(testersRes.data || [])
    setRows(enriched)
    if (capRes.data) setCapacity(capRes.data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [statusFilter])

  const sorted = useMemo(
    () => [...rows].sort((a, b) => new Date(a.moratorium_end) - new Date(b.moratorium_end)),
    [rows],
  )

  const runAction = (row, { title, message, action, success, danger }) => {
    confirm({
      title,
      message,
      danger,
      onConfirm: async () => {
        setBusyId(row.id)
        const { error } = await action()
        setBusyId('')
        if (error) {
          showError(toError(error))
          return
        }
        showSuccess(success)
        await loadData()
      },
    })
  }

  const handleExtend = async (e) => {
    e.preventDefault()
    if (!extendRow) return
    setBusyId(extendRow.id)
    const { error } = await extendTesterMoratorium(extendRow.id, Number(extendMonths))
    setBusyId('')
    if (error) {
      showError(toError(error))
      return
    }
    showSuccess('Moratorium extended.')
    setExtendRow(null)
    await loadData()
  }

  if (loading) return <LoadingState message="Loading testers..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Active Testers</h1>
        <p className="text-sm text-gray-500">Monitor moratorium periods and manage tester access.</p>
      </div>

      <TesterCapacityBar activeCount={capacity.activeCount} maxTesters={capacity.maxTesters} />

      <div className="flex flex-wrap gap-2">
        {['active', 'expired', 'converted', 'revoked', 'all'].map((s) => (
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

      {!sorted.length ? (
        <EmptyState title="No testers" description="Granted testers will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Systems</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Days left</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const days = daysUntilExpiry(row.moratorium_end)
                const expVariant = expiryBadgeVariant(days, row.status)
                return (
                  <tr key={row.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">{row.full_name || '—'}</td>
                    <td className="px-4 py-3">{row.email || '—'}</td>
                    <td className="px-4 py-3">{(row.target_systems || []).join(', ')}</td>
                    <td className="px-4 py-3">{formatDate(row.moratorium_start)}</td>
                    <td className="px-4 py-3">{formatDate(row.moratorium_end)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${badgeClass[expVariant]}`}>
                        {days == null ? '—' : days < 0 ? 'Expired' : `${days}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button type="button" className="text-xs text-blue-400" onClick={() => setDetail(row)}>View</button>
                      {row.status === 'active' && (
                        <>
                          <button type="button" className="text-xs text-amber-400" onClick={() => setExtendRow(row)}>Extend</button>
                          <button
                            type="button"
                            className="text-xs text-red-400"
                            disabled={busyId === row.id}
                            onClick={() => runAction(row, {
                              title: 'Revoke tester access?',
                              message: 'This cancels tester subscriptions immediately.',
                              danger: true,
                              action: () => revokeTesterAccess(row.id, 'Revoked from admin'),
                              success: 'Access revoked.',
                            })}
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            className="text-xs text-emerald-400"
                            disabled={busyId === row.id}
                            onClick={() => runAction(row, {
                              title: 'Mark as converted?',
                              message: 'Mark this tester as a paying subscriber.',
                              action: () => markTesterConverted(row.id),
                              success: 'Marked converted.',
                            })}
                          >
                            Converted
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal}

      <AdminModal open={!!detail} onClose={() => setDetail(null)} title="Tester detail">
        {detail && (
          <div className="space-y-2 text-sm text-gray-300">
            <p><strong>Name:</strong> {detail.full_name}</p>
            <p><strong>Email:</strong> {detail.email}</p>
            <p><strong>Systems:</strong> {(detail.target_systems || []).join(', ')}</p>
            <p><strong>Moratorium:</strong> {detail.moratorium_months} months</p>
            <p><strong>Note:</strong> {detail.grant_note || '—'}</p>
          </div>
        )}
      </AdminModal>

      <AdminModal open={!!extendRow} onClose={() => setExtendRow(null)} title="Extend moratorium">
        <AdminForm onSubmit={handleExtend}>
          <AdminField label="Additional months">
            <input type="number" min={1} max={120} className={inputClass} value={extendMonths} onChange={(e) => setExtendMonths(e.target.value)} />
          </AdminField>
          <button type="submit" className="rounded bg-amber-600 px-4 py-2 text-sm text-white">Extend</button>
        </AdminForm>
      </AdminModal>
    </div>
  )
}
