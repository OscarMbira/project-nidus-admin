import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LIFECYCLE_PILOT_TABLES,
  PermissionGate,
  fetchAdminUsers,
  fetchPendingAuthorisationRequests,
  processAuthoriserDecision,
} from '@nidus-admin/shared'
import { AdminTable, AuthoriserReviewModal, EmptyState, LoadingState, PendingChangesDiff, useToast } from '@nidus-admin/ui'

const TABLE_LABELS = Object.fromEntries(
  LIFECYCLE_PILOT_TABLES.map(({ key, label }) => [key, label]),
)

function humanizeFieldName(field) {
  return field.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatChangeValue(value) {
  if (value == null) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') {
    const text = JSON.stringify(value)
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  }
  return String(value)
}

function ChangeValuesCell({ values, fallback, tone = 'default' }) {
  if (values && Object.keys(values).length > 0) {
    return (
      <ul className="max-w-xs space-y-1 text-xs">
        {Object.entries(values).map(([field, value]) => (
          <li key={field}>
            <span className="text-gray-500">{humanizeFieldName(field)}:</span>{' '}
            <span className={tone === 'new' ? 'text-amber-200' : 'text-gray-300'}>
              {formatChangeValue(value)}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (fallback) {
    return <span className="text-xs text-gray-400">{fallback}</span>
  }

  return '—'
}

function recordHref(tableName, recordId) {
  if (!recordId) return null
  if (tableName === 'subscription_plans') return `/subscriptions/plan-catalog-form?id=${recordId}`
  if (tableName === 'affiliates') return `/affiliates/affiliate-form?id=${recordId}`
  if (tableName === 'payment_gateways') return `/subscriptions/payment-gateway-form?id=${recordId}`
  return null
}

export default function MyApprovalsPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [reviewState, setReviewState] = useState(null)
  const [expandedRowId, setExpandedRowId] = useState(null)

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  const load = async () => {
    setLoading(true)
    const [requestsRes, usersRes] = await Promise.all([
      fetchPendingAuthorisationRequests(),
      fetchAdminUsers({ limit: 500 }),
    ])
    if (requestsRes.error) {
      showError(typeof requestsRes.error === 'string' ? requestsRes.error : requestsRes.error?.message || String(requestsRes.error))
    }
    if (usersRes.data) setAdminUsers(usersRes.data)
    setRows(requestsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const decide = (row, decision) => {
    if (!row.request_id) {
      showError('Open the record to approve or reject until the authorisation queue row is synced.')
      return
    }
    if (row.can_decide === false) {
      showError('Only the assigned authoriser (or lifecycle.configure) can decide this request.')
      return
    }
    const approve = decision === 'approve'
    setReviewState({ row, decision: approve ? 'approve' : 'reject' })
  }

  const submitDecision = async (reason) => {
    if (!reviewState) return
    const { row, decision } = reviewState
    const approve = decision === 'approve'
    try {
      const { data, error } = await processAuthoriserDecision({
        requestId: row.request_id,
        decision: approve ? 'approved' : 'rejected',
        notes: reason,
      })
      if (error) throw new Error(error)
      if (data?.ok === false || data?.success === false) {
        throw new Error(data?.error || data?.message || 'Decision failed')
      }
      showSuccess(approve ? 'Approved' : 'Rejected')
      setReviewState(null)
      load()
    } catch (err) {
      showError(err?.message || String(err))
      throw err
    }
  }

  if (loading) return <LoadingState message="Loading approval queue..." />

  return (
    <PermissionGate permission="lifecycle.authorise">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">My Approvals</h1>
          <p className="text-sm text-gray-500">
            Pending authorisation requests assigned to you, or all pending queue items if you hold lifecycle.configure.
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No pending approvals"
            description="You have no records waiting for your decision. If a plan shows as Unauthorised on its edit page but is missing here, check record authorisers and pending changes in Record Governance."
          />
        ) : (
          <AdminTable
            columns={[
              {
                key: 'record_label',
                label: 'Record',
                render: (row) => {
                  const href = recordHref(row.table_name, row.record_id)
                  return (
                    <div>
                      <div className="font-medium text-gray-100">
                        {row.record_label || row.record_id}
                      </div>
                      <div className="text-xs text-gray-500">
                        {TABLE_LABELS[row.table_name] || row.table_name}
                        {row.assigned_to_me === false && (
                          <span className="ml-2 text-amber-400">· assigned to another authoriser</span>
                        )}
                      </div>
                      {href && (
                        <Link to={href} className="mt-1 inline-block text-xs text-violet-300 hover:text-violet-200">
                          Open record →
                        </Link>
                      )}
                    </div>
                  )
                },
              },
              {
                key: 'original_changes',
                label: 'Original',
                render: (row) => (
                  <ChangeValuesCell values={row.original_changes} />
                ),
              },
              {
                key: 'new_changes',
                label: 'New',
                render: (row) => (
                  <ChangeValuesCell
                    values={row.new_changes}
                    fallback={row.submission_notes}
                    tone="new"
                  />
                ),
              },
              {
                key: 'changes',
                label: 'Changes',
                render: (row) => {
                  const rowKey = row.request_id || `${row.table_name}:${row.record_id}`
                  const isExpanded = expandedRowId === rowKey
                  return (
                    <button
                      type="button"
                      onClick={() => setExpandedRowId(isExpanded ? null : rowKey)}
                      className="text-xs text-violet-300 hover:text-violet-200"
                    >
                      {isExpanded ? 'Hide changes' : 'View changes'}
                    </button>
                  )
                },
              },
              {
                key: 'submitted_by',
                label: 'Submitted by',
                render: (row) => adminNameMap[row.submitted_by] || row.submitted_by || '—',
              },
              {
                key: 'submitted_at',
                label: 'Submitted',
                render: (row) => (row.submitted_at ? new Date(row.submitted_at).toLocaleString() : '—'),
              },
              {
                key: 'actions',
                label: 'Actions',
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={row.can_decide === false || !row.request_id}
                      onClick={() => decide(row, 'approve')}
                      className="rounded bg-green-700 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={row.can_decide === false || !row.request_id}
                      onClick={() => decide(row, 'reject')}
                      className="rounded bg-red-800 px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reject
                    </button>
                  </div>
                ),
              },
            ]}
            rows={rows}
          />
        )}
        {expandedRowId && (() => {
          const row = rows.find((r) => (r.request_id || `${r.table_name}:${r.record_id}`) === expandedRowId)
          if (!row) return null
          return (
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-200">
                  Pending changes — {row.record_label || row.record_id}
                </h3>
                <button
                  type="button"
                  onClick={() => setExpandedRowId(null)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Close
                </button>
              </div>
              <PendingChangesDiff tableName={row.table_name} recordId={row.record_id} />
            </div>
          )
        })()}
        <AuthoriserReviewModal
          open={Boolean(reviewState)}
          row={reviewState?.row}
          decision={reviewState?.decision}
          tableLabel={reviewState ? TABLE_LABELS[reviewState.row.table_name] : null}
          submitterName={reviewState ? adminNameMap[reviewState.row.submitted_by] : null}
          recordLink={reviewState ? recordHref(reviewState.row.table_name, reviewState.row.record_id) : null}
          onClose={() => setReviewState(null)}
          onConfirm={submitDecision}
        />
      </div>
    </PermissionGate>
  )
}
