import { useMemo, useState } from 'react'
import { formatCurrency, formatPlanLabel } from '@nidus-admin/shared'
import { AdminBadge } from './AdminBadge.jsx'

const SKIP_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'root_record_id',
  'record_status',
  'version_number',
  'authorisation_batch_id',
])

const FIELD_LABELS = {
  plan_name: 'Plan name',
  plan_type: 'Plan type',
  plan_code: 'Plan code',
  billing_cycle: 'Billing cycle',
  catalog_scope: 'Catalog scope',
  price: 'Price',
  original_price: 'Original price',
  currency: 'Currency',
  member_limit: 'Member limit',
  project_limit: 'Project limit',
  additional_member_price: 'Additional member price',
  features: 'Features',
  platform_included: 'Platform included',
  simulator_included: 'Simulator included',
  is_popular: 'Popular plan',
  is_active: 'Active',
  display_order: 'Display order',
  status: 'Status',
  amount: 'Amount',
  amount_paid: 'Amount paid',
  reason: 'Reason',
  is_hidden: 'Hidden from catalog',
  is_lifetime: 'Lifetime plan',
}

const ACTION_LABELS = {
  'subscription_plan.create': 'Plan created',
  'subscription_plan.update': 'Plan updated',
  'subscription_plan.delete': 'Plan deleted',
  'subscription_plan.catalog_visibility': 'Catalog visibility changed',
  'subscription.create': 'Subscription created',
  'subscription.update': 'Subscription updated',
  'subscription.delete': 'Subscription deleted',
  'refund.create': 'Refund created',
  'refund.update': 'Refund updated',
  'refund.approve': 'Refund approved',
  'refund.reject': 'Refund rejected',
}

const FIELD_ORDER = [
  'plan_name',
  'plan_type',
  'billing_cycle',
  'catalog_scope',
  'price',
  'original_price',
  'currency',
  'member_limit',
  'project_limit',
  'additional_member_price',
  'features',
  'is_active',
  'is_popular',
  'platform_included',
  'simulator_included',
  'is_hidden',
  'display_order',
  'status',
  'amount',
  'amount_paid',
  'reason',
]

function parseAuditJson(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function humanizeKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function humanizeAction(action) {
  if (!action) return 'Change recorded'
  return ACTION_LABELS[action] || action.replace(/[._]/g, ' ')
}

function stableStringify(value) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function scopeLabel(value) {
  if (value === 'platform') return 'Platform'
  if (value === 'simulator') return 'Simulator'
  if (value === 'both') return 'Both'
  return value ?? '—'
}

function formatScalarValue(key, value, currency = 'USD') {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') {
    if (key === 'is_active') return value ? 'Active' : 'Inactive'
    return value ? 'Yes' : 'No'
  }
  if (key === 'catalog_scope') return scopeLabel(value)
  if (key === 'plan_type') return formatPlanLabel(value) || value
  if (['price', 'original_price', 'additional_member_price', 'amount', 'amount_paid'].includes(key)) {
    const amount = Number(value)
    return Number.isFinite(amount) ? formatCurrency(amount, currency) : String(value)
  }
  if (key === 'member_limit' || key === 'project_limit') {
    if (value == null) return 'Unlimited'
    return String(value)
  }
  if (Array.isArray(value)) return value.length ? `${value.length} item(s)` : '—'
  if (typeof value === 'object') return 'See details'
  return String(value)
}

function featureList(features) {
  if (!Array.isArray(features)) return []
  return features.map((item) => String(item).trim()).filter(Boolean)
}

function computeChanges(previous, next) {
  const prev = parseAuditJson(previous) || {}
  const nxt = parseAuditJson(next) || {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(nxt)])
  const changes = []

  for (const key of keys) {
    if (SKIP_FIELDS.has(key)) continue
    const before = prev[key]
    const after = nxt[key]
    if (stableStringify(before) === stableStringify(after)) continue
    changes.push({
      key,
      label: FIELD_LABELS[key] || humanizeKey(key),
      before,
      after,
    })
  }

  return changes.sort((a, b) => {
    const aIndex = FIELD_ORDER.indexOf(a.key)
    const bIndex = FIELD_ORDER.indexOf(b.key)
    if (aIndex === -1 && bIndex === -1) return a.label.localeCompare(b.label)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })
}

function FeatureChangeList({ before = [], after = [], compact = false }) {
  const prev = featureList(before)
  const next = featureList(after)
  const removed = prev.filter((item) => !next.includes(item))
  const added = next.filter((item) => !prev.includes(item))
  const unchanged = next.filter((item) => prev.includes(item))

  if (compact) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-300">
          {added.length > 0 && <span className="text-emerald-300">+{added.length} added</span>}
          {added.length > 0 && removed.length > 0 && <span className="text-gray-500"> · </span>}
          {removed.length > 0 && <span className="text-red-300">−{removed.length} removed</span>}
          {added.length === 0 && removed.length === 0 && `${next.length} feature(s)`}
        </summary>
        <div className="mt-2 space-y-2">
          {added.length > 0 && (
            <ul className="space-y-0.5 text-emerald-200">
              {added.map((item) => <li key={`a-${item}`}>+ {item}</li>)}
            </ul>
          )}
          {removed.length > 0 && (
            <ul className="space-y-0.5 text-red-200">
              {removed.map((item) => <li key={`r-${item}`}>− {item}</li>)}
            </ul>
          )}
        </div>
      </details>
    )
  }

  return (
    <div className="space-y-3 text-sm">
      {(removed.length > 0 || added.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {removed.length > 0 && (
            <div className="rounded border border-red-900/50 bg-red-950/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-300">Removed</p>
              <ul className="space-y-1 text-red-100">
                {removed.map((item) => (
                  <li key={`removed-${item}`} className="flex gap-2">
                    <span aria-hidden>−</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {added.length > 0 && (
            <div className="rounded border border-emerald-900/50 bg-emerald-950/30 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">Added</p>
              <ul className="space-y-1 text-emerald-100">
                {added.map((item) => (
                  <li key={`added-${item}`} className="flex gap-2">
                    <span aria-hidden>+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {unchanged.length > 0 && (
        <details className="rounded border border-gray-800 bg-gray-950/60 p-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-gray-400">
            Unchanged features ({unchanged.length})
          </summary>
          <ul className="mt-2 space-y-1 text-gray-300">
            {unchanged.map((item) => (
              <li key={`same-${item}`}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      {prev.length === 0 && next.length > 0 && added.length === 0 && (
        <ul className="space-y-1 text-gray-200">
          {next.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ChangeValue({ fieldKey, value, currency, tone = 'neutral' }) {
  const toneClass = tone === 'before'
    ? 'text-red-200'
    : tone === 'after'
      ? 'text-emerald-200'
      : 'text-gray-200'

  return <span className={toneClass}>{formatScalarValue(fieldKey, value, currency)}</span>
}

function TargetDetailsPanel({ details, compact = false }) {
  const parsed = parseAuditJson(details)
  if (!parsed || typeof parsed !== 'object') return null

  const entries = Object.entries(parsed).filter(([key, value]) => value != null && value !== '')
  if (!entries.length) return null

  if (compact) {
    return (
      <p className="text-xs text-gray-400">
        {entries.map(([key, value], index) => (
          <span key={key}>
            {index > 0 && <span className="text-gray-600"> · </span>}
            <span className="text-gray-500">{FIELD_LABELS[key] || humanizeKey(key)}: </span>
            {key === 'reason' ? (
              <span className="text-violet-200">{String(value)}</span>
            ) : (
              <span className="text-gray-200">{formatScalarValue(key, value)}</span>
            )}
          </span>
        ))}
      </p>
    )
  }

  return (
    <div className="rounded border border-gray-800 bg-gray-950/50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Context</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-gray-500">{FIELD_LABELS[key] || humanizeKey(key)}</dt>
            <dd className="text-sm text-gray-200">
              {key === 'reason' ? (
                <span className="rounded bg-violet-900/30 px-2 py-1 text-violet-100">{String(value)}</span>
              ) : (
                formatScalarValue(key, value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function RecordSummary({ action, previous, next, targetDetails }) {
  const prev = parseAuditJson(previous) || {}
  const nxt = parseAuditJson(next) || {}
  const details = parseAuditJson(targetDetails) || {}
  const record = { ...prev, ...nxt, ...details }

  const title = record.plan_name
    || (record.plan_type ? `${formatPlanLabel(record.plan_type)} plan` : null)
    || record.target_name
    || 'Record change'

  const meta = [
    record.catalog_scope ? scopeLabel(record.catalog_scope) : null,
    record.billing_cycle ? String(record.billing_cycle).replace(/_/g, ' ') : null,
    record.plan_type ? formatPlanLabel(record.plan_type) : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded border border-gray-700 bg-gray-900/80 p-4">
      <div>
        <p className="text-base font-semibold text-gray-100">{title}</p>
        {meta.length > 0 && (
          <p className="mt-1 text-sm text-gray-400">{meta.join(' · ')}</p>
        )}
      </div>
      <AdminBadge label={humanizeAction(action)} variant="pending" />
    </div>
  )
}

function RawJsonToggle({ previous, next, targetDetails }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 underline decoration-gray-600 underline-offset-2 hover:text-gray-300"
      >
        Show raw JSON
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-gray-500 underline decoration-gray-600 underline-offset-2 hover:text-gray-300"
      >
        Hide raw JSON
      </button>
      <div className="grid gap-4 lg:grid-cols-2">
        <pre className="max-h-48 overflow-auto rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
          {JSON.stringify(parseAuditJson(previous), null, 2) || '—'}
        </pre>
        <pre className="max-h-48 overflow-auto rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
          {JSON.stringify(parseAuditJson(next), null, 2) || '—'}
        </pre>
      </div>
      {targetDetails && (
        <pre className="max-h-40 overflow-auto rounded border border-gray-800 bg-gray-950 p-3 text-xs text-gray-300">
          {JSON.stringify(parseAuditJson(targetDetails), null, 2) || '—'}
        </pre>
      )}
    </div>
  )
}

export function formatAuditActionLabel(action) {
  return humanizeAction(action)
}

export function AuditRecordDiffPanel({
  action,
  previousValue,
  newValue,
  targetDetails,
  className = '',
  layout = 'inline',
  showSummary = true,
  showContext = true,
}) {
  const changes = useMemo(
    () => computeChanges(previousValue, newValue),
    [previousValue, newValue],
  )

  const currency = useMemo(() => {
    const next = parseAuditJson(newValue) || {}
    const prev = parseAuditJson(previousValue) || {}
    return next.currency || prev.currency || 'USD'
  }, [newValue, previousValue])

  const isCreate = !parseAuditJson(previousValue) && parseAuditJson(newValue)
  const isDelete = parseAuditJson(previousValue) && !parseAuditJson(newValue)

  const isCompact = layout === 'compact'
  const isPageLayout = layout === 'page'
  const rootClass = isCompact
    ? `space-y-2 ${className}`
    : isPageLayout
      ? `space-y-6 ${className}`
      : `space-y-4 ${className}`
  const summaryClass = isPageLayout
    ? 'rounded-xl border border-gray-700 bg-gray-950/40 p-5'
    : 'rounded border border-gray-700 bg-gray-900/80 p-4'
  const tableWrapClass = isCompact
    ? 'overflow-x-auto rounded-lg border border-gray-700'
    : isPageLayout
      ? 'overflow-x-auto rounded-xl border border-gray-700 bg-gray-950/30'
      : 'overflow-x-auto rounded-lg border border-gray-700'
  const cellClass = isCompact ? 'px-2 py-1.5' : 'px-4 py-3'
  const headClass = isCompact ? 'px-2 py-1.5' : 'px-4 py-3'

  return (
    <div className={rootClass}>
      {showSummary && (
        <div className={isCompact ? '' : summaryClass}>
          <RecordSummary
            action={action}
            previous={previousValue}
            next={newValue}
            targetDetails={targetDetails}
          />
        </div>
      )}

      {showContext && <TargetDetailsPanel details={targetDetails} compact={isCompact} />}

      {changes.length === 0 ? (
        <p className={`rounded border border-gray-800 bg-gray-950/50 text-gray-400 ${isCompact ? 'px-2 py-1.5 text-xs' : isPageLayout ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-sm'}`}>
          {isCreate
            ? 'A new record was created. Expand raw JSON for the full snapshot.'
            : isDelete
              ? 'This record was removed. Expand raw JSON for the last known snapshot.'
              : 'No field-level differences were captured for this event.'}
        </p>
      ) : (
        <div className={tableWrapClass}>
          <table className={`min-w-full ${isCompact ? 'text-xs' : 'text-sm'}`}>
            <thead className="bg-gray-800/80 text-left text-[10px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className={headClass}>Field</th>
                <th className={headClass}>Before</th>
                <th className={headClass}>After</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => {
                if (change.key === 'features') {
                  return (
                    <tr key={change.key} className="border-t border-gray-800 align-top">
                      <td className={`${cellClass} font-medium text-gray-200`}>{change.label}</td>
                      <td colSpan={2} className={cellClass}>
                        <FeatureChangeList before={change.before} after={change.after} compact={isCompact} />
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={change.key} className="border-t border-gray-800 align-top">
                    <td className={`${cellClass} font-medium text-gray-200`}>{change.label}</td>
                    <td className={cellClass}>
                      <ChangeValue fieldKey={change.key} value={change.before} currency={currency} tone="before" />
                    </td>
                    <td className={cellClass}>
                      <ChangeValue fieldKey={change.key} value={change.after} currency={currency} tone="after" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isCompact && (
        <RawJsonToggle
          previous={previousValue}
          next={newValue}
          targetDetails={targetDetails}
        />
      )}
    </div>
  )
}
