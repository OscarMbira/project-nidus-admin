import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_RETRY_SCHEDULE,
  PermissionGate,
  deleteRetryRule,
  listPaymentGateways,
  listRetryRules,
  toggleRetryRule,
  upsertRetryRule,
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

const MAX_SCHEDULE_ROWS = 6

const EMPTY_FORM = {
  rule_name: '',
  gateway_id: '',
  failure_code: '',
  retry_schedule: DEFAULT_RETRY_SCHEDULE.map((row) => ({ ...row })),
  is_active: true,
}

const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

const normalizeSchedule = (schedule) =>
  (Array.isArray(schedule) ? schedule : []).map((row, index) => ({
    attempt: index + 1,
    delay_hours: Number.parseInt(row.delay_hours, 10) || 0,
    notify_customer: Boolean(row.notify_customer),
  }))

const formatScheduleSummary = (schedule) => {
  const rows = normalizeSchedule(schedule)
  if (!rows.length) return '—'
  const delays = rows.map((row) => `${row.delay_hours}h`).join(' → ')
  return `${rows.length} attempt${rows.length === 1 ? '' : 's'}: ${delays}`
}

const cloneSchedule = (schedule) =>
  normalizeSchedule(schedule).length
    ? normalizeSchedule(schedule)
    : DEFAULT_RETRY_SCHEDULE.map((row) => ({ ...row }))

export default function PaymentRetryRulePage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [gateways, setGateways] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingRule, setEditingRule] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [rulesRes, gatewaysRes] = await Promise.all([listRetryRules(), listPaymentGateways()])
    if (rulesRes.error) showError(toError(rulesRes.error, 'Failed to load retry rules.'))
    else setRows(rulesRes.data || [])
    if (gatewaysRes.error) showError(toError(gatewaysRes.error, 'Failed to load gateways.'))
    else setGateways(gatewaysRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      [row.rule_name, row.gateway_name, row.failure_code, String(row.max_attempts)]
        .some((value) => String(value ?? '').toLowerCase().includes(term)),
    )
  }, [rows, search])

  const openEdit = (rule) => {
    setEditingRule(rule)
    setEditForm({
      rule_name: rule.rule_name || '',
      gateway_id: rule.gateway_id || '',
      failure_code: rule.failure_code || '',
      retry_schedule: cloneSchedule(rule.retry_schedule),
      is_active: rule.is_active !== false,
    })
  }

  const validateForm = (form) => {
    if (!form.rule_name.trim()) {
      showError('Rule name is required.')
      return false
    }
    const schedule = normalizeSchedule(form.retry_schedule)
    if (!schedule.length) {
      showError('At least one retry schedule row is required.')
      return false
    }
    if (schedule.some((row) => row.delay_hours < 0)) {
      showError('Delay hours must be zero or greater.')
      return false
    }
    return true
  }

  const buildPayload = (form, id = null) => {
    const retry_schedule = normalizeSchedule(form.retry_schedule)
    return {
      id,
      rule_name: form.rule_name.trim(),
      gateway_id: form.gateway_id || null,
      failure_code: form.failure_code.trim() || null,
      retry_schedule,
      max_attempts: retry_schedule.length,
      is_active: form.is_active,
    }
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!validateForm(createForm)) return
    setSaving(true)
    const { error } = await upsertRetryRule(buildPayload(createForm))
    setSaving(false)
    if (error) {
      showError(toError(error, 'Failed to create retry rule.'))
      return
    }
    showSuccess('Retry rule created.')
    setShowCreate(false)
    setCreateForm({ ...EMPTY_FORM, retry_schedule: DEFAULT_RETRY_SCHEDULE.map((row) => ({ ...row })) })
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingRule || !validateForm(editForm)) return
    setSaving(true)
    const { error } = await upsertRetryRule(buildPayload(editForm, editingRule.id))
    setSaving(false)
    if (error) {
      showError(toError(error, 'Failed to update retry rule.'))
      return
    }
    showSuccess('Retry rule updated.')
    setEditingRule(null)
    await loadData()
  }

  const handleToggle = async (rule) => {
    setBusyId(rule.id)
    const { error } = await toggleRetryRule(rule.id, !rule.is_active)
    setBusyId('')
    if (error) showError(toError(error, 'Failed to update retry rule.'))
    else {
      showSuccess(`Rule ${rule.is_active ? 'deactivated' : 'activated'}.`)
      await loadData()
    }
  }

  const handleDelete = (rule) => {
    confirm({
      title: `Delete ${rule.rule_name}?`,
      message: 'This retry rule will be removed permanently.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(rule.id)
        const { error } = await deleteRetryRule(rule.id)
        setBusyId('')
        if (error) showError(toError(error, 'Failed to delete retry rule.'))
        else {
          showSuccess('Retry rule deleted.')
          await loadData()
        }
      },
    })
  }

  const updateScheduleRow = (setForm, index, field, value) => {
    setForm((prev) => {
      const schedule = normalizeSchedule(prev.retry_schedule)
      schedule[index] = { ...schedule[index], [field]: value }
      return { ...prev, retry_schedule: schedule }
    })
  }

  const addScheduleRow = (setForm) => {
    setForm((prev) => {
      const schedule = normalizeSchedule(prev.retry_schedule)
      if (schedule.length >= MAX_SCHEDULE_ROWS) return prev
      schedule.push({ attempt: schedule.length + 1, delay_hours: 24, notify_customer: true })
      return { ...prev, retry_schedule: schedule }
    })
  }

  const removeScheduleRow = (setForm, index) => {
    setForm((prev) => {
      const schedule = normalizeSchedule(prev.retry_schedule)
      if (schedule.length <= 1) return prev
      schedule.splice(index, 1)
      return { ...prev, retry_schedule: schedule.map((row, i) => ({ ...row, attempt: i + 1 })) }
    })
  }

  const renderScheduleEditor = (form, setForm) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Retry Schedule</span>
        <PermissionGate permission="billing.payment_config.edit">
          <button
            type="button"
            disabled={form.retry_schedule.length >= MAX_SCHEDULE_ROWS}
            onClick={() => addScheduleRow(setForm)}
            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Add Row
          </button>
        </PermissionGate>
      </div>
      <div className="space-y-2 rounded border border-gray-700 bg-gray-950/50 p-3">
        {normalizeSchedule(form.retry_schedule).map((row, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[5rem_minmax(8rem,1fr)_auto_auto] sm:items-end">
            <AdminField label="Attempt">
              <input className={`${inputClass} w-16`} readOnly value={row.attempt} />
            </AdminField>
            <AdminField label="Delay (hours)">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={row.delay_hours}
                onChange={(e) => updateScheduleRow(setForm, index, 'delay_hours', e.target.value)}
              />
            </AdminField>
            <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={row.notify_customer}
                onChange={(e) => updateScheduleRow(setForm, index, 'notify_customer', e.target.checked)}
              />
              Notify
            </label>
            <button
              type="button"
              disabled={form.retry_schedule.length <= 1}
              onClick={() => removeScheduleRow(setForm, index)}
              className="rounded border border-red-800 px-2 py-1.5 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500">Max {MAX_SCHEDULE_ROWS} attempts. Max attempts is derived from schedule rows.</p>
    </div>
  )

  const renderFormFields = (form, setForm) => (
    <>
      <AdminField label="Rule Name" required>
        <input
          className={inputClass}
          value={form.rule_name}
          onChange={(e) => setForm((prev) => ({ ...prev, rule_name: e.target.value }))}
          placeholder="Default retry policy"
        />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Gateway">
          <select
            className={inputClass}
            value={form.gateway_id}
            onChange={(e) => setForm((prev) => ({ ...prev, gateway_id: e.target.value }))}
          >
            <option value="">All gateways</option>
            {gateways.map((gateway) => (
              <option key={gateway.id} value={gateway.id}>
                {gateway.name}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Failure Code">
          <input
            className={inputClass}
            value={form.failure_code}
            onChange={(e) => setForm((prev) => ({ ...prev, failure_code: e.target.value }))}
            placeholder="All failures (leave blank)"
          />
        </AdminField>
      </div>
      {renderScheduleEditor(form, setForm)}
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

  if (loading) return <LoadingState message="Loading retry rules..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Payment Retry Rules</h1>
          <p className="text-sm text-gray-500">Configure automated retry schedules for failed payments.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search rules..." />
          <PermissionGate permission="billing.payment_config.edit">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              New Retry Rule
            </button>
          </PermissionGate>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No retry rules found" description="Create a retry rule or adjust your search." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Rule Name</th>
                <th className="px-4 py-3">Gateway</th>
                <th className="px-4 py-3">Failure Code</th>
                <th className="px-4 py-3">Max Attempts</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((rule) => (
                <tr key={rule.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{rule.rule_name}</td>
                  <td className="px-4 py-3">{rule.gateway_name || 'All gateways'}</td>
                  <td className="px-4 py-3">{rule.failure_code || 'All failures'}</td>
                  <td className="px-4 py-3">{rule.max_attempts ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatScheduleSummary(rule.retry_schedule)}</td>
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
                        onClick={() => openEdit(rule)}
                        className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800"
                      >
                        Edit
                      </button>
                      <PermissionGate permission="billing.payment_config.edit">
                        <button
                          type="button"
                          disabled={busyId === rule.id}
                          onClick={() => handleToggle(rule)}
                          className="rounded border border-amber-700 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900/40 disabled:opacity-60"
                        >
                          {rule.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === rule.id}
                          onClick={() => handleDelete(rule)}
                          className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Retry Rule" onClose={() => setShowCreate(false)} size="xl" hideFooter>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingRule)} title={`Edit ${editingRule?.rule_name || 'Retry Rule'}`} onClose={() => setEditingRule(null)} size="xl" hideFooter>
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingRule(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">
              Cancel
            </button>
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
