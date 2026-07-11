import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import {
  attachLifetimePreviousTier,
  buildPlatformPreviewPlans,
  buildSimulatorPreviewPlans,
  fetchSubscriptionPlansCatalog,
  PermissionGate,
  systemLabel,
} from '@nidus-admin/shared'
import { EmptyState, LoadingState, SubscriptionPricingPreview } from '@nidus-admin/ui'

export default function SubscriptionPreviewPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialSystem = searchParams.get('system') === 'simulator' ? 'simulator' : 'platform'
  const initialBillingParam = searchParams.get('billing')
  const initialBilling = initialBillingParam === 'yearly' ? 'yearly' : 'monthly'

  const [system, setSystem] = useState(initialSystem)
  const [billingCycle, setBillingCycle] = useState(initialBilling)
  const [dbPlans, setDbPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    setError(null)
    const catalogRes = await fetchSubscriptionPlansCatalog()
    if (catalogRes.error) {
      setError(catalogRes.error.message || String(catalogRes.error))
      setDbPlans([])
    } else {
      setDbPlans(catalogRes.data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPlans()
  }, [loadPlans, location.key])

  useEffect(() => {
    const onCatalogUpdated = () => loadPlans()
    window.addEventListener('nidus:catalog-updated', onCatalogUpdated)
    window.addEventListener('focus', onCatalogUpdated)
    return () => {
      window.removeEventListener('nidus:catalog-updated', onCatalogUpdated)
      window.removeEventListener('focus', onCatalogUpdated)
    }
  }, [loadPlans])

  useEffect(() => {
    setSearchParams({ system, billing: billingCycle }, { replace: true })
  }, [system, billingCycle, setSearchParams])

  const previewPlans = useMemo(() => {
    if (system === 'simulator') return buildSimulatorPreviewPlans(dbPlans, billingCycle)
    return buildPlatformPreviewPlans(dbPlans, billingCycle)
  }, [system, dbPlans, billingCycle])

  const lifetimePreviewPlans = useMemo(() => {
    if (system !== 'platform') return []
    return attachLifetimePreviousTier(
      buildPlatformPreviewPlans(dbPlans, 'lifetime'),
      buildPlatformPreviewPlans(dbPlans, billingCycle),
    )
  }, [system, dbPlans, billingCycle])

  const totalPreviewCount = system === 'simulator'
    ? previewPlans.length
    : previewPlans.length + lifetimePreviewPlans.length
  const dbBackedCount = [...previewPlans, ...lifetimePreviewPlans].filter((plan) => plan.source === 'database').length

  if (loading) return <LoadingState message="Loading pricing preview..." />

  return (
    <PermissionGate permission="subscriptions.view">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate('/subscriptions/subscription-list')}
              className="mb-2 text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back to subscriptions
            </button>
            <h1 className="text-2xl font-semibold text-gray-100">Subscription Preview</h1>
            <p className="text-sm text-gray-500">
              Mirrors the live Platform and Simulator public pricing pages — same branding, copy, layout, and catalog data.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {['platform', 'simulator'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSystem(value)}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                system === value
                  ? value === 'simulator'
                    ? 'border-rose-500 bg-rose-600/20 text-rose-200'
                    : 'border-violet-500 bg-violet-600/20 text-violet-200'
                  : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {systemLabel(value)}
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm text-gray-400">
          <p>
            Showing <strong className="text-gray-200">{totalPreviewCount}</strong> plan
            {totalPreviewCount === 1 ? '' : 's'} for <strong className="text-gray-200">{systemLabel(system)}</strong>.
            {dbBackedCount > 0 && (
              <> <strong className="text-gray-200">{dbBackedCount}</strong> from live <code className="text-violet-300">subscription_plans</code> catalog.</>
            )}
          </p>
          {error && (
            <p className="mt-2 text-amber-300">
              Could not load database plans ({error}). No catalog rows available to preview.
            </p>
          )}
        </div>

        {totalPreviewCount === 0 ? (
          <EmptyState
            title="No plans to preview"
            description="Adjust the system filter or check the subscription catalog."
          />
        ) : (
          <SubscriptionPricingPreview
            plans={previewPlans}
            lifetimePlans={lifetimePreviewPlans}
            system={system}
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
          />
        )}
      </div>
    </PermissionGate>
  )
}
