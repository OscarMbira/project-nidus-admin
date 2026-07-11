import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchAdminUsers,
  fetchAuditLogById,
  formatDate,
  formatPlanLabel,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AuditRecordDiffPanel,
  EmptyState,
  formatAuditActionLabel,
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

function parseAuditJson(value) {
  if (value == null || value === '') return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function recordMetaFromAudit(row) {
  const prev = parseAuditJson(row?.previous_value) || {}
  const next = parseAuditJson(row?.new_value) || {}
  const details = parseAuditJson(row?.target_details) || {}
  const record = { ...prev, ...next, ...details }

  const title = record.plan_name
    || (record.plan_type ? `${formatPlanLabel(record.plan_type)} plan` : null)
    || record.target_name
    || 'Change record'

  const subtitle = [
    record.catalog_scope === 'platform' ? 'Platform' : record.catalog_scope === 'simulator' ? 'Simulator' : record.catalog_scope,
    record.billing_cycle ? String(record.billing_cycle).replace(/_/g, ' ') : null,
    record.plan_type ? formatPlanLabel(record.plan_type) : null,
  ].filter(Boolean).join(' · ')

  const reason = details.reason || record.reason || null

  return { title, subtitle, reason }
}

function MetaItem({ label, value, className = '' }) {
  if (!value) return null
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="truncate text-xs text-gray-200" title={String(value)}>{value}</dd>
    </div>
  )
}

export default function SubscriptionAuditRecordPage({ sectionKey: sectionKeyProp }) {
  const { sectionKey: sectionKeyParam, auditId } = useParams()
  const sectionKey = sectionKeyProp || sectionKeyParam
  const config = SUBSCRIPTION_HISTORY_SECTIONS[sectionKey]
  const historyPath = subscriptionHistoryPath(sectionKey)

  const [row, setRow] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showTechnical, setShowTechnical] = useState(false)

  useEffect(() => {
    if (!config || !auditId) return undefined
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      const [auditRes, usersRes] = await Promise.all([
        fetchAuditLogById(auditId),
        fetchAdminUsers({ limit: 500 }),
      ])
      if (cancelled) return

      if (usersRes.data) setAdminUsers(usersRes.data)
      if (auditRes.error) {
        setError(toErrorMessage(auditRes.error, 'Failed to load change record.'))
        setRow(null)
      } else if (!auditRes.data) {
        setError('Change record not found.')
        setRow(null)
      } else {
        setRow(auditRes.data)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [auditId, config])

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  const recordMeta = useMemo(() => (row ? recordMetaFromAudit(row) : null), [row])

  if (!config) {
    return <div className="p-6 text-red-400">Unknown history section.</div>
  }

  if (loading) return <LoadingState message="Loading change record..." />

  if (error || !row) {
    return (
      <PermissionGate permission={config.permission}>
        <div className="space-y-4 p-4">
          <Link to={historyPath} className="text-sm text-violet-300 hover:text-violet-200">
            ← Back to {config.title}
          </Link>
          <EmptyState
            title="Change record unavailable"
            description={error || 'This audit entry could not be loaded.'}
          />
        </div>
      </PermissionGate>
    )
  }

  const adminName = adminNameMap[row.admin_user_id] || row.admin_user_id || '—'

  return (
    <PermissionGate permission={config.permission}>
      <div className="flex h-[calc(100vh-5.5rem)] max-h-[calc(100vh-5.5rem)] flex-col gap-2 overflow-hidden p-3 md:p-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-2">
          <Link
            to={historyPath}
            className="text-xs text-violet-300 hover:text-violet-200"
          >
            ← Back to {config.title}
          </Link>
          <AdminBadge label={formatAuditActionLabel(row.action)} variant="pending" />
        </div>

        <header className="shrink-0 space-y-1">
          <h1 className="text-lg font-semibold leading-tight text-gray-100">{recordMeta.title}</h1>
          {recordMeta.subtitle && (
            <p className="text-xs text-gray-400">{recordMeta.subtitle}</p>
          )}
        </header>

        <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
          <MetaItem label="Changed by" value={adminName} />
          <MetaItem label="Role" value={row.admin_role} />
          <MetaItem label="Recorded" value={formatDate(row.created_at)} />
          <MetaItem label="Target" value={row.target_type} />
          <MetaItem label="Reason" value={recordMeta.reason} className="sm:col-span-2 lg:col-span-2" />
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
              action={row.action}
              previousValue={row.previous_value}
              newValue={row.new_value}
              targetDetails={row.target_details}
            />
          </div>
        </section>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowTechnical((open) => !open)}
            className="text-[10px] text-gray-500 underline decoration-gray-600 underline-offset-2 hover:text-gray-300"
          >
            {showTechnical ? 'Hide technical details' : 'Technical details'}
          </button>
          {config.parentPath && (
            <Link
              to={config.parentPath}
              className="text-xs text-gray-400 hover:text-violet-200"
            >
              {config.parentLabel} →
            </Link>
          )}
        </div>

        {showTechnical && (
          <div className="shrink-0 rounded border border-gray-800 bg-gray-950/60 p-2 text-[10px] text-gray-400">
            <p><span className="text-gray-500">Action:</span> {row.action}</p>
            <p className="truncate"><span className="text-gray-500">Target ID:</span> {row.target_id}</p>
            <p className="truncate"><span className="text-gray-500">Audit ID:</span> {row.id}</p>
          </div>
        )}
      </div>
    </PermissionGate>
  )
}
