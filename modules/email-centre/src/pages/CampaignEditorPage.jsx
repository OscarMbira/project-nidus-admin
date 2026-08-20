import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildCampaignAudience,
  createEmailCampaign,
  dispatchCampaignBatch,
  enqueueCampaign,
  fetchEmailCampaign,
  fetchEmailTemplates,
  getDisplayIdForRecord,
  updateEmailCampaign,
  useDisplayId,
} from '@nidus-admin/shared'
import {
  AdminField,
  inputClass,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const DEFAULT_FILTER = { system: 'all', plan_type: '', subscription_status: 'active', is_affiliate: false, include_expired: false }

export default function CampaignEditorPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const { uuid: campaignId, loading: resolving } = useDisplayId('admin.email_campaigns', idParam)
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templates, setTemplates] = useState([])
  const [estimate, setEstimate] = useState(null)
  const [form, setForm] = useState({
    campaign_name: '',
    description: '',
    template_id: '',
    subject_override: '',
    audience_filter: DEFAULT_FILTER,
  })
  const [record, setRecord] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    Promise.all([
      fetchEmailTemplates({ activeOnly: true }),
      campaignId ? fetchEmailCampaign(campaignId) : Promise.resolve({ data: null }),
    ]).then(([tRes, cRes]) => {
      setTemplates(tRes.data || [])
      if (cRes.data) {
        setForm({
          campaign_name: cRes.data.campaign_name,
          description: cRes.data.description || '',
          template_id: cRes.data.template_id || '',
          subject_override: cRes.data.subject_override || '',
          audience_filter: { ...DEFAULT_FILTER, ...(cRes.data.audience_filter || {}) },
        })
        setRecord(cRes.data)
      }
      setLoading(false)
    })
  }, [campaignId])

  useEffect(() => {
    buildCampaignAudience(form.audience_filter).then(({ data }) => setEstimate(data?.length ?? 0))
  }, [form.audience_filter])

  const template = templates.find((t) => t.id === form.template_id)

  const save = async () => {
    setSaving(true)
    const payload = {
      campaign_name: form.campaign_name,
      description: form.description,
      template_id: form.template_id || null,
      subject_override: form.subject_override || null,
      audience_filter: form.audience_filter,
    }
    const { data, error } = campaignId
      ? await updateEmailCampaign(campaignId, payload)
      : await createEmailCampaign(payload)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Campaign saved.')
    if (!campaignId && data) {
      const displayId = await getDisplayIdForRecord('admin.email_campaigns', data).catch(() => null)
      navigate(`/email-centre/campaign-editor?id=${displayId || data}`)
    }
  }

  const sendNow = async () => {
    if (!campaignId || !template) return
    setSaving(true)
    const { data: count, error: enqErr } = await enqueueCampaign(campaignId)
    if (enqErr) {
      setSaving(false)
      showError(enqErr.message || String(enqErr))
      return
    }
    const { error } = await dispatchCampaignBatch(campaignId, {
      ...template,
      subject_override: form.subject_override,
    })
    setSaving(false)
    if (error) showError(error.message || String(error))
    else showSuccess(`Campaign queued for ${count} recipients.`)
    navigate('/email-centre/campaigns')
  }

  if (loading || resolving) return <LoadingState message="Loading campaign editor..." />

  return (
    <div className="max-w-2xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">{campaignId ? 'Edit Campaign' : 'New Campaign'}</h1>
        <p className="text-sm text-gray-500">Build an audience and choose a template.</p>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !record && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this campaign is saved.</p>
      )}

      {detailTab === 'audit' && record && (
        <AuditDetailsPanel description="Who created this campaign, and how it is classified.">
          <AuditCard title="Identity" description="How this campaign is labelled.">
            <AuditField label="Campaign name" value={record.campaign_name} />
            <AuditField label="Description" value={record.description} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this campaign sits.">
            <AuditField label="Status" value={record.status} />
            <AuditField label="Target system" value={record.audience_filter?.system} />
          </AuditCard>
          <AuditCard title="Record history" description="When this campaign was created and last changed.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
      <>
      <AdminField label="Campaign name">
        <input className={inputClass} value={form.campaign_name} onChange={(e) => setForm((f) => ({ ...f, campaign_name: e.target.value }))} />
      </AdminField>
      <AdminField label="Description">
        <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </AdminField>
      <AdminField label="Template">
        <select className={inputClass} value={form.template_id} onChange={(e) => setForm((f) => ({ ...f, template_id: e.target.value }))}>
          <option value="">Select...</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
        </select>
      </AdminField>
      <AdminField label="Subject override (optional)">
        <input className={inputClass} value={form.subject_override} onChange={(e) => setForm((f) => ({ ...f, subject_override: e.target.value }))} />
      </AdminField>

      <fieldset className="space-y-3 rounded border border-gray-700 p-4">
        <legend className="px-1 text-sm font-medium text-gray-300">Audience</legend>
        <AdminField label="Target system">
          <select className={inputClass} value={form.audience_filter.system} onChange={(e) => setForm((f) => ({ ...f, audience_filter: { ...f.audience_filter, system: e.target.value } }))}>
            <option value="all">Both</option>
            <option value="platform">Platform</option>
            <option value="simulator">Simulator</option>
          </select>
        </AdminField>
        <AdminField label="Plan type (optional)">
          <input className={inputClass} value={form.audience_filter.plan_type || ''} onChange={(e) => setForm((f) => ({ ...f, audience_filter: { ...f.audience_filter, plan_type: e.target.value } }))} placeholder="e.g. professional" />
        </AdminField>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={form.audience_filter.is_affiliate} onChange={(e) => setForm((f) => ({ ...f, audience_filter: { ...f.audience_filter, is_affiliate: e.target.checked } }))} />
          Affiliates only
        </label>
        <p className="text-sm text-amber-300">Estimated recipients: {estimate ?? '—'}</p>
      </fieldset>

      <div className="flex gap-2">
        <button type="button" disabled={saving || !form.campaign_name} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={save}>Save</button>
        {campaignId && template && (
          <button type="button" disabled={saving} className="rounded bg-green-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={sendNow}>Enqueue &amp; send batch</button>
        )}
        <button type="button" className="rounded border border-gray-600 px-4 py-2 text-sm" onClick={() => navigate('/email-centre/campaigns')}>Cancel</button>
      </div>
      </>
      )}
    </div>
  )
}
