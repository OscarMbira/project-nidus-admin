import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  approveAffiliate,
  fetchAffiliateStats,
  fetchAffiliates,
  navId,
  PermissionGate,
  suspendAffiliate,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { statusVariant, toError } from '../utils/affiliateUi.js'

export default function AffiliateListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [statsMap, setStatsMap] = useState({})
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all')
  const [targetFilter, setTargetFilter] = useState('all')
  const [busyId, setBusyId] = useState('')

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('admin.affiliates', rowIds)

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchAffiliates()
    if (error) {
      showError(toError(error, 'Failed to load affiliates.'))
      setLoading(false)
      return
    }
    const list = data || []
    setRows(list)
    const statsEntries = await Promise.all(
      list.filter((a) => a.status === 'active').map(async (affiliate) => {
        const res = await fetchAffiliateStats(affiliate.code)
        return [affiliate.id, res.data]
      }),
    )
    setStatsMap(Object.fromEntries(statsEntries))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (targetFilter !== 'all' && row.target_system !== targetFilter) return false
      if (!term) return true
      return [row.code, row.name, row.email, row.status, row.target_system]
        .some((v) => String(v ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, statusFilter, targetFilter])

  const runAction = ({ title, message, confirmLabel, danger, action, successMessage, errorMessage, id }) => {
    confirm({
      title,
      message,
      confirmLabel,
      danger,
      onConfirm: async () => {
        setBusyId(id)
        const { error } = await action()
        setBusyId('')
        if (error) {
          showError(toError(error, errorMessage))
          return
        }
        showSuccess(successMessage)
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading affiliates..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Affiliates</h1>
          <p className="text-sm text-gray-500">Manage partner codes, commission rates, and referral performance.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search code, name, email..." />
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {['all', 'active', 'pending', 'suspended', 'terminated'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)}>
            {['all', 'platform', 'simulator', 'both'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All systems' : s}</option>)}
          </select>
          <PermissionGate permission="affiliate:create">
            <Link to="/affiliates/affiliate-form" className="rounded bg-blue-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-600">New Affiliate</Link>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No affiliates found" description="Adjust filters or create a new affiliate partner." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Clicks (30d)</th>
                <th className="px-4 py-3">Conv. (30d)</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const stats = statsMap[row.id]
                return (
                  <tr key={row.id} className="cursor-pointer border-t border-gray-800 hover:bg-gray-800/50" onClick={() => navigate(`/affiliates/affiliate-detail?id=${navId(displayIdMap, row.id)}`)}>
                    <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </td>
                    <td className="px-4 py-3">{row.target_system}</td>
                    <td className="px-4 py-3"><AdminBadge label={row.status} variant={statusVariant(row.status)} /></td>
                    <td className="px-4 py-3">{stats?.clicks30d ?? '—'}</td>
                    <td className="px-4 py-3">{stats?.conversions30d ?? '—'}</td>
                    <td className="px-4 py-3">{row.commission_rate_pct}%</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/affiliates/affiliate-detail?id=${navId(displayIdMap, row.id)}`)} />
                        <PermissionGate permission="affiliate:update">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/affiliates/affiliate-form?id=${navId(displayIdMap, row.id)}`)} />
                        </PermissionGate>
                        {row.status === 'pending' && (
                          <PermissionGate permission="affiliate:approve">
                            <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                              id: row.id,
                              title: 'Approve affiliate?',
                              message: `Activate ${row.name} with code ${row.code}.`,
                              confirmLabel: 'Approve',
                              action: () => approveAffiliate(row.id),
                              successMessage: 'Affiliate approved.',
                              errorMessage: 'Failed to approve affiliate.',
                            })} className="rounded border border-green-700 bg-green-900/30 px-2.5 py-1 text-xs text-green-200">Approve</button>
                          </PermissionGate>
                        )}
                        {row.status === 'active' && (
                          <PermissionGate permission="affiliate:suspend">
                            <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                              id: row.id,
                              title: 'Suspend affiliate?',
                              message: `Suspend ${row.name}. Referral links will stop earning.`,
                              confirmLabel: 'Suspend',
                              danger: true,
                              action: () => suspendAffiliate(row.id, 'Suspended from list view'),
                              successMessage: 'Affiliate suspended.',
                              errorMessage: 'Failed to suspend affiliate.',
                            })} className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200">Suspend</button>
                          </PermissionGate>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal}
    </div>
  )
}
