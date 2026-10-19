/**
 * AI Centre (monorepo v1272, PRD story 8 / D17) — AI Centre overview: AI runs, credits and estimated
 * cost across Platform, Simulator and Planner. Count cards open the filtered run list (rule 17);
 * the cost card is a calculated figure and stays static.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAiUsageSummary, fetchAiSettings } from '@nidus-admin/shared'
import { AdminCard, AdminTable, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

const DAY_OPTIONS = [7, 30, 90]
const num = (v) => (Number(v) || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })

export default function AiOverviewPage() {
  const { showError } = useToast()
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState(null)
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    // Independent reads in parallel (rule 19).
    Promise.all([fetchAiUsageSummary(days), fetchAiSettings()]).then(([u, s]) => {
      if (!active) return
      if (u.error) showError(String(u.error))
      setUsage(u.data || null)
      setSettings(s.data || null)
      setLoading(false)
    })
    return () => { active = false }
  }, [days])

  if (loading) return <LoadingState message="Loading AI usage..." />
  if (!usage) return <EmptyState title="AI usage is not available" description="Run the AI SQL (monorepo v1272–v1273, Admin v235–v236) first." />

  const t = usage.totals || {}
  const runsLink = (extra = '') => `/ai/runs?days=${days}${extra}`

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI Centre</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Ask Nidus and AI agent usage across Platform, Simulator and Planner.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          Period
          <select className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {DAY_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </label>
      </div>

      {settings?.kill_switch && (
        <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-800 dark:text-red-200">
          AI is switched off for everyone (kill switch). {settings.kill_switch_reason}{' '}
          <Link to="/ai/settings" className="underline">Open settings</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <AdminCard title="AI runs" value={num(t.runs)} to={runsLink()} />
        <AdminCard title="Succeeded" value={num(t.succeeded)} to={runsLink('&status=succeeded')} />
        <AdminCard title="Failed" value={num(t.failed)} to={runsLink('&status=failed')} />
        <AdminCard title="Blocked" value={num(t.blocked)} trend="Kill switch, no notice or out of credits" to={runsLink('&status=blocked')} />
        <AdminCard title="Organisations using AI" value={num(t.organisations)} to="/ai/organisations?using=1" />
        <AdminCard title="Estimated cost (USD)" value={`$${Number(usage.cost_usd || 0).toFixed(2)}`} trend={`${num(t.credits)} credits`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By agent</h2>
          <AdminTable
            rows={usage.by_agent || []}
            idKey="agent"
            pageSize={10}
            columns={[
              { key: 'agent', label: 'Agent', render: (r) => <Link className="text-blue-600 dark:text-blue-400 hover:underline" to={runsLink(`&agent=${encodeURIComponent(r.agent)}`)}>{r.agent}</Link> },
              { key: 'runs', label: 'Runs' },
              { key: 'credits', label: 'Credits', render: (r) => num(r.credits) },
            ]}
          />
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By model</h2>
          <AdminTable
            rows={usage.by_model || []}
            idKey="model"
            pageSize={10}
            columns={[
              { key: 'model', label: 'Model', render: (r) => <span className="font-mono text-xs">{r.model}</span> },
              { key: 'runs', label: 'Runs' },
              { key: 'credits', label: 'Credits', render: (r) => num(r.credits) },
            ]}
          />
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By app</h2>
          <AdminTable
            rows={usage.by_app || []}
            idKey="app"
            pageSize={10}
            columns={[
              { key: 'app', label: 'App', render: (r) => <Link className="text-blue-600 dark:text-blue-400 hover:underline" to={runsLink(`&app=${encodeURIComponent(r.app)}`)}>{r.app}</Link> },
              { key: 'runs', label: 'Runs' },
              { key: 'credits', label: 'Credits', render: (r) => num(r.credits) },
            ]}
          />
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top organisations</h2>
          <AdminTable
            rows={usage.top_organisations || []}
            idKey="account_id"
            pageSize={10}
            columns={[
              { key: 'account_name', label: 'Organisation', render: (r) => <Link className="text-blue-600 dark:text-blue-400 hover:underline" to={runsLink(`&account_id=${r.account_id}`)}>{r.account_name || '—'}</Link> },
              { key: 'runs', label: 'Runs' },
              { key: 'credits', label: 'Credits', render: (r) => num(r.credits) },
            ]}
          />
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">By day</h2>
        <AdminTable
          rows={[...(usage.by_day || [])].reverse()}
          idKey="day"
          pageSize={14}
          columns={[
            { key: 'day', label: 'Day' },
            { key: 'runs', label: 'Runs' },
            { key: 'credits', label: 'Credits', render: (r) => num(r.credits) },
          ]}
        />
      </section>
    </div>
  )
}
