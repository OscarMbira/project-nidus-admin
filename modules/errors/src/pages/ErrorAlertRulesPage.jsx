import { useEffect, useMemo, useState } from 'react'
import {
  createErrorAlertRule,
  deleteErrorAlertRule,
  fetchErrorAlertRules,
  formatDate,
  updateErrorAlertRule,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const ERROR_TYPES = ['', 'js_error', 'api_error', 'slow_load', 'rls_error', 'route_error', 'render_error']
const SYSTEMS = ['', 'platform', 'simulator']
const PRIORITIES = ['low', 'medium', 'high', 'critical']
const ROLES = ['support_admin', 'system_admin', 'content_admin', 'super_admin']
const DEFAULT_FORM = {
  rule_name: '',
  error_type: '',
  page_route_pattern: '',
  system: '',
  threshold_users: 3,
  threshold_occurrences: 10,
  time_window_minutes: 60,
  auto_ticket_priority: 'high',
  notify_role: 'support_admin',
  is_active: true,
}

export default function ErrorAlertRulesPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal: confirmModal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [busy, setBusy] = useState('')
  const [ruleTab, setRuleTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchErrorAlertRules()
    if (error) {
      showError(error.message || String(error))
      setLoading(false)
      return
    }
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => (
      String(row.rule_name || '').toLowerCase().includes(term)
      || String(row.error_type || '').toLowerCase().includes(term)
      || String(row.page_route_pattern || '').toLowerCase().includes(term)
      || String(row.system || '').toLowerCase().includes(term)
    ))
  }, [rows, search])

  const openCreate = () => {
    setEditingRule(null)
    setForm(DEFAULT_FORM)
    setRuleTab('details')
    setShowCreate(true)
  }

  const openEdit = (rule) => {
    setShowCreate(false)
    setEditingRule(rule)
    setRuleTab('details')
    setForm({
      rule_name: rule.rule_name || '',
      error_type: rule.error_type || '',
      page_route_pattern: rule.page_route_pattern || '',
      system: rule.system || '',
      threshold_users: rule.threshold_users || 1,
      threshold_occurrences: rule.threshold_occurrences || 1,
      time_window_minutes: rule.time_window_minutes || 1,
      auto_ticket_priority: rule.auto_ticket_priority || 'high',
      notify_role: rule.notify_role || 'support_admin',
      is_active: Boolean(rule.is_active),
    })
  }

  const closeModal = () => {
    setShowCreate(false)
    setEditingRule(null)
    setForm(DEFAULT_FORM)
  }

  const payloadFromForm = {
    ...form,
    threshold_users: Number(form.threshold_users),
    threshold_occurrences: Number(form.threshold_occurrences),
    time_window_minutes: Number(form.time_window_minutes),
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!form.rule_name.trim()) {
      showError('Rule name is required.')
      return
    }
    setBusy('save')
    const result = editingRule
      ? await updateErrorAlertRule(editingRule.id, payloadFromForm)
      : await createErrorAlertRule(payloadFromForm)
    setBusy('')

    if (result.error) {
      showError(result.error.message || String(result.error))
      return
    }
    showSuccess(editingRule ? 'Alert rule updated.' : 'Alert rule created.')
    closeModal()
    await loadData()
  }

  const handleToggleActive = async (rule) => {
    setBusy(`toggle-${rule.id}`)
    const { error } = await updateErrorAlertRule(rule.id, { is_active: !rule.is_active })
    setBusy('')
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(`Rule ${!rule.is_active ? 'enabled' : 'disabled'}.`)
    await loadData()
  }

  const handleDelete = (rule) => {
    confirm({
      title: 'Delete alert rule',
      message: `Delete ${rule.rule_name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        const { error } = await deleteErrorAlertRule(rule.id)
        if (error) {
          showError(error.message || String(error))
          return
        }
        showSuccess('Alert rule deleted.')
        await loadData()
      },
    })
  }

  if (loading) return <LoadingState message="Loading alert rules..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Error Alert Rules</h1>
          <p className="text-sm text-gray-500">Create and manage automatic alerting policies for aggregated errors.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search rules..." />
          <button type="button" onClick={openCreate} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Rule
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No alert rules found" description="Create a new rule to begin automated alerting." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Threshold</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((rule) => (
                <tr key={rule.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-100">{rule.rule_name}</p>
                    <p className="text-xs text-gray-500">{rule.error_type || 'all error types'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-300">
                    <p>System: {rule.system || 'all'}</p>
                    <p>Route: {rule.page_route_pattern || 'all routes'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-300">
                    <p>{rule.threshold_users} users / {rule.threshold_occurrences} occurrences</p>
                    <p>{rule.time_window_minutes} min window</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${rule.is_active ? 'border-green-700 bg-green-900/30 text-green-300' : 'border-gray-600 bg-gray-800 text-gray-300'}`}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{formatDate(rule.updated_at || rule.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy === `toggle-${rule.id}`}
                        onClick={() => handleToggleActive(rule)}
                        className="rounded border border-blue-700 bg-blue-900/30 px-2.5 py-1 text-xs text-blue-200 hover:bg-blue-900/50 disabled:opacity-60"
                      >
                        {rule.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(rule)} />
                      <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(rule)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate || Boolean(editingRule)} title={editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'} onClose={closeModal}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={ruleTab} onChange={setRuleTab} />
        </div>

        {ruleTab === 'audit' && !editingRule && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this rule is saved.</p>
        )}

        {ruleTab === 'audit' && editingRule && (
          <AuditDetailsPanel description="How this alert rule is classified and when it last changed.">
            <AuditCard title="Identity" description="How this rule is labelled.">
              <AuditField label="Rule name" value={editingRule.rule_name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this rule sits.">
              <AuditField label="Error type" value={editingRule.error_type} />
              <AuditField label="System" value={editingRule.system} />
              <AuditField label="Active" value={editingRule.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this rule was created and last changed.">
              <AuditTimestampPair dateLabel="Created at" value={editingRule.created_at} />
              <AuditTimestampPair dateLabel="Last updated" value={editingRule.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {ruleTab === 'details' && (
        <AdminForm onSubmit={handleSave} className="mt-2">
          <AdminField label="Rule Name" required>
            <input value={form.rule_name} onChange={(e) => setForm((prev) => ({ ...prev, rule_name: e.target.value }))} className={inputClass} />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Error Type">
              <select value={form.error_type} onChange={(e) => setForm((prev) => ({ ...prev, error_type: e.target.value }))} className={inputClass}>
                {ERROR_TYPES.map((value) => <option key={value || 'any'} value={value}>{value || 'Any'}</option>)}
              </select>
            </AdminField>
            <AdminField label="System">
              <select value={form.system} onChange={(e) => setForm((prev) => ({ ...prev, system: e.target.value }))} className={inputClass}>
                {SYSTEMS.map((value) => <option key={value || 'all'} value={value}>{value || 'All systems'}</option>)}
              </select>
            </AdminField>
          </div>
          <AdminField label="Route Pattern">
            <input value={form.page_route_pattern} onChange={(e) => setForm((prev) => ({ ...prev, page_route_pattern: e.target.value }))} className={inputClass} />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-3">
            <AdminField label="Threshold Users">
              <input type="number" min="1" value={form.threshold_users} onChange={(e) => setForm((prev) => ({ ...prev, threshold_users: e.target.value }))} className={inputClass} />
            </AdminField>
            <AdminField label="Threshold Occurrences">
              <input type="number" min="1" value={form.threshold_occurrences} onChange={(e) => setForm((prev) => ({ ...prev, threshold_occurrences: e.target.value }))} className={inputClass} />
            </AdminField>
            <AdminField label="Window Minutes">
              <input type="number" min="1" value={form.time_window_minutes} onChange={(e) => setForm((prev) => ({ ...prev, time_window_minutes: e.target.value }))} className={inputClass} />
            </AdminField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Auto Ticket Priority">
              <select value={form.auto_ticket_priority} onChange={(e) => setForm((prev) => ({ ...prev, auto_ticket_priority: e.target.value }))} className={inputClass}>
                {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </AdminField>
            <AdminField label="Notify Role">
              <select value={form.notify_role} onChange={(e) => setForm((prev) => ({ ...prev, notify_role: e.target.value }))} className={inputClass}>
                {ROLES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </AdminField>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} className="h-4 w-4 accent-blue-500" />
            Rule is active
          </label>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} className="rounded px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            <button type="submit" disabled={busy === 'save'} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-600 disabled:opacity-60">
              {busy === 'save' ? 'Saving...' : (editingRule ? 'Save Changes' : 'Create Rule')}
            </button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {confirmModal}
    </div>
  )
}
