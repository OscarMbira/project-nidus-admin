import { useEffect, useMemo, useState } from 'react'
import { PermissionGate, fetchAdminSessions, fetchAdminUsers, formatDate, terminateAdminSession } from '@nidus-admin/shared'
import { AdminTable, EmptyState, LoadingState, SearchBar, useConfirmAction, useToast } from '@nidus-admin/ui'

export default function ActiveSessionsPage() {
  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [adminNames, setAdminNames] = useState({})

  const loadSessions = async () => {
    setLoading(true)
    setError(null)
    const [sessionsRes, usersRes] = await Promise.all([
      fetchAdminSessions({ activeOnly: true }),
      fetchAdminUsers(),
    ])

    if (sessionsRes.error) {
      setError(sessionsRes.error.message || String(sessionsRes.error))
      setRows([])
      setLoading(false)
      return
    }

    if (usersRes.error) {
      setError(usersRes.error.message || String(usersRes.error))
      setRows([])
      setLoading(false)
      return
    }

    const nameMap = {}
    for (const user of usersRes.data || []) {
      nameMap[user.id] = user.full_name || user.email || user.id
    }

    setAdminNames(nameMap)
    setRows((sessionsRes.data || []).filter((row) => row.is_active))
    setLoading(false)
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => {
      const adminLabel = adminNames[row.admin_user_id] || row.admin_user_id
      return [adminLabel, row.ip_address, row.user_agent]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    })
  }, [rows, search, adminNames])

  const handleTerminate = (row) => {
    confirm({
      title: 'Terminate active session?',
      message: 'The selected admin session will be revoked immediately.',
      confirmLabel: 'Terminate',
      danger: true,
      onConfirm: async () => {
        const { error: mutationError } = await terminateAdminSession(row.id)
        if (mutationError) {
          showError(mutationError.message || String(mutationError))
          return
        }
        showSuccess('Session terminated successfully.')
        await loadSessions()
      },
    })
  }

  if (loading) return <LoadingState message="Loading active sessions..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Active Sessions</h1>
          <p className="text-sm text-gray-500">Review and terminate active admin login sessions.</p>
        </div>
        <SearchBar value={search} onChange={setSearch} placeholder="Search by admin, IP, or user agent..." />
      </div>

      {filteredRows.length === 0 ? (
        <EmptyState title="No active sessions" description="There are no active admin sessions to display." />
      ) : (
        <AdminTable
          rows={filteredRows}
          columns={[
            {
              key: 'admin_user_id',
              label: 'Admin User',
              render: (r) => adminNames[r.admin_user_id] || r.admin_user_id || '—',
            },
            { key: 'ip_address', label: 'IP Address', render: (r) => r.ip_address || '—' },
            {
              key: 'user_agent',
              label: 'User Agent',
              sortable: false,
              render: (r) => (
                <span className="block max-w-lg truncate text-xs text-gray-300" title={r.user_agent || '—'}>
                  {r.user_agent || '—'}
                </span>
              ),
            },
            { key: 'started_at', label: 'Started At', render: (r) => formatDate(r.started_at) },
            { key: 'expires_at', label: 'Expires At', render: (r) => formatDate(r.expires_at) },
            {
              key: 'actions',
              label: 'Actions',
              sortable: false,
              render: (r) => (
                <PermissionGate permission="admins.sessions.terminate">
                  <button
                    type="button"
                    className="rounded border border-red-700 bg-red-900/40 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70"
                    onClick={() => handleTerminate(r)}
                  >
                    Terminate
                  </button>
                </PermissionGate>
              ),
            },
          ]}
        />
      )}

      {modal}
    </div>
  )
}
