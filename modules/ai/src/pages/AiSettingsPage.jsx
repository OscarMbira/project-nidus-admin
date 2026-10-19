/**
 * AI Centre (monorepo v1272, PRD stories 5, 10 / D6, D8, D16a) — global AI settings:
 * kill switch, credit unit and warning level, Planner trial credits, retention defaults and the
 * min/max organisations may choose, and the agent safety limits. Saved through
 * admin_ai_update_settings (audited, reason required). Model routing has its own page.
 */
import { useEffect, useMemo, useState } from 'react'
import { fetchAiSettings, PermissionGate, updateAiSettings, useCurrentAdmin, useUnsavedChangesGuard, validateAiSettings } from '@nidus-admin/shared'
import {
  AdminField,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  LoadingState,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const KEYS = ['kill_switch', 'kill_switch_reason', 'credit_unit_usd', 'warn_percent', 'default_trial_credits',
  'conversation_retention_months', 'audit_retention_months', 'retention_min_months', 'retention_max_months',
  'max_agent_iterations', 'query_row_cap', 'query_timeout_ms']
const toForm = (s) => Object.fromEntries(KEYS.map((k) => [k, k === 'kill_switch' ? Boolean(s?.[k]) : (s?.[k] ?? '')]))

export default function AiSettingsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const { hasPermission } = useCurrentAdmin()
  const canEdit = hasPermission('ai.settings.edit')
  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState(null)
  const [form, setForm] = useState(toForm(null))
  const [baseline, setBaseline] = useState(toForm(null))
  const [errors, setErrors] = useState({})
  const [tab, setTab] = useState('details')

  const load = async () => {
    const { data, error } = await fetchAiSettings()
    if (error) showError(String(error))
    setRecord(data)
    setForm(toForm(data))
    setBaseline(toForm(data))
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const isDirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])
  useUnsavedChangesGuard(isDirty, 'You have unsaved AI settings.')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = () => {
    const found = validateAiSettings(form)
    setErrors(found)
    if (Object.keys(found).length) { showError('Please fix the highlighted fields.'); return }
    const changes = Object.fromEntries(KEYS.filter((k) => form[k] !== baseline[k]).map((k) => [k, form[k]]))
    const killing = changes.kill_switch === true
    confirm({
      title: killing ? 'Switch AI off for everyone?' : 'Save AI settings?',
      message: killing
        ? 'Every AI feature stops for every organisation within about a minute. Non-AI features are not affected.'
        : 'The change is audited and takes effect within about a minute.',
      confirmLabel: killing ? 'Switch AI off' : 'Save',
      danger: killing,
      requireReason: true,
      reasonLabel: 'Reason for the change (required)',
      onConfirm: async (reason) => {
        const { error } = await updateAiSettings(changes, reason)
        if (error) { showError(String(error)); throw new Error(error) }
        showSuccess('AI settings updated.')
        await load()
      },
    })
  }

  if (loading) return <LoadingState message="Loading AI settings..." />

  const num = (k, label, help, props = {}) => (
    <AdminField label={label} error={errors[k]}>
      <input className={inputClass} type="number" value={form[k]} onChange={set(k)} {...props} />
      {help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>}
    </AdminField>
  )

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">AI settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Global controls for Ask Nidus and the AI agents in every app.</p>
        </div>
        <PermissionGate permission="ai.settings.edit">
          <div className="flex gap-2">
            <button type="button" disabled={!isDirty} onClick={() => { setForm(baseline); setErrors({}) }}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50">Discard</button>
            <button type="button" disabled={!isDirty} onClick={save}
              className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">Save changes</button>
          </div>
        </PermissionGate>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && record && (
        <AuditDetailsPanel description="The global AI settings record.">
          <AuditCard title="Identity"><AuditField label="Record" value="Global AI settings (one record)" /></AuditCard>
          <AuditCard title="Classification">
            <AuditField label="Kill switch" value={record.kill_switch ? 'On — AI is off for everyone' : 'Off'} />
            <AuditField label="Agent model" value={record.model_agent} />
          </AuditCard>
          <AuditCard title="Record history">
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
            <AuditField label="Change history" value="Admin Audit log (action ai.settings_update)" />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <fieldset disabled={!canEdit} className="space-y-4">
          <section className={`rounded-lg border p-4 ${form.kill_switch ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Kill switch</h2>
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.kill_switch} onChange={set('kill_switch')} />
              Switch AI off for every organisation and app
            </label>
            {form.kill_switch && (
              <div className="mt-3">
                <AdminField label="Reason (shown in the AI Centre)" required error={errors.kill_switch_reason}>
                  <input className={inputClass} value={form.kill_switch_reason} onChange={set('kill_switch_reason')} />
                </AdminField>
              </div>
            )}
          </section>

          <section className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:grid-cols-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 md:col-span-3">Credits</h2>
            {num('credit_unit_usd', 'Value of 1 credit (USD of model cost)', 'Changing this changes how many credits each question uses.', { step: '0.0001', min: '0' })}
            {num('warn_percent', 'Warn at (% of allowance)', 'Account Owners get an in-app and email warning.', { min: '1', max: '99' })}
            {num('default_trial_credits', 'Credits without a paid plan', 'Platform trials and free Simulator users. The Planner trial is set on Plans & Credits.', { min: '0' })}
          </section>

          <section className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:grid-cols-4">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 md:col-span-4">Retention</h2>
            {num('conversation_retention_months', 'Default: keep conversations (months)', 'For organisations that have not chosen.', { min: '1' })}
            {num('audit_retention_months', 'Default: keep usage records (months)', 'Usage records have no question/answer text.', { min: '1' })}
            {num('retention_min_months', 'Organisations may choose from (months)', null, { min: '1' })}
            {num('retention_max_months', '…up to (months)', 'Admin overrides per organisation can go outside this range.', { min: '1' })}
          </section>

          <section className="grid gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 md:grid-cols-3">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 md:col-span-3">Safety limits</h2>
            {num('max_agent_iterations', 'Max agent steps per question', 'Stops a runaway agent loop.', { min: '1' })}
            {num('query_row_cap', 'Max rows per query', 'The query runner never returns more.', { min: '1' })}
            {num('query_timeout_ms', 'Query timeout (ms)', null, { min: '100' })}
          </section>
        </fieldset>
      )}
      {modal}
    </div>
  )
}
