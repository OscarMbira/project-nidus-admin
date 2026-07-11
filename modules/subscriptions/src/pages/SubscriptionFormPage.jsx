import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BILLING_CYCLES,
  currencyOptionsForValue,
  currenciesRowsToOptions,
  createSubscription,
  fetchActiveCurrencies,
  fetchAllSubscriptions,
  fetchSubscriptionPlansCatalog,
  fetchSubscriptionRecordAnySystem,
  fetchUsers,
  buildSubscriptionFeatureOptions,
  formatPlanLabel,
  formatSubscriptionAmount,
  getCatalogPlanPrice,
  getDefaultPlanFeatures,
  normalizeFeatureEditorRows,
  parseSubscriptionFeatures,
  PermissionGate,
  planTypesForSystem,
  resolveSubscriptionFormFeatures,
  serializeSubscriptionFeatures,
  statusesForSystem,
  systemLabel,
  updateSubscription,
  syncSubscriptionPlanCatalogPrice,
  publishSubscriptionPlanToCatalog,
  SUBSCRIPTION_DISPLAY_TABLE,
  useDisplayId,
} from '@nidus-admin/shared'
import { AdminField, AdminForm, EmptyState, inputClass, LoadingState, SearchBar, SubscriptionFeaturesEditor, SubscriptionFeaturesList, useToast } from '@nidus-admin/ui'

const SYSTEMS = ['platform', 'simulator']

const FORM_TABS = [
  { id: 'details', label: 'Subscription Details' },
  { id: 'schedule', label: 'Schedule & Features' },
]

function tabForValidationError(message) {
  if (!message) return 'details'
  if (message.includes('audit reason') || message.includes('reason')) return 'schedule'
  return 'details'
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function emptyForm(targetSystem) {
  return {
    targetSystem,
    userId: '',
    accountId: '',
    planType: planTypesForSystem(targetSystem)[1] || planTypesForSystem(targetSystem)[0],
    status: 'active',
    billingCycle: 'monthly',
    amountPaid: '',
    currency: 'USD',
    startedAt: toLocalInput(new Date().toISOString()),
    expiresAt: '',
    trialEnd: '',
    nextBillingDate: '',
    isLifetime: false,
    features: [''],
    reason: '',
  }
}

export default function SubscriptionFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const initialSystem = searchParams.get('system') === 'simulator' ? 'simulator' : 'platform'
  const isEdit = Boolean(idParam)
  const {
    uuid: subscriptionId,
    displayId,
    loading: resolving,
    error: resolveError,
  } = useDisplayId(SUBSCRIPTION_DISPLAY_TABLE, idParam)
  const { showSuccess, showError } = useToast()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('details')
  const [form, setForm] = useState(() => emptyForm(initialSystem))
  const [dynamicCurrencyOptions, setDynamicCurrencyOptions] = useState(null)
  const [planCatalog, setPlanCatalog] = useState([])
  const [subscriptionRows, setSubscriptionRows] = useState([])
  const [planCatalogLoading, setPlanCatalogLoading] = useState(true)

  const applyCatalogAmount = (prev, updates = {}, catalog = planCatalog, subs = subscriptionRows) => {
    const next = { ...prev, ...updates }
    const catalogPrice = getCatalogPlanPrice(
      next.planType,
      next.targetSystem,
      catalog,
      next.billingCycle,
      { isLifetime: next.isLifetime, subscriptions: subs },
    )
    if (catalogPrice != null) {
      next.amountPaid = String(catalogPrice)
    }
    return next
  }

  const applyCatalogDefaults = (prev, updates = {}, catalog = planCatalog, subs = subscriptionRows) => {
    const next = applyCatalogAmount(prev, updates, catalog, subs)
    const planFieldsChanged = ['planType', 'billingCycle', 'isLifetime', 'targetSystem']
      .some((key) => key in updates)

    if (planFieldsChanged || updates.applyFeatureDefaults) {
      const defaults = getDefaultPlanFeatures({
        planType: next.planType,
        targetSystem: next.targetSystem,
        billingCycle: next.billingCycle,
        isLifetime: next.isLifetime,
        dbPlans: catalog,
        subscriptions: subs,
      })
      next.features = normalizeFeatureEditorRows(defaults.length > 0 ? defaults : [''])
    }

    return next
  }

  const previewAmountLabel = useMemo(
    () => formatSubscriptionAmount({
      plan_type: form.planType,
      target_system: form.targetSystem,
      billing_cycle: form.billingCycle,
      amount_paid: form.amountPaid === '' ? null : Number(form.amountPaid),
      currency: form.currency,
      is_lifetime: form.isLifetime,
    }, planCatalog),
    [form, planCatalog, subscriptionRows],
  )

  const planOptions = useMemo(() => planTypesForSystem(form.targetSystem), [form.targetSystem])
  const statusOptions = useMemo(() => statusesForSystem(form.targetSystem), [form.targetSystem])
  const currencyOptions = useMemo(
    () => currencyOptionsForValue(form.currency, dynamicCurrencyOptions || undefined),
    [form.currency, dynamicCurrencyOptions],
  )
  const featureOptions = useMemo(
    () => buildSubscriptionFeatureOptions({
      targetSystem: form.targetSystem,
      billingCycle: form.isLifetime ? 'lifetime' : form.billingCycle,
      planType: form.planType,
      dbPlans: planCatalog,
    }),
    [
      form.targetSystem,
      form.billingCycle,
      form.isLifetime,
      form.planType,
      planCatalog,
    ],
  )

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    const pool = !query
      ? users
      : users.filter((user) => [user.full_name, user.email, user.id, user.auth_user_id]
        .some((value) => String(value ?? '').toLowerCase().includes(query)))
    return pool.slice(0, 100)
  }, [users, search])

  const selectedUser = useMemo(
    () => users.find((user) => user.auth_user_id === form.userId || user.id === form.userId) || null,
    [users, form.userId],
  )

  useEffect(() => {
    const load = async () => {
      if (isEdit && resolving) return

      setLoading(true)
      setPlanCatalogLoading(true)
      setFormError(null)

      const [usersRes, currenciesRes, catalogRes, subsRes] = await Promise.all([
        fetchUsers(),
        fetchActiveCurrencies(),
        fetchSubscriptionPlansCatalog(),
        fetchAllSubscriptions(),
      ])
      setUsers(usersRes.data || [])
      setPlanCatalog(catalogRes.data || [])
      setSubscriptionRows(subsRes.data || [])
      setPlanCatalogLoading(false)
      if (!currenciesRes.error && currenciesRes.data?.length) {
        setDynamicCurrencyOptions(currenciesRowsToOptions(currenciesRes.data))
      }

      if (isEdit) {
        if (resolveError) {
          setFormError(resolveError)
          setLoading(false)
          setPlanCatalogLoading(false)
          return
        }
        if (!subscriptionId) {
          setLoading(false)
          setPlanCatalogLoading(false)
          return
        }

        const { data, error, targetSystem: resolvedSystem } = await fetchSubscriptionRecordAnySystem(subscriptionId)
        if (error || !data || !resolvedSystem) {
          setFormError(error?.message || 'Subscription not found.')
          setLoading(false)
          setPlanCatalogLoading(false)
          return
        }
        const resolvedFeatures = resolveSubscriptionFormFeatures(data, {
          targetSystem: resolvedSystem,
          dbPlans: catalogRes.data || [],
          subscriptions: subsRes.data || [],
        })
        setForm({
          targetSystem: resolvedSystem,
          userId: data.user_id || '',
          accountId: data.account_id || '',
          planType: data.plan_type || planTypesForSystem(initialSystem)[0],
          status: data.status || 'active',
          billingCycle: data.billing_cycle || 'monthly',
          amountPaid: data.amount_paid ?? '',
          currency: data.currency || 'USD',
          startedAt: toLocalInput(data.started_at),
          expiresAt: toLocalInput(data.expires_at),
          trialEnd: toLocalInput(data.trial_end),
          nextBillingDate: toLocalInput(data.next_billing_date),
          isLifetime: Boolean(data.is_lifetime),
          features: resolvedFeatures,
          reason: '',
        })
      } else if ((catalogRes.data || []).length > 0) {
        setForm((prev) => applyCatalogDefaults(prev, { applyFeatureDefaults: true }, catalogRes.data || [], subsRes.data || []))
      }

      setLoading(false)
    }
    load()
  }, [subscriptionId, initialSystem, isEdit, resolving, resolveError])

  const validate = () => {
    if (!form.userId) return 'Select a user for this subscription.'
    if (!form.planType) return 'Plan type is required.'
    if (!form.status) return 'Status is required.'
    if (!form.reason.trim()) return 'An audit reason is required.'
    return null
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      setActiveTab(tabForValidationError(validationError))
      return
    }

    setSubmitting(true)
    setFormError(null)

    const payload = {
      targetSystem: form.targetSystem,
      userId: selectedUser?.auth_user_id || form.userId,
      planType: form.planType,
      status: form.status,
      billingCycle: form.billingCycle,
      amountPaid: form.amountPaid === '' ? null : Number(form.amountPaid),
      currency: form.currency,
      startedAt: fromLocalInput(form.startedAt),
      expiresAt: fromLocalInput(form.expiresAt),
      trialEnd: fromLocalInput(form.trialEnd),
      nextBillingDate: fromLocalInput(form.nextBillingDate),
      accountId: form.accountId || null,
      isLifetime: form.isLifetime,
      features: serializeSubscriptionFeatures(form.features),
      reason: form.reason.trim(),
    }

    const { data, error } = isEdit
      ? await updateSubscription({ ...payload, subscriptionId })
      : await createSubscription(payload)

    setSubmitting(false)

    if (error) {
      setFormError(error.message || String(error))
      showError(error.message || String(error))
      return
    }

    if (payload.amountPaid != null) {
      const shouldPublishCatalog = payload.status === 'active'
        && payload.planType !== 'free'
        && Number(payload.amountPaid) > 0

      const catalogSync = shouldPublishCatalog
        ? publishSubscriptionPlanToCatalog
        : syncSubscriptionPlanCatalogPrice

      const { error: catalogError } = await catalogSync({
        planType: payload.planType,
        billingCycle: payload.billingCycle,
        targetSystem: payload.targetSystem,
        newPrice: payload.amountPaid,
        reason: payload.reason,
      })
      if (catalogError) {
        showError(typeof catalogError === 'string' ? catalogError : catalogError.message || 'Subscription saved but catalog price was not updated.')
      }
    }

    showSuccess(isEdit ? 'Subscription updated.' : 'Subscription created.')
    window.dispatchEvent(new CustomEvent('nidus:catalog-updated'))
    const nextId = isEdit ? (displayId || subscriptionId) : data
    navigate(`/subscriptions/subscription-detail?id=${encodeURIComponent(nextId)}&system=${encodeURIComponent(form.targetSystem)}`)
  }

  if (resolving || loading) return <LoadingState message="Loading subscription form..." />

  return (
    <PermissionGate permission={isEdit ? 'subscriptions.edit' : 'subscriptions.create'}>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <button
            type="button"
            onClick={() => navigate('/subscriptions/subscription-list')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to subscriptions
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">
            {isEdit ? 'Edit Subscription' : 'Create Subscription'}
          </h1>
          <p className="text-sm text-gray-500">
            Configure a {systemLabel(form.targetSystem)} subscription the same way users see it in their billing view.
          </p>
        </div>

        {formError && (
          <div className="rounded border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-300">{formError}</div>
        )}

        <AdminForm onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex min-h-0 flex-col rounded-lg border border-gray-700 bg-gray-900">
            <div className="flex border-b border-gray-800">
              {FORM_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? 'border-b-2 border-blue-500 bg-gray-900 text-blue-200'
                      : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-5 p-4">
              {activeTab === 'details' && (
                <>
                  <AdminField label="Target system" required>
                    <select
                      className={inputClass}
                      value={form.targetSystem}
                      disabled={isEdit}
                      onChange={(event) => {
                        const targetSystem = event.target.value
                        setForm((prev) => applyCatalogDefaults(emptyForm(targetSystem), { applyFeatureDefaults: true }))
                      }}
                    >
                      {SYSTEMS.map((system) => (
                        <option key={system} value={system}>{systemLabel(system)}</option>
                      ))}
                    </select>
                  </AdminField>

                  <AdminField label="User" required>
                    <SearchBar value={search} onChange={setSearch} placeholder="Search users by name or email..." />
                    <select
                      className={`${inputClass} mt-2`}
                      value={form.userId}
                      onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
                    >
                      <option value="">Select user...</option>
                      {filteredUsers.map((user) => (
                        <option key={user.id} value={user.auth_user_id || user.id}>
                          {(user.full_name || 'Unnamed')} — {user.email || user.id}
                        </option>
                      ))}
                    </select>
                  </AdminField>

                  {form.targetSystem === 'platform' && (
                    <AdminField label="Account ID">
                      <input
                        className={inputClass}
                        value={form.accountId}
                        onChange={(event) => setForm((prev) => ({ ...prev, accountId: event.target.value }))}
                        placeholder="Optional linked organisation account"
                      />
                    </AdminField>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <AdminField label="Plan" required>
                      <select
                        className={inputClass}
                        value={form.planType}
                        onChange={(event) => setForm((prev) => applyCatalogDefaults(prev, { planType: event.target.value }))}
                      >
                        {planOptions.map((plan) => (
                          <option key={plan} value={plan}>{formatPlanLabel(plan)}</option>
                        ))}
                      </select>
                    </AdminField>
                    <AdminField label="Status" required>
                      <select
                        className={inputClass}
                        value={form.status}
                        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
                        ))}
                      </select>
                    </AdminField>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <AdminField label="Billing cycle">
                      <select
                        className={inputClass}
                        value={form.billingCycle}
                        onChange={(event) => setForm((prev) => applyCatalogDefaults(prev, { billingCycle: event.target.value }))}
                      >
                        {BILLING_CYCLES.map((cycle) => (
                          <option key={cycle} value={cycle}>{cycle}</option>
                        ))}
                      </select>
                    </AdminField>
                    <AdminField label="Amount">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className={inputClass}
                        value={form.amountPaid}
                        onChange={(event) => setForm((prev) => ({ ...prev, amountPaid: event.target.value }))}
                      />
                    </AdminField>
                    <AdminField label="Currency">
                      <select
                        className={inputClass}
                        value={form.currency}
                        onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
                      >
                        {currencyOptions.map(({ code, label }) => (
                          <option key={code} value={code}>{label}</option>
                        ))}
                      </select>
                    </AdminField>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('schedule')}
                      className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-gray-100"
                    >
                      Next: Schedule & Features →
                    </button>
                  </div>
                </>
              )}

              {activeTab === 'schedule' && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AdminField label="Started at">
                      <input type="datetime-local" className={inputClass} value={form.startedAt} onChange={(event) => setForm((prev) => ({ ...prev, startedAt: event.target.value }))} />
                    </AdminField>
                    <AdminField label="Expires at">
                      <input type="datetime-local" className={inputClass} value={form.expiresAt} onChange={(event) => setForm((prev) => ({ ...prev, expiresAt: event.target.value }))} />
                    </AdminField>
                    {form.targetSystem === 'platform' && (
                      <AdminField label="Trial end">
                        <input type="datetime-local" className={inputClass} value={form.trialEnd} onChange={(event) => setForm((prev) => ({ ...prev, trialEnd: event.target.value }))} />
                      </AdminField>
                    )}
                    <AdminField label="Next billing date">
                      <input type="datetime-local" className={inputClass} value={form.nextBillingDate} onChange={(event) => setForm((prev) => ({ ...prev, nextBillingDate: event.target.value }))} />
                    </AdminField>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={form.isLifetime}
                      onChange={(event) => setForm((prev) => applyCatalogDefaults(prev, { isLifetime: event.target.checked }))}
                    />
                    Lifetime subscription
                  </label>

                  <AdminField label="Features">
                    <SubscriptionFeaturesEditor
                      value={form.features}
                      onChange={(features) => setForm((prev) => ({ ...prev, features }))}
                      options={featureOptions}
                      loading={planCatalogLoading}
                    />
                  </AdminField>

                  <AdminField label="Audit reason" required>
                    <textarea
                      rows={3}
                      className={inputClass}
                      value={form.reason}
                      onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                      placeholder="Why is this subscription being created or changed?"
                    />
                  </AdminField>

                  <div className="flex justify-start pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className="rounded border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-gray-100"
                    >
                      ← Back to Details
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3 border-t border-gray-800 p-4">
              <button
                type="button"
                onClick={() => navigate('/subscriptions/subscription-list')}
                className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded border border-blue-700 bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-200 hover:bg-blue-900/70 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create subscription'}
              </button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6">
            <div className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Preview</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-100">{formatPlanLabel(form.planType)}</h2>
              <p className="text-sm text-gray-400">{systemLabel(form.targetSystem)} · {form.billingCycle}</p>
              <div className="mt-3 inline-flex rounded-full border border-emerald-700 bg-emerald-900/30 px-3 py-1 text-xs capitalize text-emerald-200">
                {form.status.replaceAll('_', ' ')}
              </div>
              {previewAmountLabel && (
                <p className="mt-3 text-sm font-medium text-gray-200">{previewAmountLabel}</p>
              )}
              {form.isLifetime && (
                <p className="mt-3 text-xs text-amber-300">Lifetime access</p>
              )}
              {selectedUser && (
                <p className="mt-4 text-sm text-gray-300">{selectedUser.full_name || selectedUser.email}</p>
              )}
              {(form.startedAt || form.expiresAt) && (
                <div className="mt-4 space-y-1 border-t border-gray-800 pt-4 text-xs text-gray-400">
                  {form.startedAt && <p>Starts: {new Date(form.startedAt).toLocaleString()}</p>}
                  {form.expiresAt && <p>Expires: {new Date(form.expiresAt).toLocaleString()}</p>}
                </div>
              )}
              {serializeSubscriptionFeatures(form.features).length > 0 && (
                <div className="mt-4 border-t border-gray-800 pt-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Features</p>
                  <SubscriptionFeaturesList features={serializeSubscriptionFeatures(form.features)} />
                </div>
              )}
            </div>
            {!selectedUser && !isEdit && (
              <EmptyState title="Select a user" description="Choose the account this subscription belongs to." />
            )}
          </aside>
        </AdminForm>
      </div>
    </PermissionGate>
  )
}
