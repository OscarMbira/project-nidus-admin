import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminUsers,
  fetchAllSubscriptionPlans,
  fetchPricingChangeById,
  formatCurrency,
  formatDate,
  formatPlanLabel,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AuditRecordDiffPanel,
  EmptyState,
  LoadingState,
} from '@nidus-admin/ui'
import {
  SUBSCRIPTION_HISTORY_SECTIONS,
  subscriptionHistoryPath,
} from '../subscriptionHistoryConfig.js'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function parseJson(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function MetaItem({ label, value, className = '' }) {
  if (value == null || value === '') return null
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="truncate text-xs text-gray-200" title={String(value)}>{value}</dd>
    </div>
  )
}

export default function SubscriptionPricingRecordPage({ sectionKey: sectionKeyProp }) {
  const { sectionKey: sectionKeyParam, pricingId } = useParams()
  const sectionKey = sectionKeyProp || sectionKeyParam
  const config = SUBSCRIPTION_HISTORY_SECTIONS[sectionKey]
  const historyPath = subscriptionHistoryPath(sectionKey)

  const [row, setRow] = useState(null)
  const [planLabel, setPlanLabel] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!config || !pricingId) return undefined
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const [pricingRes, usersRes, plansRes] = await Promise.all([
        fetchPricingChangeById(pricingId),
        fetchAdminUsers({ limit: 500 }),
        fetchAllSubscriptionPlans(),
      ])

      if (cancelled) return

      if (usersRes.data) setAdminUsers(usersRes.data)

      if (pricingRes.error) {
        setError(toErrorMessage(pricingRes.error, 'Failed to load pricing change record.'))
        setRow(null)
      } else if (!pricingRes.data) {
        setError('Pricing change record not found.')
        setRow(null)
      } else {
        setRow(pricingRes.data)
        const plan = (plansRes.data || []).find((item) => item.id === pricingRes.data.plan_id)
        if (plan?.plan_name) {
          setPlanLabel(plan.plan_name)
        } else if (pricingRes.data.plan_type) {
          setPlanLabel(formatPlanLabel(pricingRes.data.plan_type))
        }
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [config, pricingId])

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  if (!config) {
    return <div className="p-6 text-red-400">Unknown history section.</div>
  }

  if (loading) return <LoadingState message="Loading pricing change record..." />

  if (error || !row) {
    return (
      <PermissionGate permission={config.permission}>
        <div className="space-y-4 p-4">
          <Link to={historyPath} className="text-sm text-violet-300 hover:text-violet-200">
            ← Back to {config.title}
          </Link>
          <EmptyState
            title="Pricing change unavailable"
            description={error || 'This pricing change record could not be loaded.'}
          />
        </div>
      </PermissionGate>
    )
  }

  const previousPrice = row.previous_price ?? row.old_price
  const newPrice = row.new_price
  const changedBy = adminNameMap[row.changed_by] || row.changed_by || '—'
  const title = planLabel
    ? `${planLabel} pricing update`
    : 'Pricing change record'

  const subtitle = [
    row.target_system === 'simulator' ? 'Simulator' : row.target_system === 'platform' ? 'Platform' : row.target_system,
    row.billing_cycle ? String(row.billing_cycle).replace(/_/g, ' ') : null,
    row.plan_type ? formatPlanLabel(row.plan_type) : null,
  ].filter(Boolean).join(' · ')

  return (
    <PermissionGate permission={config.permission}>
      <div className="flex h-[calc(100vh-5.5rem)] max-h-[calc(100vh-5.5rem)] flex-col gap-2 overflow-hidden p-3 md:p-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
          <Link to={historyPath} className="text-xs text-violet-300 hover:text-violet-200">
            ← Back to {config.title}
          </Link>
          {row.plan_id && (
            <Link
              to={`/subscriptions/plan-catalog-form?id=${row.plan_id}`}
              className="rounded border border-gray-600 px-3 py-1 text-xs text-gray-200 hover:bg-gray-800"
            >
              Open plan in catalog
            </Link>
          )}
        </div>

        <header className="shrink-0 space-y-1">
          <h1 className="text-lg font-semibold leading-tight text-gray-100">{title}</h1>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </header>

        <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
          <MetaItem label="Previous price" value={formatCurrency(previousPrice, row.currency || 'USD')} />
          <MetaItem label="New price" value={formatCurrency(newPrice, row.currency || 'USD')} />
          <MetaItem label="Effective" value={formatDate(row.effective_date)} />
          <MetaItem label="Recorded" value={formatDate(row.created_at)} />
          <MetaItem label="Changed by" value={changedBy} />
          <MetaItem
            label="Affected subscribers"
            value={row.affected_subscribers_count != null ? String(row.affected_subscribers_count) : null}
          />
          <MetaItem label="Reason" value={row.change_reason || row.reason} className="sm:col-span-2 lg:col-span-3" />
        </dl>

        <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
          <div className="border-b border-gray-800 px-3 py-1.5">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">What changed</h2>
          </div>
          <div className="h-[calc(100%-1.75rem)] overflow-y-auto p-2">
            <AuditRecordDiffPanel
              layout="compact"
              showSummary={false}
              showContext={false}
              action="subscription_plan.update"
              previousValue={parseJson(row.previous_values) || { price: previousPrice }}
              newValue={parseJson(row.new_values) || { price: newPrice }}
              currency={row.currency || 'USD'}
            />
          </div>
        </section>
      </div>
    </PermissionGate>
  )
}
