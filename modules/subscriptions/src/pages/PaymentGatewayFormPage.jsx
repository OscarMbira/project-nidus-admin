import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  PAYMENT_PROVIDERS,
  ENVIRONMENTS,
  PermissionGate,
  createPaymentGateway,
  fetchLifecycleLogs,
  getPaymentGateway,
  providerLabel,
  updatePaymentGateway,
} from '@nidus-admin/shared'
import {
  AdminCard,
  AdminField,
  AdminForm,
  LoadingState,
  RecordLifecyclePanel,
  RecordVersionHistory,
  inputClass,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
  humanizeAuditToken,
} from '@nidus-admin/ui'

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const EMPTY = {
  name: '',
  provider_key: 'paynow',
  display_name: '',
  environment: 'sandbox',
  api_key: '',
  api_secret: '',
  webhook_secret: '',
  is_active: false,
  is_default: false,
  notes: '',
}

const applyGatewayToForm = (data, gatewayId) => ({
  name: data.name || '',
  provider_key: data.provider_key || 'paynow',
  display_name: data.display_name || '',
  environment: data.environment || 'sandbox',
  api_key: '',
  api_secret: '',
  webhook_secret: '',
  is_active: Boolean(data.is_active),
  is_default: Boolean(data.is_default),
  notes: data.notes || '',
  lifecycleMeta: {
    record_status: data.record_status || 'live',
    root_record_id: data.root_record_id || gatewayId,
  },
})

export default function PaymentGatewayFormPage() {
  const [searchParams] = useSearchParams()
  const gatewayId = searchParams.get('id')
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(Boolean(gatewayId))
  const [saving, setSaving] = useState(false)
  const [lifecycleMeta, setLifecycleMeta] = useState(null)
  const [lifecycleLogs, setLifecycleLogs] = useState([])
  const [record, setRecord] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  const providerMeta = useMemo(
    () => PAYMENT_PROVIDERS.find((p) => p.key === form.provider_key) || PAYMENT_PROVIDERS[0],
    [form.provider_key],
  )

  useEffect(() => {
    if (!gatewayId) {
      setForm(EMPTY)
      setLifecycleMeta(null)
      setLifecycleLogs([])
      setRecord(null)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setForm(EMPTY)
    setLifecycleMeta(null)
    setLifecycleLogs([])
    setLoading(true)

    getPaymentGateway(gatewayId).then(({ data, error }) => {
      if (cancelled) return
      if (error) showError(toError(error, 'Failed to load gateway.'))
      else if (data) {
        const { lifecycleMeta: nextLifecycleMeta, ...nextForm } = applyGatewayToForm(data, gatewayId)
        setForm(nextForm)
        setLifecycleMeta(nextLifecycleMeta)
        setRecord(data)
        fetchLifecycleLogs('payment_gateways', nextLifecycleMeta.root_record_id).then(({ data: logs, error: logsError }) => {
          if (cancelled) return
          if (logsError) return
          setLifecycleLogs(logs || [])
        })
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [gatewayId])

  const webhookUrl = gatewayId
    ? `${window.location.origin}/api/webhooks/payments/${gatewayId}`
    : 'Generated after save'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.display_name.trim()) {
      showError('Gateway name and display name are required.')
      return
    }
    setSaving(true)
    const payload = {
      ...form,
      name: form.name.trim(),
      display_name: form.display_name.trim(),
      api_key: form.api_key || null,
      api_secret: form.api_secret || null,
      webhook_secret: form.webhook_secret || null,
      notes: form.notes.trim() || null,
    }
    const { error } = gatewayId
      ? await updatePaymentGateway(gatewayId, payload)
      : await createPaymentGateway(payload)
    setSaving(false)
    if (error) showError(toError(error, 'Failed to save gateway.'))
    else {
      showSuccess(gatewayId ? 'Gateway updated.' : 'Gateway created.')
      navigate('/subscriptions/payment-gateways')
    }
  }

  if (loading) return <LoadingState message="Loading gateway..." />

  const isPendingApproval = Boolean(gatewayId) && lifecycleMeta?.record_status === 'unauthorised'

  return (
    <PermissionGate permission={gatewayId ? 'billing.payment_config.edit' : 'billing.payment_config.edit'}>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <button type="button" onClick={() => navigate('/subscriptions/payment-gateways')} className="mb-2 text-xs text-gray-400 hover:text-gray-200">← Back to gateways</button>
          <h1 className="text-2xl font-semibold text-gray-100">{gatewayId ? 'Edit Gateway' : 'Create Gateway'}</h1>
        </div>

        {isPendingApproval && (
          <div className="mx-auto max-w-3xl rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            This record is locked for editing until the pending change is approved or rejected.
          </div>
        )}

        <div className="mx-auto max-w-3xl">
          <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />
        </div>

        {detailTab === 'audit' && !gatewayId && (
          <p className="mx-auto max-w-3xl text-sm text-gray-500 dark:text-gray-400">Audit details appear after this gateway is saved.</p>
        )}

        {detailTab === 'audit' && gatewayId && (
          <div className="mx-auto max-w-3xl">
            <AuditDetailsPanel description="Who created or changed this payment gateway, and how it is classified.">
              <AuditCard title="Identity" description="How this gateway is labelled.">
                <AuditField label="Name" value={record?.name} />
                <AuditField label="Display name" value={record?.display_name} />
                <AuditField label="Provider" value={record?.provider_key ? providerLabel(record.provider_key) : null} />
              </AuditCard>
              <AuditCard title="Classification" description="Where this gateway sits.">
                <AuditField label="Environment" value={humanizeAuditToken(record?.environment)} />
                <AuditField label="Active" value={record?.is_active ? 'Yes' : 'No'} />
                <AuditField label="Default gateway" value={record?.is_default ? 'Yes' : 'No'} />
              </AuditCard>
              <AuditCard title="Record history" description="When this gateway was created and last changed.">
                <AuditField label="Created by" value={record?.created_by || null} />
                <AuditTimestampPair dateLabel="Created at" value={record?.created_at} />
                <AuditField label="Updated by" value={record?.updated_by || null} />
                <AuditTimestampPair dateLabel="Last updated" value={record?.updated_at} />
              </AuditCard>
            </AuditDetailsPanel>
          </div>
        )}

        {detailTab === 'details' && (
        <>
        {gatewayId && lifecycleMeta && (
          <div className="mx-auto grid max-w-3xl gap-4 lg:grid-cols-2">
            <RecordLifecyclePanel
              tableName="payment_gateways"
              recordId={gatewayId}
              rootRecordId={lifecycleMeta.root_record_id}
              recordStatus={lifecycleMeta.record_status}
              onChanged={() => {
                getPaymentGateway(gatewayId).then(({ data }) => {
                  if (!data) return
                  const { lifecycleMeta: nextLifecycleMeta } = applyGatewayToForm(data, gatewayId)
                  setLifecycleMeta(nextLifecycleMeta)
                  setRecord(data)
                  fetchLifecycleLogs('payment_gateways', nextLifecycleMeta.root_record_id).then(({ data: logs }) => {
                    setLifecycleLogs(logs || [])
                  })
                })
              }}
            />
            <section className="rounded-lg border border-gray-700 bg-gray-900 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-200">Lifecycle history</h3>
              <RecordVersionHistory logs={lifecycleLogs} />
            </section>
          </div>
        )}

        <AdminForm onSubmit={isPendingApproval ? (event) => event.preventDefault() : handleSubmit} className="mx-auto max-w-3xl space-y-6">
          <fieldset disabled={isPendingApproval} className="space-y-6 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
          <AdminCard title="Gateway Details">
            <div className="space-y-4 p-4">
              <AdminField label="Gateway Name" required>
                <input className={inputClass} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="PayNow Production" />
              </AdminField>
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="Provider" required>
                  <select className={inputClass} value={form.provider_key} disabled={Boolean(gatewayId)} onChange={(e) => setForm((p) => ({ ...p, provider_key: e.target.value, display_name: p.display_name || providerLabel(e.target.value) }))}>
                    {PAYMENT_PROVIDERS.map((p) => (
                      <option key={p.key} value={p.key} disabled={!p.active}>{p.label}{!p.active ? ' (future)' : ''}</option>
                    ))}
                  </select>
                </AdminField>
                <AdminField label="Environment" required>
                  <select className={inputClass} value={form.environment} onChange={(e) => setForm((p) => ({ ...p, environment: e.target.value }))}>
                    {ENVIRONMENTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </AdminField>
              </div>
              <AdminField label="Display Name" required>
                <input className={inputClass} value={form.display_name} onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))} />
              </AdminField>
            </div>
          </AdminCard>

          <AdminCard title="Credentials">
            <div className="space-y-4 p-4">
              <p className="text-xs text-gray-500">Secrets are write-only and never returned after save.</p>
              <AdminField label={providerMeta.apiKeyLabel}>
                <input className={inputClass} value={form.api_key} onChange={(e) => setForm((p) => ({ ...p, api_key: e.target.value }))} placeholder={gatewayId ? 'Leave blank to keep existing' : ''} />
              </AdminField>
              <AdminField label={providerMeta.apiSecretLabel}>
                <input type="password" className={inputClass} value={form.api_secret} onChange={(e) => setForm((p) => ({ ...p, api_secret: e.target.value }))} placeholder={gatewayId ? '••••••••' : ''} />
              </AdminField>
              <AdminField label="Webhook Secret">
                <input type="password" className={inputClass} value={form.webhook_secret} onChange={(e) => setForm((p) => ({ ...p, webhook_secret: e.target.value }))} placeholder={gatewayId ? '••••••••' : ''} />
              </AdminField>
              <AdminField label="Webhook URL">
                <input className={inputClass} readOnly value={webhookUrl} />
              </AdminField>
            </div>
          </AdminCard>

          <AdminCard title="Status">
            <div className="space-y-3 p-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />
                Default gateway
              </label>
              <AdminField label="Notes">
                <textarea rows={3} className={inputClass} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </AdminField>
            </div>
          </AdminCard>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => navigate('/subscriptions/payment-gateways')} className="rounded border border-gray-700 px-4 py-2 text-sm text-gray-300">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save Gateway'}</button>
          </div>
          </fieldset>
        </AdminForm>
        </>
        )}
      </div>
    </PermissionGate>
  )
}
