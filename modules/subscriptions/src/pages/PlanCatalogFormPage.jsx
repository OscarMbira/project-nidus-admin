import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BILLING_CYCLES,
  PermissionGate,
  PLATFORM_PLAN_TYPES,
  SIMULATOR_PLAN_TYPES,
  buildPlanFormFeatureOptions,
  buildSubscriptionFeatureOptions,
  createSubscriptionPlan,
  currenciesRowsToOptions,
  currencyOptionsForValue,
  fetchActiveCurrencies,
  fetchAdminUsers,
  fetchAllSubscriptionFeatureCatalog,
  fetchAllSubscriptionPlans,
  fetchLifecycleLogs,
  fetchSubscriptionPlansCatalog,
  normalizeFeatureEditorRows,
  parseDbPlanFeatures,
  serializeSubscriptionFeatures,
  updateSubscriptionPlan,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminField,
  AdminForm,
  LoadingState,
  RecordLifecyclePanel,
  RecordStatusBadge,
  RecordVersionHistory,
  SubscriptionFeaturesEditor,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const CATALOG_SCOPES = [
  { value: 'platform', label: 'Platform' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'both', label: 'Both' },
]

const CATALOG_BILLING_CYCLES = BILLING_CYCLES.filter((cycle) => cycle !== 'custom')

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

function planTypesForScope(scope) {
  if (scope === 'simulator') return SIMULATOR_PLAN_TYPES
  if (scope === 'platform') return PLATFORM_PLAN_TYPES
  return [...new Set([...PLATFORM_PLAN_TYPES, ...SIMULATOR_PLAN_TYPES])]
}

function emptyForm(scope = 'platform') {
  const types = planTypesForScope(scope)
  return {
    plan_name: '',
    plan_type: types[0] || 'free',
    billing_cycle: 'monthly',
    catalog_scope: scope,
    price: '',
    original_price: '',
    currency: 'USD',
    member_limit: '',
    project_limit: '',
    additional_member_price: '',
    features: [''],
    platform_included: scope !== 'simulator',
    simulator_included: scope !== 'platform',
    is_popular: false,
    is_active: true,
    display_order: '0',
    reason: '',
  }
}

function planToForm(plan) {
  return {
    plan_name: plan.plan_name || '',
    plan_type: plan.plan_type || 'free',
    billing_cycle: plan.billing_cycle || 'monthly',
    catalog_scope: plan.catalog_scope || 'platform',
    price: String(plan.price ?? ''),
    original_price: plan.original_price != null ? String(plan.original_price) : '',
    currency: plan.currency || 'USD',
    member_limit: plan.member_limit != null ? String(plan.member_limit) : '',
    project_limit: plan.project_limit != null ? String(plan.project_limit) : '',
    additional_member_price: plan.additional_member_price != null ? String(plan.additional_member_price) : '',
    features: normalizeFeatureEditorRows(parseDbPlanFeatures(plan)),
    platform_included: plan.platform_included !== false,
    simulator_included: plan.simulator_included === true,
    is_popular: Boolean(plan.is_popular),
    is_active: plan.is_active !== false,
    display_order: String(plan.display_order ?? 0),
    reason: '',
  }
}

function parseOptionalNumber(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number.parseFloat(trimmed)
  return Number.isFinite(num) ? num : NaN
}

function parseOptionalInteger(value) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  const num = Number.parseInt(trimmed, 10)
  return Number.isFinite(num) ? num : NaN
}

function catalogScopeToTargetSystem(catalogScope = 'platform') {
  if (catalogScope === 'simulator') return 'simulator'
  return 'platform'
}

export default function PlanCatalogFormPage() {
  const [searchParams] = useSearchParams()
  const planId = searchParams.get('id')
  const isEdit = Boolean(planId)
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [form, setForm] = useState(() => emptyForm())
  const [loading, setLoading] = useState(Boolean(planId))
  const [saving, setSaving] = useState(false)
  const [currencyOptions, setCurrencyOptions] = useState(null)
  const [planCatalog, setPlanCatalog] = useState([])
  const [featureCatalogRows, setFeatureCatalogRows] = useState([])
  const [featureOptionsLoading, setFeatureOptionsLoading] = useState(true)
  const [lifecycleMeta, setLifecycleMeta] = useState(null)
  const [lifecycleLogs, setLifecycleLogs] = useState([])
  const [adminUsers, setAdminUsers] = useState([])

  const isPendingApproval = isEdit && lifecycleMeta?.record_status === 'unauthorised'

  const adminNameMap = useMemo(
    () => Object.fromEntries(adminUsers.map((user) => [user.id, user.full_name || user.email || user.id])),
    [adminUsers],
  )

  const lifecycleRecordMetaMap = useMemo(() => {
    if (!planId) return {}
    const subtitle = [form.plan_type, form.billing_cycle, form.catalog_scope].filter(Boolean).join(' · ')
    return {
      [planId]: { title: form.plan_name || 'Subscription plan', subtitle },
      ...(lifecycleMeta?.root_record_id
        ? { [lifecycleMeta.root_record_id]: { title: form.plan_name || 'Subscription plan', subtitle } }
        : {}),
    }
  }, [planId, form.plan_name, form.plan_type, form.billing_cycle, form.catalog_scope, lifecycleMeta?.root_record_id])

  const planTypeOptions = useMemo(
    () => planTypesForScope(form.catalog_scope),
    [form.catalog_scope],
  )

  const currencySelectOptions = useMemo(
    () => currencyOptionsForValue(form.currency, currencyOptions || undefined),
    [form.currency, currencyOptions],
  )

  const featureOptions = useMemo(() => {
    const fromCatalog = buildPlanFormFeatureOptions({
      catalogScope: form.catalog_scope,
      billingCycle: form.billing_cycle,
      planType: form.plan_type,
      dbPlans: planCatalog,
      featureCatalogRows,
      extraFeatureLabels: form.features,
    })

    if (fromCatalog.length > 0) return fromCatalog

    const targetSystem = catalogScopeToTargetSystem(form.catalog_scope)
    return buildSubscriptionFeatureOptions({
      targetSystem,
      billingCycle: form.billing_cycle,
      planType: form.plan_type,
      dbPlans: planCatalog,
      useRelaxedPlanFilter: true,
    })
  }, [
    form.catalog_scope,
    form.billing_cycle,
    form.plan_type,
    form.features,
    planCatalog,
    featureCatalogRows,
  ])

  useEffect(() => {
    fetchActiveCurrencies().then(({ data }) => {
      if (data?.length) setCurrencyOptions(currenciesRowsToOptions(data))
    })
  }, [])

  useEffect(() => {
    let active = true
    setFeatureOptionsLoading(true)

    ;(async () => {
      const [plansRes, catalogRes] = await Promise.all([
        fetchSubscriptionPlansCatalog(),
        fetchAllSubscriptionFeatureCatalog(),
      ])
      if (!active) return

      if (plansRes.error) {
        showError(toError(plansRes.error, 'Failed to load plan catalog for feature options.'))
      } else if (catalogRes.error) {
        showError(toError(catalogRes.error, 'Failed to load subscription feature catalog.'))
      }

      setPlanCatalog(plansRes.data || [])
      setFeatureCatalogRows(catalogRes.data || [])
      setFeatureOptionsLoading(false)
    })()

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchAdminUsers({ limit: 500 }).then(({ data }) => {
      if (data) setAdminUsers(data)
    })
  }, [])

  useEffect(() => {
    if (!planId) return
    setLoading(true)
    fetchAllSubscriptionPlans().then(({ data, error }) => {
      if (error) {
        showError(toError(error, 'Failed to load plan.'))
        setLoading(false)
        return
      }
      const plan = (data || []).find((row) => row.id === planId)
      if (!plan) {
        showError('Plan not found.')
        setLoading(false)
        return
      }
      setForm(planToForm(plan))
      setLifecycleMeta({
        record_status: plan.record_status || 'live',
        root_record_id: plan.root_record_id || plan.id,
      })
      fetchLifecycleLogs('subscription_plans', plan.root_record_id || plan.id).then(({ data }) => {
        setLifecycleLogs(data || [])
      })
      setLoading(false)
    })
  }, [planId, showError])

  const handleScopeChange = (nextScope) => {
    setForm((prev) => {
      const types = planTypesForScope(nextScope)
      const nextType = types.includes(prev.plan_type) ? prev.plan_type : types[0]
      return {
        ...prev,
        catalog_scope: nextScope,
        plan_type: nextType,
        platform_included: nextScope !== 'simulator',
        simulator_included: nextScope !== 'platform',
      }
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.plan_name.trim()) {
      showError('Plan name is required.')
      return
    }
    const price = parseOptionalNumber(form.price)
    if (Number.isNaN(price) || price == null || price < 0) {
      showError('Price must be a valid non-negative number.')
      return
    }
    const originalPrice = parseOptionalNumber(form.original_price)
    if (Number.isNaN(originalPrice)) {
      showError('Original price must be a valid number or left empty.')
      return
    }
    const memberLimit = parseOptionalInteger(form.member_limit)
    if (Number.isNaN(memberLimit)) {
      showError('Member limit must be a valid integer or left empty.')
      return
    }
    const projectLimit = parseOptionalInteger(form.project_limit)
    if (Number.isNaN(projectLimit)) {
      showError('Project limit must be a valid integer or left empty.')
      return
    }
    const additionalMemberPrice = parseOptionalNumber(form.additional_member_price)
    if (Number.isNaN(additionalMemberPrice)) {
      showError('Additional member price must be a valid number or left empty.')
      return
    }
    const displayOrder = parseOptionalInteger(form.display_order)
    if (Number.isNaN(displayOrder)) {
      showError('Display order must be a valid integer.')
      return
    }
    if (!form.reason.trim()) {
      showError('Audit reason is required.')
      return
    }

    const payload = {
      plan_name: form.plan_name.trim(),
      plan_type: form.plan_type,
      billing_cycle: form.billing_cycle,
      catalog_scope: form.catalog_scope,
      price,
      original_price: originalPrice,
      currency: form.currency,
      member_limit: memberLimit,
      project_limit: projectLimit,
      additional_member_price: additionalMemberPrice,
      features: serializeSubscriptionFeatures(form.features),
      platform_included: form.platform_included,
      simulator_included: form.simulator_included,
      is_popular: form.is_popular,
      is_active: form.is_active,
      display_order: displayOrder ?? 0,
    }

    setSaving(true)
    const { error } = isEdit
      ? await updateSubscriptionPlan(planId, payload, form.reason.trim())
      : await createSubscriptionPlan(payload, form.reason.trim())
    setSaving(false)

    if (error) {
      showError(toError(error, 'Failed to save plan.'))
      return
    }

    showSuccess(isEdit ? 'Plan updated.' : 'Plan created.')
    window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
    navigate('/subscriptions/plan-catalog')
  }

  if (loading) return <LoadingState message="Loading plan..." />

  return (
    <PermissionGate permission={isEdit ? 'pricing.view' : 'pricing.edit'}>
      <div className="flex flex-col gap-3 p-3 pb-8 md:p-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/plan-catalog')}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back to subscription catalog
            </button>
            <h1 className="text-xl font-semibold text-gray-100">
              {isEdit ? 'Edit Plan' : 'Create Plan'}
            </h1>
            {isEdit && (
              <p className="text-xs text-gray-500">
                Plan type, billing cycle, and system are locked after creation.
              </p>
            )}
          </div>
          {isEdit && lifecycleMeta && (
            <RecordStatusBadge status={lifecycleMeta.record_status} />
          )}
        </div>

        {isEdit && lifecycleMeta && lifecycleMeta.record_status === 'unauthorised' && (
          <div className="shrink-0 rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            This plan has a pending edit awaiting approval. The public pricing page continues to show the
            current approved values until the edit is validated below.
          </div>
        )}

        {isEdit && lifecycleMeta && (
          <details
            className="shrink-0 rounded-lg border border-gray-700 bg-gray-900/80 text-sm"
            open={lifecycleMeta.record_status === 'unauthorised' || undefined}
          >
            <summary className="cursor-pointer select-none px-3 py-2 text-gray-300 hover:text-gray-100">
              Record governance &amp; history
            </summary>
            <div className="flex flex-col gap-4 border-t border-gray-800 p-3">
              <RecordLifecyclePanel
                tableName="subscription_plans"
                recordId={planId}
                rootRecordId={lifecycleMeta.root_record_id}
                recordStatus={lifecycleMeta.record_status}
                authoriserJustificationLabel="Authoriser justification / remarks (required to approve or reject)"
                onChanged={() => {
                  fetchAllSubscriptionPlans().then(({ data }) => {
                    const plan = (data || []).find((row) => row.id === planId)
                    if (plan) {
                      setForm(planToForm(plan))
                      setLifecycleMeta({
                        record_status: plan.record_status || 'live',
                        root_record_id: plan.root_record_id || plan.id,
                      })
                    }
                  })
                  fetchLifecycleLogs('subscription_plans', lifecycleMeta.root_record_id).then(({ data }) => {
                    setLifecycleLogs(data || [])
                  })
                }}
              />
              <section className="rounded-lg border border-gray-600 bg-gray-800 p-4">
                <h3 className="text-sm font-semibold text-gray-200">Lifecycle history</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Authorisation, validation, and archive events for this plan.
                </p>
                <div className="mt-4">
                  <RecordVersionHistory
                    logs={lifecycleLogs}
                    adminNameMap={adminNameMap}
                    recordMetaMap={lifecycleRecordMetaMap}
                  />
                </div>
              </section>
            </div>
          </details>
        )}

        <PermissionGate permission={isPendingApproval ? 'pricing.view' : 'pricing.edit'}>
          <AdminForm onSubmit={isPendingApproval ? (event) => event.preventDefault() : handleSubmit} className="flex flex-col gap-3 space-y-0">
            {isPendingApproval && (
              <div className="shrink-0 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 text-sm text-gray-300">
                Plan details are read-only while this edit awaits authorisation. Approve or reject using the
                governance panel above.
              </div>
            )}
            <fieldset disabled={isPendingApproval} className="flex flex-col gap-3 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
            <div className="grid shrink-0 gap-3 lg:grid-cols-2">
              <AdminCard title="Plan Identity" className="!p-3">
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <AdminField label="Plan Name" required>
                        <input
                          className={`${inputClass} py-1.5 text-sm`}
                          value={form.plan_name}
                          onChange={(e) => setForm((p) => ({ ...p, plan_name: e.target.value }))}
                          placeholder="Professional Monthly"
                        />
                      </AdminField>
                    </div>
                    <AdminField label="Plan Type" required>
                      <select
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.plan_type}
                        disabled={isEdit}
                        onChange={(e) => setForm((p) => ({ ...p, plan_type: e.target.value }))}
                      >
                        {planTypeOptions.map((type) => (
                          <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </AdminField>
                    <AdminField label="Billing Cycle" required>
                      <select
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.billing_cycle}
                        disabled={isEdit}
                        onChange={(e) => setForm((p) => ({ ...p, billing_cycle: e.target.value }))}
                      >
                        {CATALOG_BILLING_CYCLES.map((cycle) => (
                          <option key={cycle} value={cycle}>{cycle}</option>
                        ))}
                      </select>
                    </AdminField>
                    <AdminField label="System" required>
                      <select
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.catalog_scope}
                        disabled={isEdit}
                        onChange={(e) => handleScopeChange(e.target.value)}
                      >
                        {CATALOG_SCOPES.map((scope) => (
                          <option key={scope.value} value={scope.value}>{scope.label}</option>
                        ))}
                      </select>
                    </AdminField>
                  </div>
              </AdminCard>

              <AdminCard title="Pricing & Limits" className="!p-3">
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <AdminField label="Price" required>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.price}
                        onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                      />
                    </AdminField>
                    <AdminField label="Original Price">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.original_price}
                        onChange={(e) => setForm((p) => ({ ...p, original_price: e.target.value }))}
                        placeholder="Strike-through"
                      />
                    </AdminField>
                    <AdminField label="Currency" required>
                      <select
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.currency}
                        onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                      >
                        {currencySelectOptions.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                    </AdminField>
                    <AdminField label="Display Order">
                      <input
                        type="number"
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.display_order}
                        onChange={(e) => setForm((p) => ({ ...p, display_order: e.target.value }))}
                      />
                    </AdminField>
                    <AdminField label="Member Limit">
                      <input
                        type="number"
                        min="0"
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.member_limit}
                        onChange={(e) => setForm((p) => ({ ...p, member_limit: e.target.value }))}
                      />
                    </AdminField>
                    <AdminField label="Project Limit">
                      <input
                        type="number"
                        min="0"
                        className={`${inputClass} py-1.5 text-sm`}
                        value={form.project_limit}
                        onChange={(e) => setForm((p) => ({ ...p, project_limit: e.target.value }))}
                      />
                    </AdminField>
                    <div className="sm:col-span-2">
                      <AdminField label="Extra Member Price">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${inputClass} py-1.5 text-sm`}
                          value={form.additional_member_price}
                          onChange={(e) => setForm((p) => ({ ...p, additional_member_price: e.target.value }))}
                        />
                      </AdminField>
                    </div>
                  </div>
              </AdminCard>
            </div>

            <AdminCard title="Features" className="!p-3">
              <SubscriptionFeaturesEditor
                value={form.features}
                onChange={(features) => setForm((p) => ({ ...p, features }))}
                options={featureOptions}
                loading={featureOptionsLoading}
                disabled={isPendingApproval}
                hint={
                  featureOptionsLoading
                    ? 'Loading catalog features...'
                    : `${featureOptions.length} features available — search or browse by category.`
                }
              />
            </AdminCard>
            </fieldset>

            {!isPendingApproval && (
            <div className="shrink-0 rounded-lg border border-gray-700 bg-gray-900 p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.platform_included}
                    onChange={(e) => setForm((p) => ({ ...p, platform_included: e.target.checked }))}
                  />
                  Platform
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.simulator_included}
                    onChange={(e) => setForm((p) => ({ ...p, simulator_included: e.target.checked }))}
                  />
                  Simulator
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_popular}
                    onChange={(e) => setForm((p) => ({ ...p, is_popular: e.target.checked }))}
                  />
                  Popular
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  />
                  Active
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1">
                  <AdminField label="Audit reason" required>
                    <input
                      className={`${inputClass} py-1.5 text-sm`}
                      value={form.reason}
                      onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                      placeholder="Why is this plan being created or updated?"
                    />
                  </AdminField>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/subscriptions/plan-catalog')}
                    className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Plan'}
                  </button>
                </div>
              </div>
            </div>
            )}
          </AdminForm>
        </PermissionGate>
      </div>
    </PermissionGate>
  )
}
