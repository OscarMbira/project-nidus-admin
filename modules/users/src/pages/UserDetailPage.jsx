import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PermissionGate,
  deactivatePlatformUser,
  fetchAuditLogForTarget,
  fetchOwnedAccountsForUser,
  fetchUserById,
  fetchUserProjects,
  fetchUserSubscriptions,
  formatDate,
  reactivatePlatformUser,
  resetUserPassword,
  useDisplayId,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  LoadingState,
  useConfirmAction,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const CONTENT_TABS = [
  { value: 'Profile', label: 'Profile' },
  { value: 'Subscriptions', label: 'Subscriptions' },
  { value: 'Projects', label: 'Projects' },
  { value: 'audit', label: 'Audit details' },
]

export default function UserDetailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const idParam = searchParams.get('id')
  const { uuid: userId, displayId, loading: resolving, error: resolveError } = useDisplayId('public.users', idParam)

  const [activeTab, setActiveTab] = useState('Profile')
  const [user, setUser] = useState(null)
  const [account, setAccount] = useState(null)
  const [subscriptions, setSubscriptions] = useState([])
  const [projects, setProjects] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const loadData = async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data: loadedUser, error: userError } = await fetchUserById(userId)
    if (userError) {
      setError(userError.message || String(userError))
      setLoading(false)
      return
    }

    setUser(loadedUser)

    const [subscriptionsRes, projectsRes, activityRes] = await Promise.all([
      fetchUserSubscriptions(userId),
      fetchUserProjects(userId),
      fetchAuditLogForTarget('user', userId),
    ])

    if (subscriptionsRes.error || projectsRes.error || activityRes.error) {
      setError(
        subscriptionsRes.error?.message
          || projectsRes.error?.message
          || activityRes.error?.message
          || 'Failed to load user detail data.',
      )
      setLoading(false)
      return
    }

    setSubscriptions(subscriptionsRes.data || [])
    setProjects(projectsRes.data || [])
    setActivity(activityRes.data || [])

    if (loadedUser?.id) {
      const { data: ownedAccounts } = await fetchOwnedAccountsForUser(loadedUser.id)
      setAccount(ownedAccounts?.[0] || null)
    } else {
      setAccount(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setLoading(false)
      return
    }
    loadData()
  }, [userId, resolving, resolveError])

  const handleSuspend = () => {
    if (!user) return
    navigate(`/users/user-suspend?id=${encodeURIComponent(displayId || user.id)}`)
  }

  const handleReactivate = () => {
    if (!user) return
    confirm({
      title: `Reactivate ${user.full_name || user.email}?`,
      message: 'The user will regain access to the platform.',
      confirmLabel: 'Reactivate',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await reactivatePlatformUser(user.id)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadData()
      },
    })
  }

  const handleDeactivate = () => {
    if (!user) return
    confirm({
      title: `Deactivate ${user.full_name || user.email}?`,
      message: 'This user will be blocked from logging in until manually reactivated.',
      confirmLabel: 'Deactivate',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setActionError(null)
        const { error: mutationError } = await deactivatePlatformUser(user.id, reason)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadData()
      },
    })
  }

  const handleResetPassword = () => {
    if (!user) return
    confirm({
      title: `Reset password for ${user.full_name || user.email}?`,
      message: 'The system will trigger password reset handling for this user.',
      confirmLabel: 'Reset Password',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await resetUserPassword(user.id)
        if (mutationError) setActionError(mutationError.message || String(mutationError))
      },
    })
  }

  if (resolving || loading) return <LoadingState message="Loading user detail..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!userId) return <EmptyState title="Missing user id" description="Open this page with ?id=<user-id>." />
  if (!user) return <EmptyState title="User not found" description="No user exists for the provided id." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/users/user-list')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to users
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">{user.full_name || user.email}</h1>
          <p className="text-sm text-gray-500">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="users.deactivate">
            {user.is_active && !user.is_suspended && (
              <button
                type="button"
                onClick={handleDeactivate}
                className="rounded border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/70"
              >
                Deactivate
              </button>
            )}
          </PermissionGate>
          <PermissionGate permission="users.suspend">
            {user.is_active && !user.is_suspended && (
              <button
                type="button"
                onClick={handleSuspend}
                className="rounded border border-orange-700 bg-orange-900/40 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-900/70"
              >
                Suspend
              </button>
            )}
          </PermissionGate>
          <PermissionGate permission="users.reactivate">
            {user.is_suspended && (
              <button
                type="button"
                onClick={handleReactivate}
                className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/70"
              >
                Reactivate
              </button>
            )}
          </PermissionGate>
          <PermissionGate permission="users.password_reset">
            <button
              type="button"
              onClick={handleResetPassword}
              className="rounded border border-amber-700 bg-amber-900/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-900/70"
            >
              Reset Password
            </button>
          </PermissionGate>
        </div>
      </div>

      {actionError && <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">{actionError}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
          <div className="mt-2">
            <AdminBadge
              label={user.is_suspended ? 'Suspended' : user.is_active ? 'Active' : 'Inactive'}
              variant={user.is_suspended ? 'suspended' : user.is_active ? 'active' : 'inactive'}
            />
          </div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Subscriptions</p>
          <p className="mt-2 text-2xl font-semibold text-gray-100">{subscriptions.length}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Projects</p>
          <p className="mt-2 text-2xl font-semibold text-gray-100">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Last login</p>
          <p className="mt-2 text-sm font-medium text-gray-100">{formatDate(user.last_login_at)}</p>
        </div>
      </div>

      <DetailAuditTabList activeTab={activeTab} onChange={setActiveTab} tabs={CONTENT_TABS} />

      {activeTab === 'Profile' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">User profile</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-6">
                <dt className="text-gray-500">User ID</dt>
                <dd className="text-gray-100">{user.id}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-100">{formatDate(user.created_at)}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-gray-500">Account ID</dt>
                <dd className="text-gray-100">{account?.id || '—'}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">Account</h2>
            {account ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-6">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="text-gray-100">{account.account_name || '—'}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-gray-500">Verified</dt>
                  <dd className="text-gray-100">{account.is_verified ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between gap-6">
                  <dt className="text-gray-500">Suspended</dt>
                  <dd className="text-gray-100">{account.is_suspended ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-gray-500">No linked account.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'Subscriptions' && (
        subscriptions.length === 0
          ? <EmptyState title="No subscriptions" description="This user has no platform subscriptions." />
          : (
            <AdminTable
              rows={subscriptions}
              columns={[
                { key: 'plan_type', label: 'Plan Type', render: (r) => r.plan_type || '—' },
                { key: 'billing_cycle', label: 'Billing' },
                { key: 'status', label: 'Status' },
                { key: 'start_date', label: 'Start', render: (r) => formatDate(r.start_date) },
                { key: 'end_date', label: 'End', render: (r) => formatDate(r.end_date) },
              ]}
            />
          )
      )}

      {activeTab === 'Projects' && (
        projects.length === 0
          ? <EmptyState title="No projects" description="This user is not assigned as project manager." />
          : (
            <AdminTable
              rows={projects}
              columns={[
                { key: 'project_name', label: 'Project' },
                { key: 'priority', label: 'Priority' },
                { key: 'account_id', label: 'Account' },
                { key: 'created_at', label: 'Created', render: (r) => formatDate(r.created_at) },
              ]}
            />
          )
      )}

      {activeTab === 'audit' && (
        <div className="space-y-4">
          <AuditDetailsPanel description="Who created or changed this user, and how it is classified.">
            <AuditCard title="Identity" description="How this user is identified.">
              <AuditField label="Full name" value={user.full_name} />
              <AuditField label="Email" value={user.email} />
              <AuditField label="User ID" value={user.id} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this user sits.">
              <AuditField label="Status" value={user.is_suspended ? 'Suspended' : user.is_active ? 'Active' : 'Inactive'} />
              <AuditField label="Account" value={account?.account_name || null} />
            </AuditCard>
            <AuditCard title="Record history" description="When this user was created and last changed.">
              <AuditField label="Created by" value={user.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={user.created_at} />
              <AuditField label="Updated by" value={user.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={user.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-200">Activity log</h2>
            {activity.length === 0
              ? <EmptyState title="No activity found" description="No audit entries for this user yet." />
              : (
                <AdminTable
                  rows={activity}
                  columns={[
                    { key: 'action', label: 'Action' },
                    { key: 'admin_role', label: 'Admin Role' },
                    { key: 'target_type', label: 'Target Type' },
                    { key: 'created_at', label: 'When', render: (r) => formatDate(r.created_at) },
                  ]}
                />
              )}
          </div>
        </div>
      )}

      {modal}
    </div>
  )
}
