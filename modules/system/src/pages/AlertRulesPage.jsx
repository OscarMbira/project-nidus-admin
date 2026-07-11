import { useEffect, useMemo, useState } from 'react'
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertRules,
  fetchNotificationTemplates,
  toggleAlertRule,
  updateAlertRule,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  EmptyState,
  LoadingState,
  SearchBar,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const CONDITION_TYPE_OPTIONS = [
  'subscription_expiry',
  'failed_payment',
  'usage_threshold',
  'system_health',
  'custom',
]
const TARGET_SYSTEM_OPTIONS = ['platform', 'simulator', 'admin', 'all']

const EMPTY_FORM = {
  rule_name: '',
  rule_key: '',
  description: '',
  condition_type: 'system_health',
  condition_params: '{}',
  notification_template_id: '',
  target_roles: '',
  target_system: 'all',
  check_interval_minutes: '60',
  is_active: true,
}

function parseConditionParams(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Condition params must be a JSON object.')
  }
  return parsed
}

function parseTargetRoles(raw) {
  return raw
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

function formatConditionParams(value) {
  if (!value || typeof value !== 'object') return '{}'
  return JSON.stringify(value, null, 2)
}

function formatTargetRoles(roles) {
  if (!Array.isArray(roles)) return ''
  return roles.join(', ')
}

export default function AlertRulesPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingRule, setEditingRule] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const templateById = useMemo(
    () => Object.fromEntries(templates.map((template) => [template.id, template])),
    [templates],
  )

  const loadData = async () => {
    setLoading(true)
    const [rulesRes, templatesRes] = await Promise.all([
      fetchAlertRules(),
      fetchNotificationTemplates(),
    ])
    if (rulesRes.error) showError(rulesRes.error.message || String(rulesRes.error))
    if (templatesRes.error) showError(templatesRes.error.message || String(templatesRes.error))
    setRows(rulesRes.data || [])
    setTemplates(templatesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const template = templateById[row.notification_template_id]
      return [
        row.rule_name,
        row.rule_key,
        row.description,
        row.condition_type,
        row.target_system,
        template?.template_name,
        template?.template_key,
      ].some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, templateById])

  const openEdit = (rule) => {
    setEditingRule(rule)
    setEditForm({
      rule_name: rule.rule_name || '',
      rule_key: rule.rule_key || '',
      description: rule.description || '',
      condition_type: rule.condition_type || 'system_health',
      condition_params: formatConditionParams(rule.condition_params),
      notification_template_id: rule.notification_template_id || '',
      target_roles: formatTargetRoles(rule.target_roles),
      target_system: rule.target_system || 'all',
      check_interval_minutes: String(rule.check_interval_minutes ?? 60),
      is_active: rule.is_active !== false,
    })
  }

  const handleToggle = async (ruleId) => {
    setBusyId(ruleId)
    const { error } = await toggleAlertRule(ruleId)
    setBusyId('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Alert rule toggled.')
    await loadData()
  }

  const buildPayload = (form) => {
    let conditionParams
    try {
      conditionParams = parseConditionParams(form.condition_params)
    } catch (err) {
      throw new Error(err.message || 'Invalid condition params JSON.')
    }

    const interval = Number.parseInt(form.check_interval_minutes, 10)
    if (!Number.isFinite(interval) || interval < 1) {
      throw new Error('Check interval must be at least 1 minute.')
    }

    return {
      rule_name: form.rule_name.trim(),
      rule_key: form.rule_key.trim(),
      description: form.description.trim() || null,
      condition_type: form.condition_type,
      condition_params: conditionParams,
      notification_template_id: form.notification_template_id || null,
      target_roles: parseTargetRoles(form.target_roles),
      target_system: form.target_system,
      check_interval_minutes: interval,
      is_active: form.is_active,
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.rule_name.trim() || !createForm.rule_key.trim()) {
      showError('Rule name and key are required.')
      return
    }
    let payload
    try {
      payload = buildPayload(createForm)
    } catch (err) {
      showError(err.message)
      return
    }
    setSaving(true)
    const { error } = await createAlertRule(payload)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Alert rule created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingRule) return
    if (!editForm.rule_name.trim()) {
      showError('Rule name is required.')
      return
    }
    let payload
    try {
      payload = buildPayload(editForm)
    } catch (err) {
      showError(err.message)
      return
    }
    setSaving(true)
    const { error } = await updateAlertRule(editingRule.id, payload)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('Alert rule updated.')
    setEditingRule(null)
    await loadData()
  }

  const handleDelete = (rule) => {
    confirm({
      title: `Delete ${rule.rule_key}?`,
      message: 'This alert rule will stop evaluating immediately.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(rule.id)
        const { error } = await deleteAlertRule(rule.id)
        setBusyId('')
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Alert rule deleted.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <AdminField label="Rule Name" required>
        <input
          className={inputClass}
          value={form.rule_name}
          onChange={(e) => setForm((prev) => ({ ...prev, rule_name: e.target.value }))}
          placeholder="Failed Payment Alert"
        />
      </AdminField>
      <AdminField label="Rule Key" required>
        <input
          className={inputClass}
          value={form.rule_key}
          readOnly={isEdit}
          onChange={(e) => setForm((prev) => ({ ...prev, rule_key: e.target.value }))}
          placeholder="failed_payment_alert"
        />
      </AdminField>
      <AdminField label="Description">
        <textarea
          rows={2}
          className={inputClass}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Condition Type" required>
          <select
            className={inputClass}
            value={form.condition_type}
            onChange={(e) => setForm((prev) => ({ ...prev, condition_type: e.target.value }))}
          >
            {CONDITION_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Target System" required>
          <select
            className={inputClass}
            value={form.target_system}
            onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}
          >
            {TARGET_SYSTEM_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </AdminField>
      </div>
      <AdminField label="Condition Params (JSON)" required>
        <textarea
          rows={4}
          className={`${inputClass} font-mono text-xs`}
          value={form.condition_params}
          onChange={(e) => setForm((prev) => ({ ...prev, condition_params: e.target.value }))}
          placeholder='{"threshold_days": 7}'
        />
      </AdminField>
      <AdminField label="Notification Template">
        <select
          className={inputClass}
          value={form.notification_template_id}
          onChange={(e) => setForm((prev) => ({ ...prev, notification_template_id: e.target.value }))}
        >
          <option value="">None</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.template_name} ({template.template_key})
            </option>
          ))}
        </select>
      </AdminField>
      <AdminField label="Target Roles (comma-separated)">
        <input
          className={inputClass}
          value={form.target_roles}
          onChange={(e) => setForm((prev) => ({ ...prev, target_roles: e.target.value }))}
          placeholder="super_admin, billing_admin"
        />
      </AdminField>
      <AdminField label="Check Interval (minutes)" required>
        <input
          type="number"
          min={1}
          className={inputClass}
          value={form.check_interval_minutes}
          onChange={(e) => setForm((prev) => ({ ...prev, check_interval_minutes: e.target.value }))}
        />
      </AdminField>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
        />
        Active
      </label>
    </>
  )

  if (loading) return <LoadingState message="Loading alert rules..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Alert Rules</h1>
          <p className="text-sm text-gray-500">Automated conditions that trigger notification templates for admin roles.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search name, key, condition..." />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            New Rule
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No alert rules found" description="Create a rule or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Condition</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Interval</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((rule) => {
                const isBusy = busyId === rule.id
                const template = templateById[rule.notification_template_id]
                return (
                  <tr key={rule.id} className="border-t border-gray-800">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-100">{rule.rule_name}</p>
                      <p className="text-xs text-gray-500">{rule.rule_key}</p>
                    </td>
                    <td className="px-4 py-3">{rule.condition_type}</td>
                    <td className="px-4 py-3">
                      {template ? (
                        <>
                          <p>{template.template_name}</p>
                          <p className="text-xs text-gray-500">{template.template_key}</p>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p>{rule.target_system}</p>
                      {Array.isArray(rule.target_roles) && rule.target_roles.length > 0 && (
                        <p className="text-xs text-gray-500">{rule.target_roles.join(', ')}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">{rule.check_interval_minutes}m</td>
                    <td className="px-4 py-3">
                      <AdminBadge
                        label={rule.is_active ? 'active' : 'inactive'}
                        variant={rule.is_active ? 'active' : 'inactive'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleToggle(rule.id)}
                          className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
                        >
                          {isBusy ? 'Working...' : 'Toggle'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(rule)}
                          className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(rule)}
                          className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Alert Rule" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal
        open={Boolean(editingRule)}
        title={`Edit ${editingRule?.rule_key || 'Alert Rule'}`}
        onClose={() => setEditingRule(null)}
      >
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingRule(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
