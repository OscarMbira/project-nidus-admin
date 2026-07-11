import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  approveAffiliate,
  approveAffiliatePayout,
  createAffiliatePayout,
  fetchAffiliateById,
  fetchAffiliatePayouts,
  fetchAffiliateStats,
  formatDate,
  markAffiliatePayoutPaid,
  PermissionGate,
  regenerateAffiliateCode,
  suspendAffiliate,
  terminateAffiliate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { statusVariant, toError } from '../utils/affiliateUi.js'

export default function AffiliateDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [affiliate, setAffiliate] = useState(null)
  const [stats, setStats] = useState(null)
  const [payouts, setPayouts] = useState([])
  const [showPayout, setShowPayout] = useState(false)
  const [payoutForm, setPayoutForm] = useState({ period_start: '', period_end: '', commission_amount: '', gross_revenue: '', notes: '' })
  const [busy, setBusy] = useState(false)

  const loadDetail = async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await fetchAffiliateById(id)
    if (error || !data) {
      setAffiliate(null)
      setLoading(false)
      return
    }
    setAffiliate(data)
    const [statsRes, payoutsRes] = await Promise.all([
      fetchAffiliateStats(data.code),
      fetchAffiliatePayouts(data.id),
    ])
    setStats(statsRes.data)
    setPayouts(payoutsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadDetail() }, [id])

  const runAction = (options) => {
    confirm({
      ...options,
      onConfirm: async () => {
        setBusy(true)
        const { data, error } = await options.action()
        setBusy(false)
        if (error) {
          showError(toError(error, options.errorMessage))
          return
        }
        showSuccess(options.successMessage + (typeof data === 'string' ? ` New code: ${data}` : ''))
        await loadDetail()
      },
    })
  }

  const handleCreatePayout = async (event) => {
    event.preventDefault()
    if (!affiliate) return
    setBusy(true)
    const { error } = await createAffiliatePayout({
      affiliate_id: affiliate.id,
      period_start: payoutForm.period_start,
      period_end: payoutForm.period_end,
      commission_amount: Number.parseFloat(payoutForm.commission_amount),
      gross_revenue: Number.parseFloat(payoutForm.gross_revenue || '0'),
      total_clicks: stats?.clicks30d || 0,
      total_conversions: stats?.conversions30d || 0,
      notes: payoutForm.notes || null,
    })
    setBusy(false)
    if (error) {
      showError(toError(error, 'Failed to create payout.'))
      return
    }
    showSuccess('Payout created.')
    setShowPayout(false)
    await loadDetail()
  }

  if (loading) return <LoadingState message="Loading affiliate detail..." />
  if (!affiliate) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="Affiliate not found" description="The affiliate record could not be loaded." />
        <button type="button" onClick={() => navigate('/affiliates/affiliate-list')} className="mt-4 text-sm text-blue-400">Back to list</button>
      </div>
    )
  }

  const platformLink = `https://app.nidus.com/platform?ref=${affiliate.code}`
  const simulatorLink = `https://app.nidus.com/simulator?ref=${affiliate.code}`

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button type="button" onClick={() => navigate('/affiliates/affiliate-list')} className="mb-2 text-sm text-gray-500 hover:text-gray-300">← Back to affiliates</button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-100">{affiliate.name}</h1>
            <AdminBadge label={affiliate.status} variant={statusVariant(affiliate.status)} />
          </div>
          <p className="mt-1 font-mono text-sm text-blue-300">{affiliate.code}</p>
          <p className="text-sm text-gray-500">Joined {formatDate(affiliate.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="affiliate:update">
            <Link to={`/affiliates/affiliate-form?id=${affiliate.id}`} className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800">Edit</Link>
          </PermissionGate>
          {affiliate.status === 'pending' && (
            <PermissionGate permission="affiliate:approve">
              <button type="button" disabled={busy} onClick={() => runAction({
                title: 'Approve affiliate?',
                message: `Activate ${affiliate.name}.`,
                confirmLabel: 'Approve',
                action: () => approveAffiliate(affiliate.id),
                successMessage: 'Affiliate approved.',
                errorMessage: 'Failed to approve affiliate.',
              })} className="rounded bg-green-700 px-3 py-1.5 text-sm text-white">Approve</button>
            </PermissionGate>
          )}
          {affiliate.status === 'active' && (
            <>
              <PermissionGate permission="affiliate:suspend">
                <button type="button" disabled={busy} onClick={() => runAction({
                  title: 'Suspend affiliate?',
                  message: 'Partner referral links will stop earning.',
                  confirmLabel: 'Suspend',
                  danger: true,
                  action: () => suspendAffiliate(affiliate.id, 'Suspended from detail page'),
                  successMessage: 'Affiliate suspended.',
                  errorMessage: 'Failed to suspend affiliate.',
                })} className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300">Suspend</button>
              </PermissionGate>
              <PermissionGate permission="affiliate:payout_create">
                <button type="button" onClick={() => setShowPayout(true)} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">Create Payout</button>
              </PermissionGate>
            </>
          )}
          <PermissionGate permission="affiliate:terminate">
            <button type="button" disabled={busy} onClick={() => runAction({
              title: 'Terminate affiliate?',
              message: 'This permanently ends the partnership.',
              confirmLabel: 'Terminate',
              danger: true,
              action: () => terminateAffiliate(affiliate.id),
              successMessage: 'Affiliate terminated.',
              errorMessage: 'Failed to terminate affiliate.',
            })} className="rounded border border-red-700 px-3 py-1.5 text-sm text-red-200">Terminate</button>
          </PermissionGate>
          <PermissionGate permission="affiliate:code_regen">
            <button type="button" disabled={busy} onClick={() => runAction({
              title: 'Regenerate code?',
              message: 'Existing referral links will stop working.',
              confirmLabel: 'Regenerate',
              action: () => regenerateAffiliateCode(affiliate.id),
              successMessage: 'Code regenerated.',
              errorMessage: 'Failed to regenerate code.',
            })} className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300">New Code</button>
          </PermissionGate>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Profile</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Email</dt><dd>{affiliate.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Target</dt><dd>{affiliate.target_system}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Commission</dt><dd>{affiliate.commission_rate_pct}%</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-gray-500">Payout method</dt><dd>{affiliate.payout_method || '—'}</dd></div>
          </dl>
          <div className="mt-4 space-y-1 text-xs text-gray-400">
            <p>Platform link: <span className="font-mono text-gray-300">{platformLink}</span></p>
            <p>Simulator link: <span className="font-mono text-gray-300">{simulatorLink}</span></p>
          </div>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Stats</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div><dt className="text-gray-500">Clicks (30d)</dt><dd className="text-xl font-semibold">{stats?.clicks30d ?? 0}</dd></div>
            <div><dt className="text-gray-500">Clicks (all)</dt><dd className="text-xl font-semibold">{stats?.clicksAll ?? 0}</dd></div>
            <div><dt className="text-gray-500">Conversions (30d)</dt><dd className="text-xl font-semibold">{stats?.conversions30d ?? 0}</dd></div>
            <div><dt className="text-gray-500">Conversions (all)</dt><dd className="text-xl font-semibold">{stats?.conversionsAll ?? 0}</dd></div>
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Recent Conversions</h2>
        {!stats?.recentConversions?.length ? (
          <p className="mt-4 text-sm text-gray-500">No conversions recorded yet.</p>
        ) : (
          <table className="mt-4 min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="pb-2">Type</th><th className="pb-2">System</th><th className="pb-2">Amount</th><th className="pb-2">Date</th></tr></thead>
            <tbody>
              {stats.recentConversions.map((row) => (
                <tr key={row.id} className="border-t border-gray-800">
                  <td className="py-2">{row.conversion_type}</td>
                  <td className="py-2">{row.target_system}</td>
                  <td className="py-2">{row.gross_amount != null ? `$${row.gross_amount}` : '—'}</td>
                  <td className="py-2">{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Payout History</h2>
        <table className="mt-4 min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-500">
            <tr><th className="pb-2">Period</th><th className="pb-2">Commission</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {payouts.map((payout) => (
              <tr key={payout.id} className="border-t border-gray-800">
                <td className="py-2">{payout.period_start} → {payout.period_end}</td>
                <td className="py-2">${Number(payout.commission_amount).toFixed(2)}</td>
                <td className="py-2 capitalize">{payout.status}</td>
                <td className="py-2">
                  <div className="flex justify-end gap-2">
                    {payout.status === 'pending' && (
                      <PermissionGate permission="affiliate:payout_approve">
                        <button type="button" disabled={busy} onClick={() => runAction({
                          title: 'Approve payout?',
                          message: 'Mark this payout as approved.',
                          confirmLabel: 'Approve',
                          action: () => approveAffiliatePayout(payout.id),
                          successMessage: 'Payout approved.',
                          errorMessage: 'Failed to approve payout.',
                        })} className="text-xs text-green-300">Approve</button>
                      </PermissionGate>
                    )}
                    {['pending', 'approved'].includes(payout.status) && (
                      <PermissionGate permission="affiliate:payout_pay">
                        <button type="button" disabled={busy} onClick={() => runAction({
                          title: 'Mark payout paid?',
                          message: 'Confirm commission has been issued.',
                          confirmLabel: 'Mark Paid',
                          action: () => markAffiliatePayoutPaid(payout.id),
                          successMessage: 'Payout marked paid.',
                          errorMessage: 'Failed to mark payout paid.',
                        })} className="text-xs text-blue-300">Mark Paid</button>
                      </PermissionGate>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <AdminModal open={showPayout} title="Create Payout" onClose={() => setShowPayout(false)}>
        <AdminForm onSubmit={handleCreatePayout} className="mt-2 space-y-3">
          <AdminField label="Period Start" required><input type="date" className={inputClass} value={payoutForm.period_start} onChange={(e) => setPayoutForm((p) => ({ ...p, period_start: e.target.value }))} required /></AdminField>
          <AdminField label="Period End" required><input type="date" className={inputClass} value={payoutForm.period_end} onChange={(e) => setPayoutForm((p) => ({ ...p, period_end: e.target.value }))} required /></AdminField>
          <AdminField label="Commission Amount" required><input type="number" step="0.01" className={inputClass} value={payoutForm.commission_amount} onChange={(e) => setPayoutForm((p) => ({ ...p, commission_amount: e.target.value }))} required /></AdminField>
          <AdminField label="Gross Revenue"><input type="number" step="0.01" className={inputClass} value={payoutForm.gross_revenue} onChange={(e) => setPayoutForm((p) => ({ ...p, gross_revenue: e.target.value }))} /></AdminField>
          <AdminField label="Notes"><textarea rows={2} className={inputClass} value={payoutForm.notes} onChange={(e) => setPayoutForm((p) => ({ ...p, notes: e.target.value }))} /></AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowPayout(false)} className="text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={busy} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">Create</button>
          </div>
        </AdminForm>
      </AdminModal>
      {modal}
    </div>
  )
}
