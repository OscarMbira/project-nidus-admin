import { useEffect, useMemo, useState } from 'react'
import {
  batchExtendTesterMoratorium,
  daysUntilExpiry,
  enrichTestersWithUsers,
  expiryBadgeVariant,
  fetchTesterDashboardSummary,
  formatDate,
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

const badgeClass = {
  green: 'bg-emerald-900/40 text-emerald-300',
  yellow: 'bg-amber-900/40 text-amber-300',
  red: 'bg-red-900/40 text-red-300',
  gray: 'bg-gray-800 text-gray-400',
}

export default function TesterExpiryPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState(null)
  const [selected, setSelected] = useState([])
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendMonths, setExtendMonths] = useState(3)
  const [busy, setBusy] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchTesterDashboardSummary()
    if (error) showError(toError(error))
    const enriched = await enrichTestersWithUsers(data?.testers || [])
    setSummary({ ...data, testers: enriched })
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const upcoming = useMemo(() => {
    const testers = summary?.testers || []
    return testers
      .filter((t) => t.status === 'active')
      .sort((a, b) => new Date(a.moratorium_end) - new Date(b.moratorium_end))
  }, [summary])

  const funnel = useMemo(() => {
    const testers = summary?.testers || []
    const active = testers.filter((t) => t.status === 'active').length
    const expired = testers.filter((t) => t.status === 'expired').length
    const converted = testers.filter((t) => t.status === 'converted').length
    const total = active + expired + converted || 1
    return { active, expired, converted, total }
  }, [summary])

  const toggleSelect = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleBulkExtend = async (e) => {
    e.preventDefault()
    if (!selected.length) return
    setBusy(true)
    const { error } = await batchExtendTesterMoratorium(selected, Number(extendMonths))
    setBusy(false)
    if (error) {
      showError(toError(error))
      return
    }
    showSuccess(`Extended ${selected.length} tester(s).`)
    setExtendOpen(false)
    setSelected([])
    await loadData()
  }

  if (loading) return <LoadingState message="Loading expiry dashboard..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Moratorium Expiry Dashboard</h1>
        <p className="text-sm text-gray-500">Track upcoming expirations and conversion funnel.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase text-gray-500">Expiring this week</p>
          <p className="text-2xl font-semibold text-amber-400">{summary?.expiringThisWeek ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase text-gray-500">Expiring this month</p>
          <p className="text-2xl font-semibold text-yellow-400">{summary?.expiringThisMonth ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase text-gray-500">Already expired</p>
          <p className="text-2xl font-semibold text-red-400">{summary?.expired ?? 0}</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <p className="mb-3 text-sm font-medium text-gray-200">Conversion funnel</p>
        <div className="flex h-8 overflow-hidden rounded-full bg-gray-800">
          <div className="bg-emerald-600" style={{ width: `${(funnel.active / funnel.total) * 100}%` }} title="Active" />
          <div className="bg-amber-600" style={{ width: `${(funnel.expired / funnel.total) * 100}%` }} title="Expired" />
          <div className="bg-blue-600" style={{ width: `${(funnel.converted / funnel.total) * 100}%` }} title="Converted" />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-gray-400">
          <span>Active {funnel.active}</span>
          <span>Expired {funnel.expired}</span>
          <span>Converted {funnel.converted}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-200">Upcoming expirations</h2>
        <button
          type="button"
          disabled={!selected.length}
          className="rounded bg-amber-600 px-3 py-1 text-sm text-white disabled:opacity-40"
          onClick={() => setExtendOpen(true)}
        >
          Extend selected ({selected.length})
        </button>
      </div>

      {!upcoming.length ? (
        <EmptyState title="No active testers" description="Active testers with moratorium dates appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">Tester</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Days left</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((row) => {
                const days = daysUntilExpiry(row.moratorium_end)
                const variant = expiryBadgeVariant(days, row.status)
                return (
                  <tr key={row.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                    </td>
                    <td className="px-4 py-3">{row.email}</td>
                    <td className="px-4 py-3">{formatDate(row.moratorium_end)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${badgeClass[variant]}`}>
                        {days < 0 ? 'Expired' : `${days}d`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={extendOpen} onClose={() => setExtendOpen(false)} title="Bulk extend moratorium">
        <AdminForm onSubmit={handleBulkExtend}>
          <AdminField label="Additional months">
            <input type="number" min={1} max={120} className={inputClass} value={extendMonths} onChange={(e) => setExtendMonths(e.target.value)} />
          </AdminField>
          <button type="submit" disabled={busy} className="rounded bg-amber-600 px-4 py-2 text-sm text-white">Extend</button>
        </AdminForm>
      </AdminModal>
    </div>
  )
}
