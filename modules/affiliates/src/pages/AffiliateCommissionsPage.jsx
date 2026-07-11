import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  approveAffiliatePayout,
  fetchAffiliates,
  fetchAllAffiliatePayouts,
  markAffiliatePayoutPaid,
  notifyEmailEvent,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { statusVariant, toError } from '../utils/affiliateUi.js'

export default function AffiliateCommissionsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [payouts, setPayouts] = useState([])
  const [affiliateMap, setAffiliateMap] = useState(new Map())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [payoutsRes, affiliatesRes] = await Promise.all([
      fetchAllAffiliatePayouts(),
      fetchAffiliates(),
    ])
    setPayouts(payoutsRes.data || [])
    setAffiliateMap(new Map((affiliatesRes.data || []).map((a) => [a.id, a])))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return payouts.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      const affiliate = affiliateMap.get(row.affiliate_id)
      if (!term) return true
      return [affiliate?.name, affiliate?.code, row.status, row.period_start, row.period_end]
        .some((v) => String(v ?? '').toLowerCase().includes(term))
    })
  }, [payouts, affiliateMap, search, statusFilter])

  const runAction = ({ payout, title, message, confirmLabel, action, successMessage, errorMessage, emailEvent }) => {
    confirm({
      title,
      message,
      confirmLabel,
      onConfirm: async () => {
        setBusyId(payout.id)
        const { error } = await action()
        setBusyId('')
        if (error) {
          showError(toError(error, errorMessage))
          return
        }
        showSuccess(successMessage)
        if (emailEvent) {
          const affiliate = affiliateMap.get(payout.affiliate_id)
          if (affiliate?.email) {
            await notifyEmailEvent(emailEvent, affiliate.email, {
              first_name: affiliate.name?.split(' ')[0] || 'Partner',
              currency: payout.currency || '$',
              amount: String(payout.commission_amount ?? ''),
              period: payout.period_label || payout.period || 'current period',
              transaction_ref: payout.id,
            })
          }
        }
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading commissions..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Commissions</h1>
          <p className="text-sm text-gray-500">Review and process affiliate payout records.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search affiliate, period..." />
          <select className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {['all', 'pending', 'approved', 'paid', 'cancelled'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
          </select>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No payout records" description="Create payouts from an affiliate detail page." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Affiliate</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Revenue</th>
                <th className="px-4 py-3">Commission</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const affiliate = affiliateMap.get(row.affiliate_id)
                return (
                  <tr key={row.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <Link to={`/affiliates/affiliate-detail?id=${row.affiliate_id}`} className="font-medium text-blue-300 hover:text-blue-200">{affiliate?.name || '—'}</Link>
                      <div className="font-mono text-xs text-gray-500">{affiliate?.code}</div>
                    </td>
                    <td className="px-4 py-3">{row.period_start} → {row.period_end}</td>
                    <td className="px-4 py-3">{row.total_clicks}</td>
                    <td className="px-4 py-3">{row.total_conversions}</td>
                    <td className="px-4 py-3">${Number(row.gross_revenue).toFixed(2)}</td>
                    <td className="px-4 py-3">${Number(row.commission_amount).toFixed(2)} {row.currency}</td>
                    <td className="px-4 py-3"><AdminBadge label={row.status} variant={statusVariant(row.status)} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {row.status === 'pending' && (
                          <PermissionGate permission="affiliate:payout_approve">
                            <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                              payout: row,
                              title: 'Approve payout?',
                              message: 'Approve this commission payout.',
                              confirmLabel: 'Approve',
                              action: () => approveAffiliatePayout(row.id),
                              successMessage: 'Payout approved.',
                              errorMessage: 'Failed to approve payout.',
                            })} className="rounded border border-green-700 px-2.5 py-1 text-xs text-green-200">Approve</button>
                          </PermissionGate>
                        )}
                        {['pending', 'approved'].includes(row.status) && (
                          <PermissionGate permission="affiliate:payout_pay">
                            <button type="button" disabled={busyId === row.id} onClick={() => runAction({
                              payout: row,
                              title: 'Mark payout paid?',
                              message: 'Confirm payment has been issued.',
                              confirmLabel: 'Mark Paid',
                              action: () => markAffiliatePayoutPaid(row.id),
                              emailEvent: 'affiliate_commission_paid',
                              successMessage: 'Payout marked paid.',
                              errorMessage: 'Failed to mark payout paid.',
                            })} className="rounded border border-blue-700 px-2.5 py-1 text-xs text-blue-200">Mark Paid</button>
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
