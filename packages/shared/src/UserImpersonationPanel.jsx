import { useEffect, useMemo, useState } from 'react'
import { PermissionGate } from './PermissionGate.jsx'
import { fetchAdminUsers, fetchImpersonationLog, fetchUsers } from './dataServices.js'
import { formatDate } from './formatters.js'
import { endImpersonation, startImpersonation } from './mutationServices.js'

const TARGET_SYSTEMS = ['platform', 'simulator']
const PLATFORM_URL = import.meta.env.VITE_PLATFORM_APP_URL || 'http://localhost:5173'
const SIMULATOR_URL = import.meta.env.VITE_SIMULATOR_APP_URL || 'http://localhost:5174'

function systemLabel(system) {
  if (system === 'platform') return 'Platform'
  if (system === 'simulator') return 'Simulator'
  return system
}

function targetAppBaseUrl(targetSystem) {
  return targetSystem === 'simulator' ? SIMULATOR_URL : PLATFORM_URL
}

async function checkTargetAppReachable(baseUrl) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    await fetch(baseUrl, { mode: 'no-cors', signal: controller.signal })
    clearTimeout(timeout)
    return true
  } catch {
    return false
  }
}

function buildTargetUrl(targetSystem, impersonationId, targetAuthUserId, pageRoute) {
  const targetBase = targetAppBaseUrl(targetSystem)
  const url = new URL(targetBase)
  url.searchParams.set('impersonation_id', impersonationId)
  url.searchParams.set('target_user_id', targetAuthUserId)
  if (pageRoute) url.searchParams.set('redirect', pageRoute)
  return url.toString()
}

function findPlatformUser(users, userId) {
  if (!userId) return null
  return users.find((user) => user.id === userId || user.auth_user_id === userId) || null
}

function resolveAuthUserId(user, userId) {
  if (user?.auth_user_id) return user.auth_user_id
  return userId
}

export function UserImpersonationPanel({
  fixedTargetSystem = null,
  title = 'User Impersonation',
  description = 'Start supervised impersonation sessions and review log history.',
  initialTargetUserId = '',
  initialReason = '',
  initialPageRoute = '',
  AdminTable,
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
}) {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [users, setUsers] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [logRows, setLogRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(initialTargetUserId || '')
  const [targetSystem, setTargetSystem] = useState(fixedTargetSystem || 'platform')
  const [reason, setReason] = useState(initialReason || '')
  const [pageRoute, setPageRoute] = useState(initialPageRoute || '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [formSuccess, setFormSuccess] = useState(null)
  const [openedUrl, setOpenedUrl] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const [usersRes, adminsRes, logsRes] = await Promise.all([fetchUsers(), fetchAdminUsers(), fetchImpersonationLog()])

    if (usersRes.error || adminsRes.error || logsRes.error) {
      setError(
        usersRes.error?.message
        || adminsRes.error?.message
        || logsRes.error?.message
        || String(usersRes.error || adminsRes.error || logsRes.error),
      )
      setLoading(false)
      return
    }

    setUsers(usersRes.data || [])
    setAdminUsers(adminsRes.data || [])
    setLogRows(logsRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (fixedTargetSystem) setTargetSystem(fixedTargetSystem)
  }, [fixedTargetSystem])

  useEffect(() => {
    if (initialTargetUserId) setSelectedUserId(initialTargetUserId)
  }, [initialTargetUserId])

  useEffect(() => {
    if (initialReason) setReason(initialReason)
  }, [initialReason])

  useEffect(() => {
    if (initialPageRoute) setPageRoute(initialPageRoute)
  }, [initialPageRoute])

  const userMap = useMemo(() => {
    const map = {}
    for (const user of users) {
      const label = user.full_name || user.email || user.id
      map[user.id] = label
      if (user.auth_user_id) map[user.auth_user_id] = label
    }
    return map
  }, [users])

  const adminMap = useMemo(
    () => Object.fromEntries(adminUsers.map((u) => [u.id, u.full_name || u.email || u.id])),
    [adminUsers],
  )

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const pool = !query
      ? users
      : users.filter((u) => [u.full_name, u.email, u.id, u.auth_user_id].some((value) => String(value ?? '').toLowerCase().includes(query)))
    return pool.slice(0, 100)
  }, [users, search])

  useEffect(() => {
    if (!search.trim() || selectedUserId) return
    if (filteredUsers.length === 1) {
      setSelectedUserId(filteredUsers[0].id)
    }
  }, [filteredUsers, search, selectedUserId])

  const scopedLogRows = useMemo(() => {
    if (!fixedTargetSystem) return logRows
    return logRows.filter((row) => row.target_system === fixedTargetSystem)
  }, [logRows, fixedTargetSystem])

  const selectedUser = useMemo(
    () => findPlatformUser(users, selectedUserId),
    [users, selectedUserId],
  )

  const startNewImpersonation = async (event) => {
    event.preventDefault()
    setFormError(null)
    setFormSuccess(null)
    setOpenedUrl(null)

    if (!selectedUserId) {
      const message = 'Select a target user from the list below.'
      setFormError(message)
      showError(message)
      return
    }

    const targetAuthUserId = resolveAuthUserId(selectedUser, selectedUserId)
    if (!targetAuthUserId) {
      const message = 'This user has no linked auth account and cannot be impersonated.'
      setFormError(message)
      showError(message)
      return
    }

    if (!reason.trim()) {
      const message = 'Reason is required before starting impersonation.'
      setFormError(message)
      showError(message)
      return
    }

    setSubmitting(true)
    const { data, error: mutationError } = await startImpersonation(targetAuthUserId, targetSystem, reason.trim())
    setSubmitting(false)

    if (mutationError) {
      const message = mutationError.message || String(mutationError)
      setFormError(message)
      showError(message)
      return
    }

    const impersonationId = data
    const targetBase = targetAppBaseUrl(targetSystem)
    const targetUrl = buildTargetUrl(targetSystem, impersonationId, targetAuthUserId, pageRoute.trim() || null)
    const appReachable = await checkTargetAppReachable(targetBase)

    if (appReachable) {
      const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer')
      const successMessage = `${systemLabel(targetSystem)} impersonation session started.`
      setFormSuccess(popup ? successMessage : 'Session started, but your browser blocked the new tab.')
    } else {
      setFormSuccess(
        `Impersonation session logged. The ${systemLabel(targetSystem)} app is not running at ${targetBase} — start it, then use the link below.`,
      )
    }

    setOpenedUrl(targetUrl)
    showSuccess(`${systemLabel(targetSystem)} impersonation session started.`)
    setReason(initialReason || '')
    await loadData()
  }

  const stopImpersonation = (row) => {
    confirm({
      title: 'End impersonation session?',
      message: `Session for ${userMap[row.target_user_id] || row.target_user_id} will be closed.`,
      confirmLabel: 'End Session',
      danger: true,
      onConfirm: async () => {
        const { error: mutationError } = await endImpersonation(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Impersonation session ended.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading impersonation tools..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{title}</h1>
        <p className="text-sm text-gray-500">{description}</p>
        {fixedTargetSystem && (
          <p className="mt-2 text-xs text-gray-400">
            Opens {systemLabel(fixedTargetSystem)} at {targetAppBaseUrl(fixedTargetSystem)} in a new tab as the selected user.
            {' '}The {systemLabel(fixedTargetSystem)} dev server must be running (default port {fixedTargetSystem === 'simulator' ? '5174' : '5173'}).
          </p>
        )}
      </div>

      <PermissionGate
        permission="users.impersonate"
        fallback={(
          <div className="rounded-lg border border-amber-800 bg-amber-900/20 px-4 py-3 text-sm text-amber-200">
            You do not have permission to start impersonation sessions (users.impersonate).
          </div>
        )}
      >
        <form onSubmit={startNewImpersonation} className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-gray-200">Start Impersonation</h2>

          {formError && (
            <div className="mt-3 rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {formError}
            </div>
          )}

          {formSuccess && (
            <div className="mt-3 rounded border border-green-800 bg-green-900/30 px-3 py-2 text-sm text-green-200">
              <p>{formSuccess}</p>
              {openedUrl && (
                <div className="mt-2 space-y-1">
                  <a
                    href={openedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-xs text-blue-300 underline hover:text-blue-200"
                  >
                    Open {systemLabel(targetSystem)} session
                  </a>
                  <p className="text-xs text-gray-400">
                    Dev server: {targetAppBaseUrl(targetSystem)} — run Platform/Simulator from the main project-nidus repo if this page fails to load.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <div className={fixedTargetSystem ? 'lg:col-span-3' : 'lg:col-span-2'}>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Search User</label>
              <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, user id..." />
            </div>
            {!fixedTargetSystem && (
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Target System</label>
                <select
                  value={targetSystem}
                  onChange={(event) => setTargetSystem(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  {TARGET_SYSTEMS.map((system) => (
                    <option key={system} value={system}>{systemLabel(system)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Target User</label>
            {search.trim() && filteredUsers.length > 0 ? (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-gray-700 bg-gray-950 p-2">
                {filteredUsers.map((user) => {
                  const isSelected = user.id === selectedUserId
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId(user.id)
                          setFormError(null)
                        }}
                        className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition ${
                          isSelected
                            ? 'border border-blue-600 bg-blue-900/30 text-blue-100'
                            : 'border border-transparent text-gray-200 hover:bg-gray-800'
                        }`}
                      >
                        <span>
                          <span className="font-medium">{user.full_name || 'Unnamed user'}</span>
                          <span className="ml-2 text-xs text-gray-400">{user.email || user.id}</span>
                        </span>
                        <span className="text-right text-xs">
                          {isSelected && <span className="text-blue-300">Selected</span>}
                          {!user.auth_user_id && (
                            <span className="block text-amber-400">No auth account</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <select
                value={selectedUserId}
                onChange={(event) => {
                  setSelectedUserId(event.target.value)
                  setFormError(null)
                }}
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select user...</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {(u.full_name || 'Unnamed user')} — {u.email || u.id}
                  </option>
                ))}
              </select>
            )}
            {selectedUser && (
              <p className="mt-2 text-xs text-gray-400">
                Selected: {selectedUser.full_name || selectedUser.email || selectedUser.id}
                {!selectedUser.auth_user_id && (
                  <span className="ml-2 text-amber-400">— no linked auth account</span>
                )}
              </p>
            )}
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Reason</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                setFormError(null)
              }}
              placeholder="Required audit reason — e.g. reproducing reported error on billing page..."
              className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {initialPageRoute && (
            <div className="mt-3">
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Landing route</label>
              <input
                type="text"
                value={pageRoute}
                onChange={(event) => setPageRoute(event.target.value)}
                placeholder="/projects/abc123"
                className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          <div className="mt-4">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/70 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? 'Starting…' : `Open ${systemLabel(targetSystem)} as User`}
            </button>
          </div>
        </form>
      </PermissionGate>

      {scopedLogRows.length === 0 ? (
        <EmptyState
          title="No impersonation records"
          description={fixedTargetSystem
            ? `No ${systemLabel(fixedTargetSystem)} impersonation sessions logged yet.`
            : 'Started sessions will appear in this log.'}
        />
      ) : (
        <AdminTable
          rows={scopedLogRows}
          columns={[
            { key: 'started_at', label: 'Started', render: (r) => formatDate(r.started_at) },
            { key: 'ended_at', label: 'Ended', render: (r) => formatDate(r.ended_at) },
            ...(!fixedTargetSystem ? [{ key: 'target_system', label: 'System', render: (r) => systemLabel(r.target_system) || '—' }] : []),
            { key: 'target_user_id', label: 'Target User', render: (r) => userMap[r.target_user_id] || r.target_user_id || '—' },
            { key: 'admin_user_id', label: 'Admin User', render: (r) => adminMap[r.admin_user_id] || r.admin_user_id || '—' },
            { key: 'reason', label: 'Reason', render: (r) => r.reason || '—' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => (
                <AdminBadge
                  label={r.ended_at ? 'ended' : 'active'}
                  variant={r.ended_at ? 'suspended' : 'active'}
                />
              ),
            },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                !r.ended_at ? (
                  <PermissionGate permission="users.impersonate">
                    <button
                      type="button"
                      onClick={() => stopImpersonation(r)}
                      className="rounded border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200 hover:bg-red-900/60"
                    >
                      End Session
                    </button>
                  </PermissionGate>
                ) : '—'
              ),
            },
          ]}
        />
      )}

      {modal}
    </div>
  )
}
