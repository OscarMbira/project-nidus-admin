import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PermissionGate,
  fetchAccountById,
  fetchAccountMembers,
  fetchPlatformSubscriptions,
  formatDate,
  suspendOrganisation,
  useDisplayId,
  verifyOrganisation,
} from '@nidus-admin/shared'
import { AdminBadge, AdminCard, AdminTable, EmptyState, LoadingState, useConfirmAction } from '@nidus-admin/ui'

export default function OrgDetailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { confirm, modal } = useConfirmAction()
  const idParam = searchParams.get('id')
  const { uuid: accountId, loading: resolving, error: resolveError } = useDisplayId('public.accounts', idParam)

  const [account, setAccount] = useState(null)
  const [members, setMembers] = useState([])
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const loadData = async () => {
    if (!accountId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const [accountRes, membersRes, subscriptionRes] = await Promise.all([
      fetchAccountById(accountId),
      fetchAccountMembers(accountId),
      fetchPlatformSubscriptions({ filters: [{ op: 'eq', col: 'account_id', val: accountId }] }),
    ])

    if (accountRes.error || membersRes.error || subscriptionRes.error) {
      setError(
        accountRes.error?.message
          || membersRes.error?.message
          || subscriptionRes.error?.message
          || 'Failed to load organisation detail.',
      )
      setLoading(false)
      return
    }

    setAccount(accountRes.data || null)
    setMembers(membersRes.data || [])
    setSubscriptions(subscriptionRes.data || [])
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
  }, [accountId, resolving, resolveError])

  const handleVerify = () => {
    if (!account) return
    confirm({
      title: `Verify ${account.account_name || account.id}?`,
      message: 'This will mark the organisation as verified.',
      confirmLabel: 'Verify',
      onConfirm: async () => {
        setActionError(null)
        const { error: mutationError } = await verifyOrganisation(account.id)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadData()
      },
    })
  }

  const handleSuspend = () => {
    if (!account) return
    confirm({
      title: `Suspend ${account.account_name || account.id}?`,
      message: 'This can impact all members in the organisation.',
      confirmLabel: 'Suspend',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        setActionError(null)
        const { error: mutationError } = await suspendOrganisation(account.id, reason)
        if (mutationError) {
          setActionError(mutationError.message || String(mutationError))
          return
        }
        await loadData()
      },
    })
  }

  if (resolving || loading) return <LoadingState message="Loading organisation detail..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!accountId) return <EmptyState title="Missing organisation id" description="Open this page with ?id=<account-id>." />
  if (!account) return <EmptyState title="Organisation not found" description="No organisation exists for the provided id." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/users/org-list')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to organisations
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">{account.account_name || account.id}</h1>
          <p className="text-sm text-gray-500">Organisation detail and related member/subscription records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="orgs.verify">
            <button
              type="button"
              onClick={handleVerify}
              disabled={account.is_verified}
              className="rounded border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50"
            >
              Verify
            </button>
          </PermissionGate>
          <PermissionGate permission="orgs.suspend">
            <button
              type="button"
              onClick={handleSuspend}
              className="rounded border border-red-700 bg-red-900/40 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-900/70"
            >
              Suspend
            </button>
          </PermissionGate>
        </div>
      </div>

      {actionError && <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">{actionError}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminCard title="Members" value={members.length} />
        <AdminCard title="Subscriptions" value={subscriptions.length} />
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Verification</p>
          <div className="mt-2">
            <AdminBadge label={account.is_verified ? 'Verified' : 'Unverified'} variant={account.is_verified ? 'active' : 'pending_activation'} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Suspension</p>
          <div className="mt-2">
            <AdminBadge label={account.is_suspended ? 'Suspended' : 'Active'} variant={account.is_suspended ? 'suspended' : 'active'} />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-gray-200">Account info</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-6 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
            <dt className="text-gray-500">Account ID</dt>
            <dd className="text-gray-100">{account.id}</dd>
          </div>
          <div className="flex justify-between gap-6 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
            <dt className="text-gray-500">Owner User ID</dt>
            <dd className="text-gray-100">{account.owner_user_id || '—'}</dd>
          </div>
          <div className="flex justify-between gap-6 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
            <dt className="text-gray-500">Created</dt>
            <dd className="text-gray-100">{formatDate(account.created_at)}</dd>
          </div>
          <div className="flex justify-between gap-6 rounded border border-gray-800 bg-gray-950/40 px-3 py-2">
            <dt className="text-gray-500">Updated</dt>
            <dd className="text-gray-100">{formatDate(account.updated_at)}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">Members</h2>
        {members.length === 0 ? (
          <EmptyState title="No members found" description="No users are currently associated with this account." />
        ) : (
          <AdminTable
            rows={members}
            columns={[
              { key: 'full_name', label: 'Full Name', render: (r) => r.full_name || '—' },
              { key: 'email', label: 'Email' },
              {
                key: 'is_active',
                label: 'Status',
                sortable: false,
                render: (r) => <AdminBadge label={r.is_active ? 'Active' : 'Inactive'} variant={r.is_active ? 'active' : 'suspended'} />,
              },
            ]}
          />
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-200">Subscription info</h2>
        {subscriptions.length === 0 ? (
          <EmptyState title="No subscriptions found" description="No subscriptions are linked to this organisation." />
        ) : (
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
        )}
      </div>

      {modal}
    </div>
  )
}
