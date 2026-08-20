import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createAffiliate,
  fetchAffiliateById,
  fetchLifecycleLogs,
  generateAffiliateCodeFromName,
  getDisplayIdForRecord,
  PermissionGate,
  updateAffiliate,
  useDisplayId,
} from '@nidus-admin/shared'
import {
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
import { toError } from '../utils/affiliateUi.js'

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  website: '',
  code: '',
  target_system: 'both',
  commission_rate_pct: '10',
  payout_method: 'bank_transfer',
  application_notes: '',
}

export default function AffiliateFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const isEdit = Boolean(idParam)
  const { uuid: editId, loading: resolving } = useDisplayId('admin.affiliates', idParam)
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [lifecycleMeta, setLifecycleMeta] = useState(null)
  const [lifecycleLogs, setLifecycleLogs] = useState([])
  const [record, setRecord] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    if (!editId) return
    const load = async () => {
      setLoading(true)
      const { data, error } = await fetchAffiliateById(editId)
      if (error || !data) {
        showError('Affiliate not found.')
        setLoading(false)
        return
      }
      setRecord(data)
      setForm({
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        website: data.website || '',
        code: data.code || '',
        target_system: data.target_system || 'both',
        commission_rate_pct: String(data.commission_rate_pct ?? 10),
        payout_method: data.payout_method || 'bank_transfer',
        application_notes: data.application_notes || '',
      })
      const rootId = data.root_record_id || editId
      setLifecycleMeta({
        record_status: data.record_status || 'live',
        root_record_id: rootId,
      })
      fetchLifecycleLogs('affiliates', rootId).then(({ data: logs }) => {
        setLifecycleLogs(logs || [])
      })
      setLoading(false)
    }
    load()
  }, [editId])

  const handleNameChange = (name) => {
    setForm((prev) => ({
      ...prev,
      name,
      code: isEdit ? prev.code : generateAffiliateCodeFromName(name),
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim()) {
      showError('Name and email are required.')
      return
    }
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
      target_system: form.target_system,
      commission_rate_pct: Number.parseFloat(form.commission_rate_pct),
      payout_method: form.payout_method,
      application_notes: form.application_notes.trim() || null,
    }
    const { data, error } = isEdit
      ? await updateAffiliate(editId, payload)
      : await createAffiliate({ ...payload, code: form.code.trim() || null })
    setSaving(false)
    if (error) {
      showError(toError(error, isEdit ? 'Failed to update affiliate.' : 'Failed to create affiliate.'))
      return
    }
    showSuccess(isEdit ? 'Affiliate updated.' : 'Affiliate created.')
    const targetId = isEdit ? editId : data
    const displayId = await getDisplayIdForRecord('admin.affiliates', targetId).catch(() => null)
    navigate(`/affiliates/affiliate-detail?id=${displayId || targetId}`)
  }

  if (loading || resolving) return <LoadingState message="Loading affiliate form..." />

  const isPendingApproval = isEdit && lifecycleMeta?.record_status === 'unauthorised'

  return (
    <PermissionGate permission={isEdit ? 'affiliate:update' : 'affiliate:create'} fallback={<div className="p-6 text-sm text-gray-400">You do not have permission to manage affiliates.</div>}>
      <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">{isEdit ? 'Edit Affiliate' : 'Create Affiliate'}</h1>
          <p className="text-sm text-gray-500">Configure partner details and commission rate.</p>
        </div>

        {isPendingApproval && (
          <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            This record is locked for editing until the pending change is approved or rejected.
          </div>
        )}

        <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

        {detailTab === 'audit' && !isEdit && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this affiliate is saved.</p>
        )}

        {detailTab === 'audit' && isEdit && (
          <AuditDetailsPanel description="Who created or changed this affiliate, and how it is classified.">
            <AuditCard title="Identity" description="How this affiliate is labelled.">
              <AuditField label="Name" value={record?.name} />
              <AuditField label="Code" value={record?.code} />
              <AuditField label="Email" value={record?.email} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this affiliate sits.">
              <AuditField label="Status" value={humanizeAuditToken(record?.status)} />
              <AuditField label="Target system" value={humanizeAuditToken(record?.target_system)} />
              <AuditField label="Payout method" value={humanizeAuditToken(record?.payout_method)} />
            </AuditCard>
            <AuditCard title="Record history" description="When this affiliate was created and last changed.">
              <AuditField label="Created by" value={record?.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={record?.created_at} />
              <AuditField label="Updated by" value={record?.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={record?.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {detailTab === 'details' && (
        <>
        {isEdit && lifecycleMeta && (
          <div className="grid gap-4 lg:grid-cols-2">
            <RecordLifecyclePanel
              tableName="affiliates"
              recordId={editId}
              rootRecordId={lifecycleMeta.root_record_id}
              recordStatus={lifecycleMeta.record_status}
              onChanged={() => {
                fetchAffiliateById(editId).then(({ data }) => {
                  if (!data) return
                  setRecord(data)
                  const rootId = data.root_record_id || editId
                  setLifecycleMeta({
                    record_status: data.record_status || 'live',
                    root_record_id: rootId,
                  })
                  fetchLifecycleLogs('affiliates', rootId).then(({ data: logs }) => {
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

        <AdminForm onSubmit={isPendingApproval ? (event) => event.preventDefault() : handleSubmit} className="space-y-4 rounded-lg border border-gray-700 bg-gray-900 p-5">
          <fieldset disabled={isPendingApproval} className="space-y-4 border-0 p-0 m-0 min-w-0 disabled:opacity-95">
          <AdminField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => handleNameChange(e.target.value)} required /></AdminField>
          <AdminField label="Email" required><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required /></AdminField>
          {!isEdit && (
            <AdminField label="Referral Code" required>
              <input className={inputClass} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} required />
            </AdminField>
          )}
          {isEdit && <AdminField label="Referral Code"><input className={inputClass} value={form.code} readOnly /></AdminField>}
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></AdminField>
            <AdminField label="Website"><input className={inputClass} value={form.website} onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))} /></AdminField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Target System">
              <select className={inputClass} value={form.target_system} onChange={(e) => setForm((p) => ({ ...p, target_system: e.target.value }))}>
                {['platform', 'simulator', 'both'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </AdminField>
            <AdminField label="Commission Rate %">
              <input type="number" min={0} max={100} step="0.01" className={inputClass} value={form.commission_rate_pct} onChange={(e) => setForm((p) => ({ ...p, commission_rate_pct: e.target.value }))} />
            </AdminField>
          </div>
          <AdminField label="Payout Method">
            <select className={inputClass} value={form.payout_method} onChange={(e) => setForm((p) => ({ ...p, payout_method: e.target.value }))}>
              {['bank_transfer', 'paypal', 'other'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </AdminField>
          <AdminField label="Internal Notes"><textarea rows={3} className={inputClass} value={form.application_notes} onChange={(e) => setForm((p) => ({ ...p, application_notes: e.target.value }))} /></AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : isEdit ? 'Save' : 'Create'}</button>
          </div>
          </fieldset>
        </AdminForm>
        </>
        )}
      </div>
    </PermissionGate>
  )
}
