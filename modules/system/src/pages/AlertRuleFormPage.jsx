import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createAlertRule,
  fetchAlertRules,
  fetchNotificationTemplates,
  updateAlertRule,
  useDisplayId,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminForm,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'
import AlertRuleFormFields from './AlertRuleFormFields.jsx'
import {
  EMPTY_ALERT_RULE_FORM,
  buildAlertRulePayload,
  formsEqual,
  ruleToForm,
} from './alertRuleFormUtils.js'

export default function AlertRuleFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const idParam = searchParams.get('id')
  const isEdit = Boolean(idParam)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(idParam)
  const { uuid: ruleId, loading: resolving } = useDisplayId('admin.alert_rules', idParam)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [rule, setRule] = useState(null)
  const [templates, setTemplates] = useState([])
  const [form, setForm] = useState(EMPTY_ALERT_RULE_FORM)
  const [baselineForm, setBaselineForm] = useState(EMPTY_ALERT_RULE_FORM)
  const [loadError, setLoadError] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    let active = true

    const load = async () => {
      if (isEdit && !ruleId) return // still resolving idParam -> uuid

      setLoading(true)
      setLoadError(null)

      const [templatesRes, rulesRes] = await Promise.all([
        fetchNotificationTemplates(),
        isEdit
          ? fetchAlertRules({ filters: [{ op: 'eq', col: 'id', val: ruleId }], limit: 1 })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (!active) return

      if (templatesRes.error) {
        setLoadError(templatesRes.error.message || String(templatesRes.error))
        setLoading(false)
        return
      }

      setTemplates(templatesRes.data || [])

      if (isEdit) {
        if (rulesRes.error) {
          setLoadError(rulesRes.error.message || String(rulesRes.error))
          setLoading(false)
          return
        }

        const record = rulesRes.data?.[0]
        if (!record) {
          setLoadError('Alert rule not found.')
          setLoading(false)
          return
        }

        const nextForm = ruleToForm(record)
        setRule(record)
        setForm(nextForm)
        setBaselineForm(nextForm)
      }

      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [isEdit, ruleId])

  const isDirty = useMemo(
    () => !isViewOnly && !formsEqual(form, baselineForm),
    [form, baselineForm, isViewOnly],
  )

  const { requestNavigation } = useUnsavedChangesGuard(
    isDirty,
    'You have unsaved alert rule changes.',
  )

  const goBack = () => requestNavigation('/system/alert-rules')

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!form.rule_name.trim() || (!isEdit && !form.rule_key.trim())) {
      showError('Rule name and key are required.')
      return
    }

    let payload
    try {
      payload = buildAlertRulePayload(form)
    } catch (err) {
      showError(err.message || 'Invalid form values.')
      return
    }

    setSaving(true)
    const { error } = isEdit
      ? await updateAlertRule(ruleId, payload)
      : await createAlertRule(payload)
    setSaving(false)

    if (error) {
      showError(error.message || String(error))
      return
    }

    showSuccess(isEdit ? 'Alert rule updated.' : 'Alert rule created.')
    navigate('/system/alert-rules')
  }

  if (loading || resolving) {
    return <LoadingState message={isEdit ? 'Loading alert rule...' : 'Loading form...'} />
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load alert rule" description={loadError} />
        <button
          type="button"
          onClick={goBack}
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          Back to alert rules
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to alert rules
          </button>
          <h1 className="text-xl font-semibold text-gray-100">
            {isViewOnly ? 'View Alert Rule' : isEdit ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </h1>
          {isEdit && rule && (
            <p className="text-xs text-gray-500">{rule.rule_key}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && rule && (
            <AdminBadge
              label={rule.is_active ? 'active' : 'inactive'}
              variant={rule.is_active ? 'active' : 'inactive'}
            />
          )}
          {isViewOnly ? (
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/alert-rule-form?id=${idParam}`)} />
          ) : (
            <>
              <button
                type="button"
                onClick={goBack}
                className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="alert-rule-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create rule')}
              </button>
            </>
          )}
        </div>
      </div>

      {isViewOnly && (
        <div className="shrink-0 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 text-sm text-gray-300">
          Viewing alert rule in read-only mode. Use Edit to make changes.
        </div>
      )}

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !rule && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this rule is saved.</p>
      )}

      {detailTab === 'audit' && rule && (
        <AuditDetailsPanel description="Who created this alert rule, and how it is classified.">
          <AuditCard title="Identity" description="How this rule is labelled.">
            <AuditField label="Rule name" value={rule.rule_name} />
            <AuditField label="Rule key" value={rule.rule_key} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this rule sits.">
            <AuditField label="Condition type" value={rule.condition_type} />
            <AuditField label="Target system" value={rule.target_system} />
            <AuditField label="Active" value={rule.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this rule was created.">
            <AuditField label="Created by" value={rule.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={rule.created_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
      <AdminForm
        id="alert-rule-form"
        onSubmit={isViewOnly ? (event) => event.preventDefault() : handleSubmit}
        className="space-y-0"
      >
        <AlertRuleFormFields
          form={form}
          setForm={setForm}
          templates={templates}
          isEdit={isEdit}
          readOnly={isViewOnly}
        />
      </AdminForm>
      )}
    </div>
  )
}
