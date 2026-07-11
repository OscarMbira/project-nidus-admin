import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchErrorAggregations,
  fetchErrorById,
  fetchErrorLogEntries,
  formatDate,
  PermissionGate,
  updateErrorSeverity,
  updateErrorStatus,
} from '@nidus-admin/shared'
import { AdminCard, EmptyState, LoadingState, useToast } from '@nidus-admin/ui'

const STATUS_OPTIONS = ['new', 'acknowledged', 'investigating', 'resolved', 'ignored', 'recurring']
const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical']

export default function ErrorDetailPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [params, setParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [errorAgg, setErrorAgg] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [expandedEntryId, setExpandedEntryId] = useState(null)
  const [notes, setNotes] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('new')
  const [selectedSeverity, setSelectedSeverity] = useState('low')

  const loadData = async () => {
    setLoading(true)
    let selectedId = params.get('id')

    if (!selectedId) {
      const fallbackRes = await fetchErrorAggregations({ limit: 1 })
      if (fallbackRes.error) {
        showError(fallbackRes.error.message || String(fallbackRes.error))
        setLoading(false)
        return
      }
      selectedId = fallbackRes.data?.[0]?.id || ''
      if (selectedId) setParams({ id: selectedId }, { replace: true })
    }

    if (!selectedId) {
      setErrorAgg(null)
      setTimeline([])
      setLoading(false)
      return
    }

    const detailRes = await fetchErrorById(selectedId)
    if (detailRes.error) {
      showError(detailRes.error.message || String(detailRes.error))
      setLoading(false)
      return
    }

    const aggregation = detailRes.data
    setErrorAgg(aggregation)
    setNotes(aggregation?.resolution_notes || '')
    setSelectedStatus(aggregation?.status || 'new')
    setSelectedSeverity(aggregation?.severity || 'low')

    if (aggregation?.error_hash) {
      const logRes = await fetchErrorLogEntries(aggregation.error_hash)
      if (logRes.error) {
        showError(logRes.error.message || String(logRes.error))
      } else {
        setTimeline(logRes.data || [])
      }
    } else {
      setTimeline([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [params.get('id')])

  const affectedUsers = useMemo(() => {
    const userIds = new Set()
    for (const item of timeline) {
      const userId = item.user_id || item.affected_user_id
      if (userId) userIds.add(userId)
    }
    return [...userIds]
  }, [timeline])

  const primaryAffectedUserId = affectedUsers[0] || null

  const handleImpersonateAffectedUser = () => {
    if (!primaryAffectedUserId) {
      showError('No affected user id is available for this error.')
      return
    }

    const system = errorAgg?.system === 'simulator' ? 'simulator' : 'platform'
    const params = new URLSearchParams({
      userId: primaryAffectedUserId,
      reason: `Reproducing error ${errorAgg?.error_type || errorAgg?.error_hash || errorAgg?.id || ''}`.trim(),
    })
    if (errorAgg?.page_route) params.set('route', errorAgg.page_route)

    navigate(`/${system}/user-impersonation?${params.toString()}`)
  }

  const saveStatus = async () => {
    if (!errorAgg?.id) return
    setBusy('status')
    const { error } = await updateErrorStatus(errorAgg.id, selectedStatus, notes.trim() || null)
    setBusy('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Error status updated.')
    await loadData()
  }

  const saveSeverity = async () => {
    if (!errorAgg?.id) return
    setBusy('severity')
    const { error } = await updateErrorSeverity(errorAgg.id, selectedSeverity)
    setBusy('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Error severity updated.')
    await loadData()
  }

  if (loading) return <LoadingState message="Loading error detail..." />
  if (!errorAgg) {
    return (
      <div className="p-4 md:p-6">
        <EmptyState title="No error selected" description="Use ?id=<error_aggregation_id> in the URL to view detail." />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">{errorAgg.error_type || 'Error Detail'}</h1>
            <p className="mt-1 text-sm text-gray-400">{errorAgg.error_message || 'No error message captured.'}</p>
            <p className="mt-2 text-xs text-gray-500">
              Hash: {errorAgg.error_hash} · Route: {errorAgg.page_route || '—'}
              {errorAgg.component_name ? ` · Component: ${errorAgg.component_name}` : ''}
            </p>
          </div>
          <div className="grid gap-2 text-xs text-gray-400">
            <p>System: <span className="text-gray-200">{errorAgg.system || 'unknown'}</span></p>
            <p>Last Seen: <span className="text-gray-200">{formatDate(errorAgg.last_seen_at)}</span></p>
            <p>Linked Ticket: <span className="text-gray-200">{errorAgg.auto_ticket_id || 'Not linked'}</span></p>
            {errorAgg.auto_ticket_id && (
              <button
                type="button"
                onClick={() => navigate(`/support/support-ticket-detail?id=${errorAgg.auto_ticket_id}`)}
                className="mt-1 rounded border border-gray-600 px-2 py-1 text-left text-xs text-blue-300 hover:bg-gray-800"
              >
                Open linked support ticket
              </button>
            )}
            <PermissionGate permission="users.impersonate">
              {primaryAffectedUserId && (
                <button
                  type="button"
                  onClick={handleImpersonateAffectedUser}
                  className="mt-2 rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-blue-900/70"
                >
                  Impersonate affected user
                </button>
              )}
            </PermissionGate>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Occurrences" value={errorAgg.occurrence_count || 0} />
        <AdminCard title="Affected Users" value={errorAgg.affected_user_count || affectedUsers.length || 0} />
        <AdminCard title="Current Status" value={errorAgg.status || 'new'} />
        <AdminCard title="Current Severity" value={errorAgg.severity || 'low'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Status Action</h2>
          <div className="mt-3 space-y-3">
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Investigation notes / resolution notes"
              className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            />
            <button
              type="button"
              disabled={busy === 'status'}
              onClick={saveStatus}
              className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-60"
            >
              {busy === 'status' ? 'Saving...' : 'Save Status'}
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Severity Action</h2>
          <div className="mt-3 space-y-3">
            <select value={selectedSeverity} onChange={(e) => setSelectedSeverity(e.target.value)} className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100">
              {SEVERITY_OPTIONS.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
            </select>
            <button
              type="button"
              disabled={busy === 'severity'}
              onClick={saveSeverity}
              className="rounded border border-yellow-700 bg-yellow-900/30 px-4 py-2 text-sm text-yellow-200 hover:bg-yellow-900/50 disabled:opacity-60"
            >
              {busy === 'severity' ? 'Saving...' : 'Save Severity'}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Occurrence Timeline</h2>
        {!timeline.length ? (
          <EmptyState title="No occurrence logs" description="No log entries were found for this error hash." />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm text-gray-200">
              <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Component</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Environment</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((entry, index) => {
                  const entryKey = entry.id || `entry-${index}`
                  const isExpanded = expandedEntryId === entryKey
                  return (
                    <Fragment key={entryKey}>
                      <tr key={entryKey} className="border-t border-gray-800">
                        <td className="px-4 py-3 text-xs text-gray-400">{formatDate(entry.created_at || entry.occurred_at)}</td>
                        <td className="px-4 py-3 text-xs text-gray-300">{entry.page_route || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-300">{entry.component_name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-300">
                          <div>{entry.user_email || entry.user_id || entry.affected_user_id || '—'}</div>
                          {entry.user_role && <div className="text-gray-500">{entry.user_role}</div>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          <div>{entry.browser || '—'}</div>
                          <div className="text-gray-500">{entry.os || '—'} · {entry.device_type || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{entry.error_message || entry.message || '—'}</td>
                        <td className="px-4 py-3 text-xs">
                          {(entry.stack_trace || entry.user_description) ? (
                            <button
                              type="button"
                              onClick={() => setExpandedEntryId(isExpanded ? null : entryKey)}
                              className="text-blue-300 hover:text-blue-200"
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entryKey}-details`} className="border-t border-gray-800 bg-gray-950/50">
                          <td colSpan={7} className="px-4 py-3">
                            {entry.stack_trace && (
                              <div className="mb-3">
                                <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Stack Trace</p>
                                <pre className="max-h-64 overflow-auto rounded border border-gray-700 bg-gray-950 p-3 text-xs text-red-200 whitespace-pre-wrap">{entry.stack_trace}</pre>
                              </div>
                            )}
                            {entry.user_description && (
                              <div>
                                <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Additional Context</p>
                                <pre className="overflow-auto rounded border border-gray-700 bg-gray-950 p-3 text-xs text-gray-300 whitespace-pre-wrap">{entry.user_description}</pre>
                              </div>
                            )}
                            {entry.session_id && (
                              <p className="mt-2 text-xs text-gray-500">Session: {entry.session_id}</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">Affected Users</h2>
        {!affectedUsers.length ? (
          <p className="mt-3 text-sm text-gray-500">No per-user ids available in the current timeline payload.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {affectedUsers.map((userId) => (
              <span key={userId} className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300">
                {userId}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
