import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FEE_TYPES,
  PermissionGate,
  fetchActiveCurrencies,
  listPaymentGateways,
  listPaymentMethods,
  methodTypesForProvider,
  upsertPaymentMethod,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminField,
  AdminForm,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const EMPTY = {
  gateway_id: '',
  method_type: '',
  display_name: '',
  supported_currencies: ['USD'],
  min_amount: '0',
  max_amount: '',
  fee_type: 'none',
  fee_value: '0',
  display_order: '0',
  is_enabled: true,
}

export default function PaymentMethodFormPage() {
  const [searchParams] = useSearchParams()
  const methodId = searchParams.get('id')
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [gateways, setGateways] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const selectedGateway = useMemo(
    () => gateways.find((g) => g.id === form.gateway_id) || null,
    [gateways, form.gateway_id],
  )

  const methodTypeOptions = useMemo(
    () => methodTypesForProvider(selectedGateway?.provider_key),
    [selectedGateway?.provider_key],
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [gatewaysRes, currenciesRes, methodsRes] = await Promise.all([
        listPaymentGateways(),
        fetchActiveCurrencies(),
        methodId ? listPaymentMethods() : Promise.resolve({ data: [], error: null }),
      ])

      if (gatewaysRes.error) showError(toError(gatewaysRes.error, 'Failed to load gateways.'))
      else setGateways(gatewaysRes.data || [])

      if (currenciesRes.error) showError(toError(currenciesRes.error, 'Failed to load currencies.'))
      else setCurrencies(currenciesRes.data || [])

      if (methodId) {
        if (methodsRes.error) {
          showError(toError(methodsRes.error, 'Failed to load payment method.'))
        } else {
          const existing = (methodsRes.data || []).find((row) => row.id === methodId)
          if (!existing) {
            showError('Payment method not found.')
          } else {
            setForm({
              gateway_id: existing.gateway_id || '',
              method_type: existing.method_type || '',
              display_name: existing.display_name || '',
              supported_currencies: existing.supported_currencies?.length
                ? existing.supported_currencies
                : ['USD'],
              min_amount: String(existing.min_amount ?? 0),
              max_amount: existing.max_amount != null ? String(existing.max_amount) : '',
              fee_type: existing.fee_type || 'none',
              fee_value: String(existing.fee_value ?? 0),
              display_order: String(existing.display_order ?? 0),
              is_enabled: existing.is_enabled !== false,
            })
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [methodId, showError])

  const toggleCurrency = (code) => {
    setForm((prev) => {
      const selected = new Set(prev.supported_currencies)
      if (selected.has(code)) {
        if (selected.size <= 1) return prev
        selected.delete(code)
      } else {
        selected.add(code)
      }
      return { ...prev, supported_currencies: Array.from(selected) }
    })
  }

  const handleGatewayChange = (gatewayId) => {
    const gateway = gateways.find((g) => g.id === gatewayId)
    const types = methodTypesForProvider(gateway?.provider_key)
    setForm((prev) => ({
      ...prev,
      gateway_id: gatewayId,
      method_type: types.some((t) => t.value === prev.method_type) ? prev.method_type : '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.gateway_id || !form.method_type || !form.display_name.trim()) {
      showError('Gateway, method type, and display name are required.')
      return
    }
    if (!form.supported_currencies.length) {
      showError('Select at least one supported currency.')
      return
    }

    const minAmount = Number.parseFloat(form.min_amount)
    if (Number.isNaN(minAmount) || minAmount < 0) {
      showError('Minimum amount must be zero or greater.')
      return
    }

    let maxAmount = null
    if (form.max_amount.trim()) {
      maxAmount = Number.parseFloat(form.max_amount)
      if (Number.isNaN(maxAmount) || maxAmount < minAmount) {
        showError('Maximum amount must be greater than or equal to minimum amount.')
        return
      }
    }

    const feeValue = Number.parseFloat(form.fee_value)
    if (Number.isNaN(feeValue) || feeValue < 0) {
      showError('Fee value must be zero or greater.')
      return
    }

    const displayOrder = Number.parseInt(form.display_order, 10)
    if (Number.isNaN(displayOrder)) {
      showError('Display order must be a valid number.')
      return
    }

    setSaving(true)
    const { error } = await upsertPaymentMethod({
      id: methodId || null,
      gateway_id: form.gateway_id,
      method_type: form.method_type,
      display_name: form.display_name.trim(),
      supported_currencies: form.supported_currencies,
      min_amount: minAmount,
      max_amount: maxAmount,
      fee_type: form.fee_type,
      fee_value: form.fee_type === 'none' ? 0 : feeValue,
      display_order: displayOrder,
      is_enabled: form.is_enabled,
    })
    setSaving(false)

    if (error) showError(toError(error, 'Failed to save payment method.'))
    else {
      showSuccess(methodId ? 'Payment method updated.' : 'Payment method created.')
      navigate('/subscriptions/payment-methods')
    }
  }

  if (loading) return <LoadingState message="Loading payment method..." />

  return (
    <PermissionGate permission="billing.payment_config.edit">
      <div className="space-y-3 p-4 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/subscriptions/payment-methods')}
              className="mb-1 text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back to payment methods
            </button>
            <h1 className="text-xl font-semibold text-gray-100">
              {methodId ? 'Edit Payment Method' : 'Create Payment Method'}
            </h1>
            {methodId && selectedGateway && (
              <p className="text-xs text-gray-500">{selectedGateway.name} · {selectedGateway.display_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/payment-methods')}
              className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="payment-method-form"
              disabled={saving}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : methodId ? 'Save Method' : 'Create Method'}
            </button>
          </div>
        </div>

        <AdminForm id="payment-method-form" onSubmit={handleSubmit} className="mx-auto max-w-6xl">
          <AdminCard className="!p-3">
            <div className="grid gap-4 xl:grid-cols-12">
              <section className="space-y-3 xl:col-span-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Method Details</h2>
                {!methodId && (
                  <AdminField label="Gateway" required>
                    <select
                      className={inputClass}
                      value={form.gateway_id}
                      onChange={(e) => handleGatewayChange(e.target.value)}
                    >
                      <option value="">Select gateway...</option>
                      {gateways.map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>
                          {gateway.name} — {gateway.display_name}
                        </option>
                      ))}
                    </select>
                  </AdminField>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Method Type" required>
                    <select
                      className={inputClass}
                      value={form.method_type}
                      disabled={!form.gateway_id}
                      onChange={(e) => setForm((p) => ({ ...p, method_type: e.target.value }))}
                    >
                      <option value="">Select method type...</option>
                      {methodTypeOptions.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Display Order">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={form.display_order}
                      onChange={(e) => setForm((p) => ({ ...p, display_order: e.target.value }))}
                    />
                  </AdminField>
                </div>

                <AdminField label="Display Name" required>
                  <input
                    className={inputClass}
                    value={form.display_name}
                    onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
                    placeholder="EcoCash Mobile Wallet"
                  />
                </AdminField>
              </section>

              <section className="space-y-3 xl:col-span-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currencies & Limits</h2>
                <AdminField label="Supported Currencies" required>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-4 2xl:grid-cols-5">
                    {currencies.map((currency) => {
                      const selected = form.supported_currencies.includes(currency.currency_code)
                      return (
                        <label
                          key={currency.currency_code}
                          title={currency.currency_name || currency.currency_code}
                          className={`flex cursor-pointer items-center justify-center rounded border px-2 py-1 text-xs ${
                            selected
                              ? 'border-blue-600 bg-blue-900/30 text-blue-100'
                              : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
                            onChange={() => toggleCurrency(currency.currency_code)}
                          />
                          {currency.currency_code}
                        </label>
                      )
                    })}
                    {!currencies.length && (
                      <p className="col-span-full text-sm text-gray-500">No active currencies found. USD is selected by default.</p>
                    )}
                  </div>
                </AdminField>

                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Minimum Amount">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      value={form.min_amount}
                      onChange={(e) => setForm((p) => ({ ...p, min_amount: e.target.value }))}
                    />
                  </AdminField>
                  <AdminField label="Maximum Amount">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      value={form.max_amount}
                      onChange={(e) => setForm((p) => ({ ...p, max_amount: e.target.value }))}
                      placeholder="No limit"
                    />
                  </AdminField>
                </div>
              </section>

              <section className="space-y-3 xl:col-span-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Fees & Status</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <AdminField label="Fee Type">
                    <select
                      className={inputClass}
                      value={form.fee_type}
                      onChange={(e) => setForm((p) => ({ ...p, fee_type: e.target.value }))}
                    >
                      {FEE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </AdminField>
                  <AdminField label="Fee Value">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={inputClass}
                      value={form.fee_value}
                      disabled={form.fee_type === 'none'}
                      onChange={(e) => setForm((p) => ({ ...p, fee_value: e.target.value }))}
                    />
                  </AdminField>
                </div>

                <label className="flex items-center gap-2 rounded border border-gray-700 px-3 py-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(e) => setForm((p) => ({ ...p, is_enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </section>
            </div>
          </AdminCard>
        </AdminForm>
      </div>
    </PermissionGate>
  )
}
