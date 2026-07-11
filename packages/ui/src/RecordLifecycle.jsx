import { useEffect, useState } from 'react'
import { AdminBadge } from './AdminBadge.jsx'
import { useToast } from './AdminToast.jsx'
import { useConfirmAction } from './useConfirmAction.jsx'
import {
  LIFECYCLE_STATUS_LABELS,
  PermissionGate,
  decidePendingRecord,
  fetchPendingChanges,
  formatCurrency,
  lifecycleStatusVariant,
  notifyEmailEvent,
  transitionRecordStatus,
} from '@nidus-admin/shared'

const LIFECYCLE_OPERATION_LABELS = {
  submit: 'Submitted for authorisation',
  validate: 'Validated (approved)',
  reject: 'Rejected',
  delete: 'Moved to history',
  archive: 'Archived',
  restore: 'Restored',
}

const OPERATIONS_BY_STATUS = {
  unauthorised: [
    { op: 'approve', label: 'Approve', permission: 'lifecycle.authorise', danger: false },
    { op: 'reject', label: 'Reject', permission: 'lifecycle.authorise', danger: true },
    { op: 'delete', label: 'Discard record', permission: 'lifecycle.configure', danger: true },
  ],
  live: [
    { op: 'archive', label: 'Archive', permission: 'lifecycle.configure', danger: false },
  ],
  history: [
    { op: 'restore', label: 'Restore', permission: 'lifecycle.configure', danger: false },
    { op: 'archive', label: 'Archive', permission: 'lifecycle.configure', danger: false },
  ],
  archived: [
    { op: 'restore', label: 'Restore', permission: 'lifecycle.configure', danger: false },
  ],
}

export function RecordStatusBadge({ status }) {
  const label = LIFECYCLE_STATUS_LABELS[status] || status || '—'
  return <AdminBadge label={label} variant={lifecycleStatusVariant(status)} />
}

export function RecordLifecycleToolbar({
  tableName,
  recordId,
  rootRecordId,
  recordStatus = 'live',
  onChanged,
  className = '',
  requireAuthoriserJustification = false,
  authoriserJustificationLabel = 'Authoriser justification (required to approve or reject)',
}) {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()
  const [authoriserJustification, setAuthoriserJustification] = useState('')
  const [acting, setActing] = useState(null)
  const actions = OPERATIONS_BY_STATUS[recordStatus] || []

  const tableKey = tableName.replace(/^admin\./, '').replace(/^public\./, '')

  const executeTransition = async (operation, label, reason) => {
    const { data, error } = await transitionRecordStatus({
      tableName: tableKey,
      recordId,
      operation,
      notes: reason,
    })
    if (error) throw new Error(error)
    if (data?.ok === false || data?.success === false) {
      throw new Error(data?.error || `${label} failed`)
    }
    showSuccess(`${label} completed`)
    onChanged?.(data)
  }

  const runAuthoriserDecision = async (decision, label) => {
    const reason = authoriserJustification.trim()
    if (!reason) {
      showError(`Authoriser justification is required before ${label.toLowerCase()}.`)
      return
    }
    setActing(decision)
    try {
      const { data, error } = await decidePendingRecord({
        tableName: tableKey,
        recordId,
        decision,
        notes: reason,
      })
      if (error) throw new Error(error)
      if (data?.ok === false || data?.success === false) {
        throw new Error(data?.error || `${label} failed`)
      }
      const emailEvent = decision === 'approved' ? 'lifecycle_approved' : 'lifecycle_rejected'
      await notifyEmailEvent(emailEvent, null, {
        table_name: tableKey,
        record_id: recordId,
        root_record_id: rootRecordId,
      }).catch(() => {})
      showSuccess(decision === 'approved' ? 'Approved' : 'Rejected')
      setAuthoriserJustification('')
      onChanged?.(data)
    } catch (err) {
      showError(err?.message || `${label} failed`)
    } finally {
      setActing(null)
    }
  }

  const runOperation = (operation, label, danger) => {
    const reasonPrompt = operation === 'delete'
      ? 'Reason for discarding this record (required)'
      : 'Reason (required)'
    confirm({
      title: `${label} record`,
      message: `Apply "${label}" to this ${tableKey.replace(/_/g, ' ')} record?`,
      danger,
      requireReason: true,
      reasonLabel: reasonPrompt,
      confirmLabel: label,
      action: async (reason) => {
        await executeTransition(operation, label, reason)
      },
    })
  }

  if (!actions.length) return null

  const approveAction = actions.find((action) => action.op === 'approve')
  const rejectAction = actions.find((action) => action.op === 'reject')
  const otherActions = actions.filter((action) => !['approve', 'reject'].includes(action.op))
  const authoriserPermission = approveAction?.permission || rejectAction?.permission || 'lifecycle.authorise'

  return (
    <div className={`space-y-3 ${className}`}>
      {requireAuthoriserJustification && (approveAction || rejectAction) && (
        <PermissionGate permission={authoriserPermission}>
          <div className="rounded-lg border border-violet-700/50 bg-violet-950/20 p-3">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-violet-200">
              {authoriserJustificationLabel}
            </label>
            <textarea
              className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500"
              rows={3}
              value={authoriserJustification}
              onChange={(e) => setAuthoriserJustification(e.target.value)}
              placeholder="Explain why you are approving or rejecting this submission…"
              required
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Required for approve or reject. Stored in the lifecycle audit log for compliance.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {approveAction && (
                <button
                  type="button"
                  onClick={() => runAuthoriserDecision('approved', 'Approve')}
                  disabled={acting != null || !authoriserJustification.trim()}
                  className="rounded-lg border border-green-700 bg-green-900/50 px-4 py-2 text-sm font-medium text-green-100 transition hover:bg-green-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {acting === 'approved' ? 'Approving…' : approveAction.label}
                </button>
              )}
              {rejectAction && (
                <button
                  type="button"
                  onClick={() => runAuthoriserDecision('rejected', 'Reject')}
                  disabled={acting != null || !authoriserJustification.trim()}
                  className="rounded-lg border border-red-700 bg-red-900/50 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {acting === 'rejected' ? 'Rejecting…' : rejectAction.label}
                </button>
              )}
            </div>
          </div>
        </PermissionGate>
      )}

      <div className="flex flex-wrap gap-2">
        {!requireAuthoriserJustification && approveAction && (
          <PermissionGate permission={approveAction.permission}>
            <button
              type="button"
              onClick={() => runOperation(approveAction.op, approveAction.label, approveAction.danger)}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-violet-500 hover:text-violet-200"
            >
              {approveAction.label}
            </button>
          </PermissionGate>
        )}
        {!requireAuthoriserJustification && rejectAction && (
          <PermissionGate permission={rejectAction.permission}>
            <button
              type="button"
              onClick={() => runOperation(rejectAction.op, rejectAction.label, rejectAction.danger)}
              className="rounded-lg border border-red-700 bg-red-900/30 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-900/50"
            >
              {rejectAction.label}
            </button>
          </PermissionGate>
        )}
        {otherActions.map((action) => (
          <PermissionGate key={action.op} permission={action.permission}>
            <button
              type="button"
              onClick={() => runOperation(action.op, action.label, action.danger)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                action.danger
                  ? 'border-red-700 bg-red-900/30 text-red-200 hover:bg-red-900/50'
                  : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-violet-500 hover:text-violet-200'
              }`}
            >
              {action.label}
            </button>
          </PermissionGate>
        ))}
      </div>
      {modal}
    </div>
  )
}

export function ApprovalChainDisplay({ chain = [], progress = null }) {
  const levels = progress?.levels || chain || []

  if (!levels.length) {
    return <p className="text-sm text-gray-500">No authoriser chain configured for this table.</p>
  }

  return (
    <ol className="space-y-3">
      {(Array.isArray(levels) ? levels : []).map((level, index) => (
        <li key={level.level ?? index} className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Level {level.level}
            {level.label ? ` · ${level.label}` : ''}
          </p>
          <ul className="mt-2 space-y-1">
            {(level.authorisers || []).map((authoriser, idx) => (
              <li key={`${authoriser.name}-${idx}`} className="flex items-center justify-between text-sm text-gray-300">
                <span>{authoriser.name}</span>
                <AdminBadge label={authoriser.status} variant={lifecycleStatusVariant(authoriser.status === 'approved' ? 'live' : 'pending')} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}

function jsonPreview(value) {
  if (value == null) return '—'
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

function formatDiffValue(value) {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return jsonPreview(value)
  return String(value)
}

function humanizeFieldName(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function PendingChangesDiff({ tableName, recordId }) {
  const [pending, setPending] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!tableName || !recordId) {
      setPending(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPendingChanges(tableName, recordId).then(({ data, error: fetchError }) => {
      if (cancelled) return
      if (fetchError) {
        setError(fetchError)
        setPending(null)
      } else {
        setPending(data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [tableName, recordId])

  if (loading) {
    return <p className="text-sm text-gray-500">Loading pending changes…</p>
  }

  if (error) {
    return <p className="text-sm text-red-300">{error}</p>
  }

  const proposed = pending?.proposed_changes || {}
  const current = pending?.current_values || {}
  const fields = Object.keys(proposed)

  if (!fields.length) {
    return (
      <p className="text-sm text-gray-500">
        No deferred field changes on file. Validate will restore live status using current row values.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pending changes</h4>
        {pending?.submitted_at && (
          <p className="text-xs text-gray-500">
            Submitted {new Date(pending.submitted_at).toLocaleString()}
          </p>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-950/80 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Current (approved)</th>
              <th className="px-3 py-2 font-medium">Proposed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {fields.map((field) => (
              <tr key={field} className="bg-gray-900/40">
                <td className="px-3 py-2 font-medium text-gray-200">{humanizeFieldName(field)}</td>
                <td className="px-3 py-2 text-gray-400">{formatDiffValue(current[field])}</td>
                <td className="px-3 py-2 text-amber-200">{formatDiffValue(proposed[field])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function humanizeOperation(operation) {
  const key = String(operation || '').toLowerCase()
  return LIFECYCLE_OPERATION_LABELS[key] || key || '—'
}

function parseSnapshot(snapshot) {
  if (snapshot == null) return null
  if (typeof snapshot === 'string') {
    try {
      return JSON.parse(snapshot)
    } catch {
      return null
    }
  }
  if (typeof snapshot === 'object') return snapshot
  return null
}

function snapshotHighlights(snapshot, tableName) {
  const data = parseSnapshot(snapshot)
  if (!data) return []

  if (tableName === 'subscription_plans') {
    const rows = []
    if (data.plan_name) rows.push({ label: 'Plan name', value: data.plan_name })
    if (data.price != null && data.price !== '') {
      rows.push({
        label: 'Price',
        value: formatCurrency(data.price, data.currency || 'USD'),
      })
    }
    if (data.plan_type || data.billing_cycle) {
      rows.push({
        label: 'Plan',
        value: [data.plan_type, data.billing_cycle, data.catalog_scope].filter(Boolean).join(' · '),
      })
    }
    if (data.record_version != null) rows.push({ label: 'Version', value: String(data.record_version) })
    return rows
  }

  return Object.entries(data)
    .filter(([key, value]) => (
      value != null
      && value !== ''
      && !['id', 'created_at', 'updated_at', 'root_record_id', 'parent_record_id'].includes(key)
    ))
    .slice(0, 6)
    .map(([key, value]) => ({
      label: humanizeFieldName(key),
      value: typeof value === 'object' ? jsonPreview(value) : String(value),
    }))
}

export function RecordVersionHistory({
  logs = [],
  adminNameMap = {},
  recordMetaMap = {},
  renderRecordAction = null,
}) {
  if (!logs.length) {
    return <p className="text-sm text-gray-500">No lifecycle transitions recorded yet.</p>
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const meta = recordMetaMap[log.record_id] || recordMetaMap[log.root_record_id] || {}
        const performer = adminNameMap[log.performed_by] || log.performed_by
        const highlights = snapshotHighlights(log.snapshot_data, log.table_name)
        const sameStatus = log.from_status && log.from_status === log.to_status

        return (
          <article
            key={log.id}
            className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <RecordStatusBadge status={log.from_status || 'live'} />
                  <span className="text-gray-500">→</span>
                  <RecordStatusBadge status={log.to_status} />
                  {sameStatus && (
                    <AdminBadge label="Re-submitted" variant="pending" />
                  )}
                </div>
                <p className="text-sm font-medium text-gray-100">
                  {humanizeOperation(log.operation)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(log.performed_at).toLocaleString()}
              </span>
            </div>

            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {(meta.title || log.record_id) && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Plan</dt>
                  <dd className="mt-0.5 font-medium text-gray-100">
                    {meta.title || log.record_id}
                  </dd>
                  {meta.subtitle && (
                    <dd className="text-xs text-gray-400">{meta.subtitle}</dd>
                  )}
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Performed by</dt>
                <dd className="mt-0.5 text-gray-200">{performer || '—'}</dd>
              </div>
              {log.reason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Reason / notes</dt>
                  <dd className="mt-0.5 text-gray-300">{log.reason}</dd>
                </div>
              )}
              {log.version_number != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">Record version</dt>
                  <dd className="mt-0.5 text-gray-200">{log.version_number}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Record ID</dt>
                <dd className="mt-0.5 truncate font-mono text-xs text-gray-400">{log.record_id}</dd>
              </div>
            </dl>

            {highlights.length > 0 && (
              <div className="mt-3 rounded-md border border-gray-700 bg-gray-900/80 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Row snapshot at transition
                </p>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {highlights.map((row) => (
                    <div key={row.label}>
                      <dt className="text-xs text-gray-500">{row.label}</dt>
                      <dd className="font-medium text-gray-200">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {renderRecordAction?.(log)}
              {log.snapshot_data && (
                <details className="text-xs text-gray-400">
                  <summary className="cursor-pointer select-none hover:text-gray-200">
                    Full snapshot JSON
                  </summary>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-950 p-2 text-xs text-gray-400">
                    {jsonPreview(log.snapshot_data)}
                  </pre>
                </details>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function RecordLifecyclePanel({
  tableName,
  recordId,
  rootRecordId,
  recordStatus = 'live',
  onChanged,
  requireAuthoriserJustification = false,
  authoriserJustificationLabel,
}) {
  if (!recordId) return null

  const pendingApproval = recordStatus === 'unauthorised'

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Record lifecycle</h3>
          <p className="text-xs text-gray-500">Governance state for this catalog row</p>
        </div>
        <RecordStatusBadge status={recordStatus} />
      </div>
      {pendingApproval && (
        <div className="mb-4">
          <PendingChangesDiff tableName={tableName} recordId={recordId} />
        </div>
      )}
      <RecordLifecycleToolbar
        tableName={tableName}
        recordId={recordId}
        rootRecordId={rootRecordId || recordId}
        recordStatus={recordStatus}
        onChanged={onChanged}
        requireAuthoriserJustification={requireAuthoriserJustification || pendingApproval}
        authoriserJustificationLabel={authoriserJustificationLabel}
      />
    </section>
  )
}
