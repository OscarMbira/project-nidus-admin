import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ACCOUNT_TYPES,
  PermissionGate,
  fetchActiveCurrencies,
  listPaymentGateways,
  listSettlementAccounts,
  upsertSettlementAccount,
} from '@nidus-admin/shared'
import { AdminCard, AdminField, AdminForm, LoadingState, inputClass, useToast } from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const EMPTY = {
  account_name: '',
  gateway_id: '',
  bank_name: '',
  account_number: '',
  routing_code: '',
  currency_code: 'USD',
  account_type: 'checking',
  is_default: false,
  is_active: true,
  notes: '',
}

export default function SettlementAccountFormPage() {
  const [searchParams] = useSearchParams()
  const accountId = searchParams.get('id')
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [gateways, setGateways] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [maskedAccount, setMaskedAccount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [gatewaysRes, currenciesRes, accountsRes] = await Promise.all([
        listPaymentGateways(),
        fetchActiveCurrencies(),
        accountId ? listSettlementAccounts() : Promise.resolve({ data: [], error: null }),
      ])

      if (gatewaysRes.error) showError(toError(gatewaysRes.error, 'Failed to load gateways.'))
      else setGateways(gatewaysRes.data || [])

      if (currenciesRes.error) showError(toError(currenciesRes.error, 'Failed to load currencies.'))
      else setCurrencies(currenciesRes.data || [])

      if (accountId) {
        if (accountsRes.error) {
          showError(toError(accountsRes.error, 'Failed to load settlement account.'))
        } else {
          const account = (accountsRes.data || []).find((row) => row.id === accountId)
          if (!account) {
            showError('Settlement account not found.')
            navigate('/subscriptions/settlement-accounts')
            setLoading(false)
            return
          }
          setMaskedAccount(account.account_number_masked || '')
          setForm({
            account_name: account.account_name || '',
            gateway_id: account.gateway_id || '',
            bank_name: account.bank_name || '',
            account_number: '',
            routing_code: '',
            currency_code: account.currency_code || 'USD',
            account_type: account.account_type || 'checking',
            is_default: Boolean(account.is_default),
            is_active: account.is_active !== false,
            notes: account.notes || '',
          })
        }
      }

      setLoading(false)
    }
    load()
  }, [accountId, navigate, showError])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.account_name.trim() || !form.bank_name.trim() || !form.currency_code) {
      showError('Account name, bank name, and currency are required.')
      return
    }
    if (!accountId && !form.account_number.trim()) {
      showError('Account number is required for new accounts.')
      return
    }

    setSaving(true)
    const payload = {
      id: accountId || null,
      account_name: form.account_name.trim(),
      gateway_id: form.gateway_id || null,
      bank_name: form.bank_name.trim(),
      account_number: form.account_number.trim() || null,
      routing_code: form.routing_code.trim() || null,
      currency_code: form.currency_code,
      account_type: form.account_type,
      is_default: form.is_default,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    }
    const { error } = await upsertSettlementAccount(payload)
    setSaving(false)

    if (error) showError(toError(error, 'Failed to save settlement account.'))
    else {
      showSuccess(accountId ? 'Settlement account updated.' : 'Settlement account created.')
      navigate('/subscriptions/settlement-accounts')
    }
  }

  if (loading) return <LoadingState message="Loading settlement account..." />

  return (
    <PermissionGate permission="billing.payment_config.edit">
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <button
            type="button"
            onClick={() => navigate('/subscriptions/settlement-accounts')}
            className="mb-2 text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to settlement accounts
          </button>
          <h1 className="text-2xl font-semibold text-gray-100">
            {accountId ? 'Edit Settlement Account' : 'Create Settlement Account'}
          </h1>
        </div>

        <AdminForm onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6">
          <AdminCard title="Account Details">
            <div className="space-y-4 p-4">
              <AdminField label="Account Name" required>
                <input
                  className={inputClass}
                  value={form.account_name}
                  onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))}
                  placeholder="USD Operating Account"
                />
              </AdminField>
              <AdminField label="Linked Gateway">
                <select
                  className={inputClass}
                  value={form.gateway_id}
                  onChange={(e) => setForm((p) => ({ ...p, gateway_id: e.target.value }))}
                >
                  <option value="">None</option>
                  {gateways.map((gateway) => (
                    <option key={gateway.id} value={gateway.id}>
                      {gateway.name}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Bank Name" required>
                <input
                  className={inputClass}
                  value={form.bank_name}
                  onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
                />
              </AdminField>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Account Number" required={!accountId}>
                  <input
                    className={inputClass}
                    value={form.account_number}
                    onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
                    placeholder={accountId ? 'Leave blank to keep existing' : ''}
                  />
                  {accountId && maskedAccount && (
                    <p className="mt-1 text-xs text-gray-500">Current: {maskedAccount}</p>
                  )}
                </AdminField>
                <AdminField label="Routing / SWIFT Code">
                  <input
                    className={inputClass}
                    value={form.routing_code}
                    onChange={(e) => setForm((p) => ({ ...p, routing_code: e.target.value }))}
                    placeholder={accountId ? 'Leave blank to keep existing' : ''}
                  />
                </AdminField>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Currency" required>
                  <select
                    className={inputClass}
                    value={form.currency_code}
                    onChange={(e) => setForm((p) => ({ ...p, currency_code: e.target.value }))}
                  >
                    {currencies.length ? (
                      currencies.map((currency) => (
                        <option key={currency.currency_code} value={currency.currency_code}>
                          {currency.currency_code} — {currency.currency_name}
                        </option>
                      ))
                    ) : (
                      <option value="USD">USD</option>
                    )}
                  </select>
                </AdminField>
                <AdminField label="Account Type">
                  <select
                    className={inputClass}
                    value={form.account_type}
                    onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value }))}
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </AdminField>
              </div>
            </div>
          </AdminCard>

          <AdminCard title="Status">
            <div className="space-y-3 p-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
                />
                Default for this currency
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active
              </label>
              <AdminField label="Notes">
                <textarea
                  rows={3}
                  className={inputClass}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </AdminField>
            </div>
          </AdminCard>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/settlement-accounts')}
              className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Account'}
            </button>
          </div>
        </AdminForm>
      </div>
    </PermissionGate>
  )
}
