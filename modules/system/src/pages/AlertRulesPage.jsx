import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  deleteAlertRule,
  fetchAlertRules,
  fetchNotificationTemplates,
  navId,
  toggleAlertRule,
  useDisplayIdMap,
} from '@nidus-admin/shared'
import {
  AdminActionButton,
  AdminBadge,
  AdminIconActionButton,
  AdminRowActions,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

export default function AlertRulesPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [templates, setTemplates] = useState([])
  const [search, setSearch] = useState('')
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

  const rowIds = useMemo(() => rows.map((row) => row.id).filter(Boolean), [rows])
  const { displayIdMap } = useDisplayIdMap('admin.alert_rules', rowIds)

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
            onClick={() => navigate('/system/alert-rule-form')}
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
                <th className="px-4 py-3">Actions</th>
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
                      <AdminRowActions>
                        <AdminIconActionButton variant="view" label="View" onClick={() => navigate(`/system/alert-rule-form?id=${navId(displayIdMap, rule.id)}&view=1`)} />
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/alert-rule-form?id=${navId(displayIdMap, rule.id)}`)} />
                        <AdminActionButton
                          variant="default"
                          disabled={isBusy}
                          onClick={() => handleToggle(rule.id)}
                        >
                          {isBusy ? 'Working...' : 'Toggle'}
                        </AdminActionButton>
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(rule)} disabled={isBusy} />
                      </AdminRowActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal}
    </div>
  )
}
