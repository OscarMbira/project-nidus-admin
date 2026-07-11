import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PaymentJourneyTab from '../components/PaymentJourneyTab.jsx'
import {
  deleteSubscription,
  extendSubscriptionTrial,
  fetchAuditLogForTarget,
  fetchSubscriptionDetail,
  fetchSubscriptionRecordAnySystem,
  formatCurrency,
  formatDate,
  formatPlanLabel,
  parseSubscriptionFeatures,
  PermissionGate,
  SUBSCRIPTION_DISPLAY_TABLE,
  systemLabel,
  updateSubscriptionStatus,
  useDisplayId,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminModal,
  AuditTrailWidget,
  EmptyState,
  LoadingState,
  SubscriptionFeaturesList,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const TABS = ['Overview', 'Billing', 'Payments', 'Audit']
const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'expired', 'cancelled', 'paused']

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

function daysRemaining(expiresAt) {
  if (!expiresAt) return null
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export default function SubscriptionDetailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const { uuid: subscriptionId, displayId, loading: resolving, error: resolveError } = useDisplayId(SUBSCRIPTION_DISPLAY_TABLE, idParam)
  const urlSystem = searchParams.get('system') === 'simulator' ? 'simulator' : 'platform'

  const { confirm, modal } = useConfirmAction()
  const { showSuccess, showError } = useToast()

  const [activeTab, setActiveTab] = useState('Overview')
  const [targetSystem, setTargetSystem] = useState(urlSystem)
  const [subscription, setSubscription] = useState(null)
  const [detail, setDetail] = useState(null)
  const [auditTrail, setAuditTrail] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState('active')
  const [trialModal, setTrialModal] = useState({
    open: false,
    extensionDays: '7',
    reason: '',
    submitting: false,
  })

  const loadDetail = async () => {
    if (!subscriptionId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const {
      data: baseSubscription,
      targetSystem: resolvedSystem,
      error: baseError,
    } = await fetchSubscriptionRecordAnySystem(subscriptionId)

    if (baseError) {
      setError(toErrorMessage(baseError, 'Failed to load subscription.'))
      setLoading(false)
      return
    }
    if (!baseSubscription || !resolvedSystem) {
      setSubscription(null)
      setDetail(null)
      setAuditTrail([])
      setLoading(false)
      return
    }

    setTargetSystem(resolvedSystem)
    if (resolvedSystem !== urlSystem && idParam) {
      const params = new URLSearchParams({ id: idParam, system: resolvedSystem })
      navigate(`/subscriptions/subscription-detail?${params.toString()}`, { replace: true })
    }

    const [detailRes, auditRes] = await Promise.all([
      fetchSubscriptionDetail(subscriptionId, resolvedSystem),
      fetchAuditLogForTarget('subscription', subscriptionId),
    ])

    const detailData = Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data
    const nextError = detailRes.error || auditRes.error

    if (nextError) {
      setError(toErrorMessage(nextError, 'Failed to load subscription detail data.'))
      setLoading(false)
      return
    }

    setSubscription(baseSubscription)
    setDetail(detailData || null)
    setAuditTrail(auditRes.data || [])
    setSelectedStatus(baseSubscription.status || detailData?.subscription_status || 'active')
    setLoading(false)
  }

  useEffect(() => {
    setTargetSystem(urlSystem)
  }, [urlSystem])

  useEffect(() => {
    if (resolving) return
    if (resolveError) {
      setError(resolveError)
      setLoading(false)
      return
    }
    loadDetail()
  }, [subscriptionId, urlSystem, resolving, resolveError])

  const merged = useMemo(() => ({ ...(subscription || {}), ...(detail || {}) }), [subscription, detail])
  const featureList = useMemo(() => parseSubscriptionFeatures(merged), [merged])
  const remainingDays = daysRemaining(merged.expires_at)
  const editUrl = `/subscriptions/subscription-form?id=${encodeURIComponent(displayId || subscriptionId)}&system=${encodeURIComponent(targetSystem)}`

  const performStatusUpdate = async (newStatus, reason) => {
    if (!subscription) return false
    const { error: mutationError } = await updateSubscriptionStatus(subscription.id, targetSystem, newStatus, reason)
    if (mutationError) {
      showError(toErrorMessage(mutationError, 'Failed to update subscription status.'))
      return false
    }
    showSuccess('Subscription status updated.')
    await loadDetail()
    return true
  }

  const handleDelete = () => {
    if (!subscription) return
    confirm({
      title: 'Delete this subscription?',
      message: 'This permanently removes the subscription record.',
      confirmLabel: 'Delete Subscription',
      danger: true,
      requireReason: true,
      onConfirm: async (reason) => {
        const { error: mutationError } = await deleteSubscription(subscription.id, targetSystem, reason)
        if (mutationError) {
          showError(toErrorMessage(mutationError, 'Failed to delete subscription.'))
          return
        }
        showSuccess('Subscription deleted.')
        navigate('/subscriptions/subscription-list')
      },
    })
  }

  const handleExtendTrial = async () => {
    if (!subscription) return
    const extensionDays = Number.parseInt(trialModal.extensionDays, 10)
    if (!Number.isFinite(extensionDays) || extensionDays <= 0) {
      showError('Extension days must be greater than zero.')
      return
    }
    if (!trialModal.reason.trim()) {
      showError('Reason is required for extending trial.')
      return
    }
    setTrialModal((prev) => ({ ...prev, submitting: true }))
    const { error: mutationError } = await extendSubscriptionTrial(
      subscription.id,
      targetSystem,
      extensionDays,
      trialModal.reason.trim(),
    )
    if (mutationError) {
      showError(toErrorMessage(mutationError, 'Failed to extend trial.'))
      setTrialModal((prev) => ({ ...prev, submitting: false }))
      return
    }
    showSuccess('Trial extension applied.')
    setTrialModal({ open: false, extensionDays: '7', reason: '', submitting: false })
    await loadDetail()
  }

  if (resolving || loading) return <LoadingState message="Loading subscription detail..." />
  if (error) return <div className="p-6 text-red-400">{error}</div>
  if (!subscriptionId) return <EmptyState title="Missing subscription id" description="Open this page with ?id=<subscription-id>. The system (platform or simulator) is detected automatically." />
  if (!subscription) {
    return (
      <EmptyState
        title="Subscription not found"
        description={
          displayId || idParam
            ? `No subscription exists for ${displayId || idParam}. The generated ID may point to a deleted record, or the subscriptions module may need a rebuild (pnpm run dev:system-subscriptions).`
            : 'No subscription exists for the provided id.'
        }
      />
    )
  }

  return (
    <PermissionGate permission="subscriptions.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <button type="button" onClick={() => navigate('/subscriptions/subscription-list')} className="mb-2 text-xs text-gray-400 hover:text-gray-200">← Back to subscriptions</button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-100">{formatPlanLabel(merged.plan_type)}</h1>
              <AdminBadge label={systemLabel(targetSystem)} variant={targetSystem === 'simulator' ? 'suspended' : 'active'} />
            </div>
            <p className="text-sm text-gray-500">{merged.user_email || merged.user_id || subscription.id}</p>
          </div>

          <PermissionGate permission="subscriptions.edit">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate(editUrl)} className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/70">Edit</button>
              <button type="button" onClick={() => setTrialModal({ open: true, extensionDays: '7', reason: '', submitting: false })} className="rounded border border-amber-700 bg-amber-900/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-900/70">Extend Trial</button>
              <PermissionGate permission="subscriptions.delete">
                <button type="button" onClick={handleDelete} className="rounded border border-rose-800 bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/70">Delete</button>
              </PermissionGate>
            </div>
          </PermissionGate>
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">{systemLabel(targetSystem)} subscription</p>
              <h2 className="mt-1 text-3xl font-semibold text-gray-100">{formatPlanLabel(merged.plan_type)}</h2>
              <p className="mt-1 text-sm text-gray-400">
                {formatCurrency(merged.amount_paid, merged.currency || 'USD')}
                {merged.billing_cycle ? ` / ${merged.billing_cycle}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AdminBadge label={(merged.subscription_status || merged.status || 'unknown').replaceAll('_', ' ')} variant={merged.status || merged.subscription_status || 'default'} />
              {merged.is_lifetime && <AdminBadge label="Lifetime" variant="active" />}
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Started</p>
              <p className="mt-1 text-sm text-gray-200">{formatDate(merged.started_at)}</p>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">{merged.is_lifetime ? 'Access' : 'Renews / Expires'}</p>
              <p className="mt-1 text-sm text-gray-200">{merged.is_lifetime ? 'Lifetime' : formatDate(merged.expires_at) || '—'}</p>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Next billing</p>
              <p className="mt-1 text-sm text-gray-200">{formatDate(merged.next_billing_date) || '—'}</p>
            </div>
            <div className="rounded border border-gray-800 bg-gray-950/60 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Days remaining</p>
              <p className="mt-1 text-sm text-gray-200">{remainingDays == null ? '—' : `${remainingDays} days`}</p>
            </div>
          </div>
          {featureList.length > 0 && (
            <div className="mt-5 border-t border-gray-800 pt-5">
              <p className="text-xs uppercase tracking-wide text-gray-500">Included features</p>
              <div className="mt-3">
                <SubscriptionFeaturesList features={featureList} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-800 pb-2">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded px-3 py-1.5 text-sm transition ${
                activeTab === tab ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Overview' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <h2 className="text-sm font-semibold text-gray-200">Account</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-6"><dt className="text-gray-500">Subscription ID</dt><dd className="text-gray-100">{subscription.id}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-gray-500">User ID</dt><dd className="text-gray-100">{merged.user_id || '—'}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-gray-500">User Email</dt><dd className="text-gray-100">{merged.user_email || '—'}</dd></div>
                {targetSystem === 'platform' && (
                  <div className="flex justify-between gap-6"><dt className="text-gray-500">Account ID</dt><dd className="text-gray-100">{merged.account_id || '—'}</dd></div>
                )}
              </dl>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <h2 className="text-sm font-semibold text-gray-200">Plan details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-6"><dt className="text-gray-500">Plan name</dt><dd className="text-gray-100">{merged.plan_name || formatPlanLabel(merged.plan_type)}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-gray-500">Plan type</dt><dd className="text-gray-100">{merged.plan_type || '—'}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-gray-500">Trial end</dt><dd className="text-gray-100">{formatDate(merged.trial_end) || '—'}</dd></div>
                <div className="flex justify-between gap-6"><dt className="text-gray-500">Created</dt><dd className="text-gray-100">{formatDate(merged.created_at)}</dd></div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === 'Billing' && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Amount paid</p><p className="mt-2 text-sm font-medium text-gray-100">{formatCurrency(merged.amount_paid, merged.currency || 'USD')}</p></div>
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Billing cycle</p><p className="mt-2 text-sm font-medium text-gray-100">{merged.billing_cycle || '—'}</p></div>
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Grace period end</p><p className="mt-2 text-sm font-medium text-gray-100">{formatDate(merged.grace_period_end) || '—'}</p></div>
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4"><p className="text-xs uppercase tracking-wide text-gray-500">Cancel at period end</p><p className="mt-2 text-sm font-medium text-gray-100">{merged.cancel_at_period_end ? 'Yes' : 'No'}</p></div>
            </div>

            <PermissionGate permission="subscriptions.edit">
              <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
                <h2 className="text-sm font-semibold text-gray-200">Update status</h2>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="w-full sm:max-w-xs">
                    <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">New status</label>
                    <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100">
                      {STATUS_OPTIONS.filter((status) => targetSystem !== 'simulator' || status !== 'paused').map((status) => (
                        <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      confirm({
                        title: `Change status to ${selectedStatus.replaceAll('_', ' ')}?`,
                        message: 'This action updates the subscription status and is recorded in the audit log.',
                        confirmLabel: 'Update Status',
                        requireReason: true,
                        onConfirm: async (reason) => { await performStatusUpdate(selectedStatus, reason) },
                      })
                    }}
                    className="rounded border border-blue-700 bg-blue-900/40 px-3 py-2 text-sm text-blue-200 hover:bg-blue-900/70"
                  >
                    Apply Status
                  </button>
                </div>
              </div>
            </PermissionGate>
          </div>
        )}

        {activeTab === 'Payments' && (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <PaymentJourneyTab subscriptionId={subscriptionId} targetSystem={targetSystem} />
          </div>
        )}

        {activeTab === 'Audit' && (
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
            <AuditTrailWidget entries={auditTrail} />
          </div>
        )}

        <AdminModal open={trialModal.open} title="Extend Subscription Trial" onClose={() => setTrialModal({ open: false, extensionDays: '7', reason: '', submitting: false })} onConfirm={handleExtendTrial} confirmLabel={trialModal.submitting ? 'Saving...' : 'Extend Trial'}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Extension Days</label>
              <input type="number" min={1} value={trialModal.extensionDays} onChange={(event) => setTrialModal((prev) => ({ ...prev, extensionDays: event.target.value }))} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Reason</label>
              <textarea rows={3} value={trialModal.reason} onChange={(event) => setTrialModal((prev) => ({ ...prev, reason: event.target.value }))} className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100" />
            </div>
          </div>
        </AdminModal>

        {modal}
      </div>
    </PermissionGate>
  )
}
