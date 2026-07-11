import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAffiliateDashboardSummary,
  fetchAffiliateStatsBatch,
  PermissionGate,
} from '@nidus-admin/shared'
import { AdminCard, EmptyState, LoadingState } from '@nidus-admin/ui'

export default function AffiliateDashboardPage() {
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const [summary, setSummary] = useState(null)
  const [topStats, setTopStats] = useState([])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setSummaryLoading(true)
      setStatsLoading(false)
      setTopStats([])

      const { data, error } = await fetchAffiliateDashboardSummary()
      if (cancelled) return

      if (error) {
        setSummary(null)
        setSummaryLoading(false)
        return
      }

      setSummary(data)
      setSummaryLoading(false)

      const active = (data.affiliates || []).filter((a) => a.status === 'active').slice(0, 5)
      if (!active.length) return

      setStatsLoading(true)
      const { data: statsMap } = await fetchAffiliateStatsBatch(active.map((a) => a.code))
      if (cancelled) return

      setTopStats(
        active
          .map((affiliate) => ({
            affiliate,
            stats: statsMap?.[affiliate.code] ?? null,
          }))
          .sort((a, b) => (b.stats?.conversions30d || 0) - (a.stats?.conversions30d || 0)),
      )
      setStatsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  if (summaryLoading) return <LoadingState message="Loading affiliate dashboard..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Affiliate Dashboard</h1>
          <p className="text-sm text-gray-500">Overview of partner referrals, conversions, and commissions.</p>
        </div>
        <PermissionGate permission="affiliate:create">
          <Link to="/affiliates/affiliate-form" className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Affiliate
          </Link>
        </PermissionGate>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminCard title="Active Affiliates" value={summary?.activeCount ?? 0} />
        <AdminCard title="Pending Applications" value={summary?.pendingApps ?? 0} />
        <AdminCard title="Commissions Paid" value={`$${(summary?.paidTotal ?? 0).toFixed(2)}`} />
        <AdminCard title="Pending Commissions" value={`$${(summary?.pendingTotal ?? 0).toFixed(2)}`} />
      </div>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Top Affiliates (30d conversions)</h2>
        {statsLoading ? (
          <p className="mt-4 animate-pulse text-sm text-gray-500">Loading conversion stats…</p>
        ) : !topStats.length ? (
          <p className="mt-4 text-sm text-gray-500">No active affiliates yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {topStats.map(({ affiliate, stats }) => (
              <div key={affiliate.id} className="flex items-center justify-between rounded border border-gray-800 bg-gray-950 px-4 py-3">
                <div>
                  <Link to={`/affiliates/affiliate-detail?id=${affiliate.id}`} className="font-medium text-blue-300 hover:text-blue-200">
                    {affiliate.name}
                  </Link>
                  <p className="font-mono text-xs text-gray-500">{affiliate.code}</p>
                </div>
                <div className="text-right text-sm text-gray-300">
                  <div>{stats?.clicks30d ?? 0} clicks</div>
                  <div>{stats?.conversions30d ?? 0} conversions</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Recent Payouts</h2>
        {(summary?.payouts || []).length === 0 ? (
          <EmptyState title="No payouts yet" description="Payout records appear here once commissions are processed." />
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm text-gray-200">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2 pr-4">Period</th>
                  <th className="pb-2 pr-4">Commission</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.payouts || []).slice(0, 8).map((payout) => (
                  <tr key={payout.id} className="border-t border-gray-800">
                    <td className="py-2 pr-4">{payout.period_start} → {payout.period_end}</td>
                    <td className="py-2 pr-4">${Number(payout.commission_amount).toFixed(2)} {payout.currency}</td>
                    <td className="py-2 capitalize">{payout.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
