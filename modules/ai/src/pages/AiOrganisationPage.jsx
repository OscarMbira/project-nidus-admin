/**
 * AI Centre (monorepo v1272, PRD D6–D8, D16a) — one organisation's AI controls.
 * Route: /ai/organisation?code=<account_code>[&view=1] (friendly URL, Admin rule 13.1).
 *   - Disable AI for the organisation (overrides the organisation's own switch)
 *   - Credit allowance override (blank = plan allowance)
 *   - Retention override (any value, e.g. legal hold — outside the global min/max is allowed)
 *   - Add credits: one-off top-up or adjustment for this billing period (audited ledger row)
 * The organisation's AI notice and own on/off stay with its Account Owner (AI Settings page).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  addAiCredits,
  aiOrgState,
  aiUsagePercent,
  fetchAiOrganisation,
  PermissionGate,
  updateAiOrganisation,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { ORG_STATE_LABEL } from './AiOrganisationsPage.jsx'

const toForm = (r) => ({
  admin_ai_disabled: Boolean(r?.admin_ai_disabled),
  admin_disabled_reason: r?.admin_disabled_reason || '',
  credit_allowance_override: r?.credit_allowance_override ?? '',
  retention_admin_override: Boolean(r?.retention_admin_override),
  conversation_retention_months: r?.conversation_retention_months ?? 12,
  audit_retention_months: r?.audit_retention_months ?? 24,
})

export function validateOrgOverrides(f) {
  const e = {}
  if (f.admin_ai_disabled && !String(f.admin_disabled_reason).trim()) e.admin_disabled_reason = 'Say why AI is disabled (shown to the organisation).'
  if (f.credit_allowance_override !== '' && !(Number.isInteger(Number(f.credit_allowance_override)) && Number(f.credit_allowance_override) >= 0)) {
    e.credit_allowance_override = 'A whole number, 0 or more — or leave blank for the plan allowance.'
  }
  if (f.retention_admin_override) {
    for (const k of ['conversation_retention_months', 'audit_retention_months']) {
      if (!(Number.isInteger(Number(f[k])) && Number(f[k]) >= 1)) e[k] = 'At least 1 month.'
    }
  }
  return e
}

export default function AiOrganisationPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const code = params.get('code') || params.get('id')
  const isViewOnly = params.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(toForm(null))
  const [baseline, setBaseline] = useState(toForm(null))
  const [errors, setErrors] = useState({})
  const [tab, setTab] = useState('details')
  const [topup, setTopup] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchAiOrganisation(code)
    if (error || !data) setLoadError(String(error || 'Organisation not found'))
    else {
      setRecord(data)
      setForm(toForm(data))
      setBaseline(toForm(data))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [code])

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved AI override changes.')
  const goBack = () => requestNavigation('/ai/organisations')
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = (e) => {
    e.preventDefault()
    const found = validateOrgOverrides(form)
    setErrors(found)
    if (Object.keys(found).length) { showError('Please fix the highlighted fields.'); return }
    confirm({
      title: `Save AI overrides for ${record.account_name}?`,
      message: 'The change is audited and takes effect within a minute.',
      confirmLabel: 'Save overrides',
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateAiOrganisation(record.account_id, form, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess(`AI overrides updated for ${record.account_code || record.account_name}.`)
        setBaseline(form)
        await load()
      },
    })
  }

  const submitTopup = async () => {
    const credits = Number(topup.credits)
    if (!credits || (topup.entry_type === 'topup' && credits <= 0) || !topup.note.trim()) {
      showError('Enter the credits and a note.')
      return
    }
    const { error } = await addAiCredits(record.account_id, credits, topup.entry_type, topup.note.trim())
    if (error) { showError(String(error)); return }
    showSuccess(`${credits.toLocaleString()} credits ${topup.entry_type === 'topup' ? 'added' : 'adjusted'} for ${record.account_code || record.account_name}.`)
    setTopup(null)
    await load()
  }

  if (loading) return <LoadingState message="Loading organisation..." />
  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load organisation" description={loadError} />
        <button type="button" onClick={() => navigate('/ai/organisations')} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">Back to organisations</button>
      </div>
    )
  }

  const state = aiOrgState(record)
  const pct = aiUsagePercent(record)

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">← Back to organisations</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{record.account_name}</h1>
          <p className="font-mono text-xs text-gray-500">{record.account_code} · {record.edition}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBadge label={ORG_STATE_LABEL[state]} variant={state === 'on' ? 'active' : 'pending'} />
          {isViewOnly ? (
            <PermissionGate permission="ai.credits.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/ai/organisation?code=${encodeURIComponent(record.account_code || record.account_id)}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={() => setTopup({ entry_type: 'topup', credits: '', note: '' })}
                className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Add credits
              </button>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              <button type="submit" form="ai-org-form" disabled={!isDirty}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
                Save changes
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Credits used this period', Number(record.used || 0).toLocaleString()],
          ['Allowance this period', Number(record.allowance || 0).toLocaleString()],
          ['Used', pct == null ? '—' : `${pct}%`],
          ['Period started', record.period_start ? new Date(record.period_start).toLocaleDateString() : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && (
        <AuditDetailsPanel description="The organisation's AI notice and the Admin overrides on this record.">
          <AuditCard title="Identity">
            <AuditField label="Organisation" value={record.account_name} />
            <AuditField label="Code" value={record.account_code} />
            <AuditField label="Edition" value={record.edition} />
          </AuditCard>
          <AuditCard title="Classification">
            <AuditField label="AI notice accepted" value={record.consent_accepted_at ? 'Yes' : 'No'} />
            <AuditField label="Organisation has AI on" value={record.ai_enabled ? 'Yes' : 'No'} />
            <AuditField label="Disabled by Admin" value={record.admin_ai_disabled ? 'Yes' : 'No'} />
            <AuditField label="Retention set by Admin" value={record.retention_admin_override ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history">
            <AuditTimestampPair dateLabel="AI notice accepted at" value={record.consent_accepted_at} />
            <AuditField label="Change history" value="Admin Audit log (actions ai.organisation_update, ai.credits_*)" />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <AdminForm id="ai-org-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : save}>
          <fieldset disabled={isViewOnly} className="flex flex-col gap-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <AdminField label="Disable AI for this organisation">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.admin_ai_disabled} onChange={set('admin_ai_disabled')} />
                  AI is off for everyone in this organisation, whatever their own setting
                </label>
              </AdminField>
              <AdminField label="Reason shown to the organisation" required={form.admin_ai_disabled} error={errors.admin_disabled_reason}>
                <input className={inputClass} value={form.admin_disabled_reason} onChange={set('admin_disabled_reason')} disabled={!form.admin_ai_disabled} />
              </AdminField>
            </div>
            <AdminField label="Monthly credit allowance override" error={errors.credit_allowance_override}>
              <input className={inputClass} type="number" min="0" value={form.credit_allowance_override} onChange={set('credit_allowance_override')} placeholder="Blank = the plan's allowance" />
            </AdminField>
            <div className="grid gap-3 md:grid-cols-3">
              <AdminField label="Override retention">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.retention_admin_override} onChange={set('retention_admin_override')} />
                  Admin sets the periods (e.g. legal hold); the organisation can't change them
                </label>
              </AdminField>
              <AdminField label="Keep conversations (months)" error={errors.conversation_retention_months}>
                <input className={inputClass} type="number" min="1" value={form.conversation_retention_months} onChange={set('conversation_retention_months')} disabled={!form.retention_admin_override} />
              </AdminField>
              <AdminField label="Keep usage records (months)" error={errors.audit_retention_months}>
                <input className={inputClass} type="number" min="1" value={form.audit_retention_months} onChange={set('audit_retention_months')} disabled={!form.retention_admin_override} />
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}

      {topup && (
        <AdminModal open title={`Add credits — ${record.account_name}`} onClose={() => setTopup(null)} onConfirm={submitTopup} confirmLabel="Add credits">
          <div className="space-y-3">
            <AdminField label="Type">
              <select className={inputClass} value={topup.entry_type} onChange={(e) => setTopup((t) => ({ ...t, entry_type: e.target.value }))}>
                <option value="topup">Top-up (adds credits this period)</option>
                <option value="adjustment">Adjustment (+ or −, e.g. a correction)</option>
              </select>
            </AdminField>
            <AdminField label="Credits" required>
              <input className={inputClass} type="number" value={topup.credits} onChange={(e) => setTopup((t) => ({ ...t, credits: e.target.value }))} />
            </AdminField>
            <AdminField label="Note (required, audited)" required>
              <textarea className={inputClass} rows={2} value={topup.note} onChange={(e) => setTopup((t) => ({ ...t, note: e.target.value }))} />
            </AdminField>
          </div>
        </AdminModal>
      )}
      {modal}
    </div>
  )
}
