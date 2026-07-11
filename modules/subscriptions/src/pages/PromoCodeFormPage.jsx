import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DISCOUNT_TYPES,
  PermissionGate,
  createPromoCode,
  getPromoCode,
  updatePromoCode,
} from '@nidus-admin/shared'
import { AdminCard, AdminField, AdminForm, LoadingState, inputClass, useToast } from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const EMPTY = {
  code: '',
  name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  max_uses: '',
  valid_from: '',
  valid_until: '',
  is_active: true,
}

function toDateInput(value) {
  if (!value) return ''
  return value.slice(0, 10)
}

function discountPreview(type, value) {
  const num = Number.parseFloat(value)
  if (Number.isNaN(num) || num <= 0) return 'Enter a discount value to preview'
  if (type === 'percentage') return `${num}% off`
  return `$${num.toFixed(2)} off`
}

function applyPromoToForm(row) {
  return {
    code: row.code || '',
    name: row.name || '',
    description: row.description || '',
    discount_type: row.discount_type || 'percentage',
    discount_value: String(row.discount_value ?? ''),
    max_uses: row.max_uses != null ? String(row.max_uses) : '',
    valid_from: toDateInput(row.valid_from),
    valid_until: toDateInput(row.valid_until),
    is_active: Boolean(row.is_active),
  }
}

export default function PromoCodeFormPage() {
  const [searchParams] = useSearchParams()
  const promoId = searchParams.get('id')
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [currentUses, setCurrentUses] = useState(null)
  const [loading, setLoading] = useState(Boolean(promoId))
  const [saving, setSaving] = useState(false)

  const previewText = useMemo(
    () => discountPreview(form.discount_type, form.discount_value),
    [form.discount_type, form.discount_value],
  )

  useEffect(() => {
    if (!promoId) {
      setForm(EMPTY)
      setCurrentUses(null)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setForm(EMPTY)
    setCurrentUses(null)
    setLoading(true)

    getPromoCode(promoId).then(({ data, error }) => {
      if (cancelled) return
      if (error) showError(toError(error, 'Failed to load promo code.'))
      else if (data) setForm(applyPromoToForm(data))
      if (data) setCurrentUses(data.current_uses ?? 0)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [promoId, showError])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const code = form.code.trim().toUpperCase()
    if (!code || !form.name.trim()) {
      showError('Code and name are required.')
      return
    }
    const discountValue = Number.parseFloat(form.discount_value)
    if (Number.isNaN(discountValue) || discountValue <= 0) {
      showError('Discount value must be greater than zero.')
      return
    }
    if (form.discount_type === 'percentage' && discountValue > 100) {
      showError('Percentage discount cannot exceed 100%.')
      return
    }
    const maxUses = form.max_uses.trim() ? Number.parseInt(form.max_uses, 10) : null
    if (form.max_uses.trim() && (Number.isNaN(maxUses) || maxUses < 1)) {
      showError('Max uses must be a positive integer or left empty for unlimited.')
      return
    }

    setSaving(true)
    const payload = {
      code,
      name: form.name.trim(),
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      max_uses: maxUses,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      is_active: form.is_active,
    }
    const { error } = promoId
      ? await updatePromoCode(promoId, payload)
      : await createPromoCode(payload)
    setSaving(false)
    if (error) showError(toError(error, 'Failed to save promo code.'))
    else {
      showSuccess(promoId ? 'Promo code updated.' : 'Promo code created.')
      navigate('/subscriptions/promo-codes')
    }
  }

  if (loading) return <LoadingState message="Loading promo code..." />

  return (
    <PermissionGate permission="billing.payment_config.edit">
      <div className="space-y-3 p-4 md:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/subscriptions/promo-codes')}
              className="mb-1 text-xs text-gray-400 hover:text-gray-200"
            >
              ← Back to promo codes
            </button>
            <h1 className="text-xl font-semibold text-gray-100">
              {promoId ? 'Edit Promo Code' : 'Create Promo Code'}
            </h1>
            {promoId && form.code && (
              <p className="font-mono text-xs text-gray-500">{form.code}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/subscriptions/promo-codes')}
              className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="promo-code-form"
              disabled={saving}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {saving ? 'Saving...' : promoId ? 'Save Promo Code' : 'Create Promo Code'}
            </button>
          </div>
        </div>

        <AdminForm id="promo-code-form" onSubmit={handleSubmit} className="mx-auto max-w-6xl">
          <AdminCard className="!p-3">
            <div className="grid gap-4 xl:grid-cols-12">
              <section className="space-y-3 xl:col-span-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Promo Details</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <AdminField label="Code" required>
                    <input
                      className={`${inputClass} font-mono uppercase`}
                      value={form.code}
                      disabled={Boolean(promoId)}
                      onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                      placeholder="SUMMER20"
                    />
                  </AdminField>
                  <AdminField label="Name" required>
                    <input
                      className={inputClass}
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Summer launch discount"
                    />
                  </AdminField>
                </div>
                <AdminField label="Description">
                  <textarea
                    rows={2}
                    className={inputClass}
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  />
                </AdminField>
              </section>

              <section className="space-y-3 xl:col-span-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Discount</h2>
                <AdminField label="Discount Type" required>
                  <select
                    className={inputClass}
                    value={form.discount_type}
                    onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value }))}
                  >
                    {DISCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Discount Value" required>
                  <input
                    type="number"
                    min={0}
                    step={form.discount_type === 'percentage' ? '1' : '0.01'}
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    className={inputClass}
                    value={form.discount_value}
                    onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                  />
                </AdminField>
                <p className="rounded border border-blue-800/50 bg-blue-900/20 px-2.5 py-1.5 text-xs text-blue-200">
                  Preview: {previewText}
                </p>
              </section>

              <section className="space-y-3 xl:col-span-5">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Limits & Validity</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Max Uses">
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
                      value={form.max_uses}
                      onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
                      placeholder="Unlimited"
                    />
                  </AdminField>
                  {promoId ? (
                    <AdminField label="Current Uses">
                      <input className={inputClass} readOnly value={currentUses ?? 0} />
                    </AdminField>
                  ) : (
                    <div className="hidden sm:block" aria-hidden="true" />
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminField label="Valid From">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.valid_from}
                      onChange={(e) => setForm((p) => ({ ...p, valid_from: e.target.value }))}
                    />
                  </AdminField>
                  <AdminField label="Valid Until">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.valid_until}
                      onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))}
                    />
                  </AdminField>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  />
                  Active
                </label>
              </section>
            </div>
          </AdminCard>
        </AdminForm>
      </div>
    </PermissionGate>
  )
}
