import { useEffect, useMemo, useState } from 'react'
import {
  createReportDefinition,
  deleteReportDefinition,
  fetchReportDefinitions,
  updateReportDefinition,
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

const REPORT_TYPES = [
  'custom', 'user_growth', 'churn', 'retention', 'revenue',
  'system_usage', 'support_volume', 'error_trends',
]
const CHART_TYPES = ['table', 'bar', 'line', 'pie']
const TARGET_SYSTEMS = ['all', 'platform', 'simulator']

const EMPTY_FORM = {
  report_name: '',
  report_key: '',
  description: '',
  report_type: 'custom',
  query_config: '{}',
  chart_type: 'table',
  target_system: 'all',
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const parseQueryConfig = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed)
}

export default function ReportBuilderPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingReport, setEditingReport] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchReportDefinitions()
    if (error) {
      showError(toErrorMessage(error, 'Failed to load report definitions.'))
      setLoading(false)
      return
    }
    setRows((data || []).filter((row) => !row.is_system_report))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.report_name, row.report_key, row.description, row.report_type]
      .some((value) => String(value ?? '').toLowerCase().includes(term)))
  }, [rows, search])

  const openEdit = (report) => {
    setEditingReport(report)
    setEditForm({
      report_name: report.report_name || '',
      report_key: report.report_key || '',
      description: report.description || '',
      report_type: report.report_type || 'custom',
      query_config: JSON.stringify(report.query_config || {}, null, 2),
      chart_type: report.chart_type || 'table',
      target_system: report.target_system || 'all',
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    if (!createForm.report_name.trim() || !createForm.report_key.trim()) {
      showError('Report name and key are required.')
      return
    }
    let queryConfig
    try {
      queryConfig = parseQueryConfig(createForm.query_config)
    } catch {
      showError('Query config must be valid JSON.')
      return
    }
    setSaving(true)
    const { error } = await createReportDefinition({
      report_name: createForm.report_name.trim(),
      report_key: createForm.report_key.trim().toLowerCase(),
      description: createForm.description.trim() || null,
      report_type: createForm.report_type,
      query_config: queryConfig,
      chart_type: createForm.chart_type,
      target_system: createForm.target_system,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create report.'))
      return
    }
    showSuccess('Custom report created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingReport) return
    let queryConfig
    try {
      queryConfig = parseQueryConfig(editForm.query_config)
    } catch {
      showError('Query config must be valid JSON.')
      return
    }
    setSaving(true)
    const { error } = await updateReportDefinition(editingReport.id, {
      report_name: editForm.report_name.trim(),
      description: editForm.description.trim() || null,
      report_type: editForm.report_type,
      query_config: queryConfig,
      chart_type: editForm.chart_type,
      target_system: editForm.target_system,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to update report.'))
      return
    }
    showSuccess('Report updated.')
    setEditingReport(null)
    await loadData()
  }

  const handleDelete = (report) => {
    confirm({
      title: `Delete ${report.report_name}?`,
      message: 'Scheduled deliveries linked to this report will also be removed.',
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(report.id)
        const { error } = await deleteReportDefinition(report.id)
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, 'Failed to delete report.'))
          return
        }
        showSuccess('Report deleted.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminField label="Report Name" required>
          <input className={inputClass} value={form.report_name} onChange={(e) => setForm((prev) => ({ ...prev, report_name: e.target.value }))} />
        </AdminField>
        <AdminField label="Report Key" required>
          <input
            className={inputClass}
            value={form.report_key}
            readOnly={isEdit}
            onChange={(e) => setForm((prev) => ({ ...prev, report_key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
            placeholder="monthly_revenue_custom"
          />
        </AdminField>
      </div>
      <AdminField label="Description">
        <input className={inputClass} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
      </AdminField>
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField label="Report Type">
          <select className={inputClass} value={form.report_type} onChange={(e) => setForm((prev) => ({ ...prev, report_type: e.target.value }))}>
            {REPORT_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, ' ')}</option>)}
          </select>
        </AdminField>
        <AdminField label="Chart Type">
          <select className={inputClass} value={form.chart_type} onChange={(e) => setForm((prev) => ({ ...prev, chart_type: e.target.value }))}>
            {CHART_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </AdminField>
        <AdminField label="Target System">
          <select className={inputClass} value={form.target_system} onChange={(e) => setForm((prev) => ({ ...prev, target_system: e.target.value }))}>
            {TARGET_SYSTEMS.map((system) => <option key={system} value={system}>{system}</option>)}
          </select>
        </AdminField>
      </div>
      <AdminField label="Query Config (JSON)">
        <textarea
          rows={16}
          className={`${inputClass} min-h-[40vh] font-mono text-xs`}
          value={form.query_config}
          onChange={(e) => setForm((prev) => ({ ...prev, query_config: e.target.value }))}
        />
      </AdminField>
    </>
  )

  const renderFormActions = (onCancel, submitLabel, submittingLabel) => (
    <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
      <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
      <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
        {saving ? submittingLabel : submitLabel}
      </button>
    </div>
  )

  if (loading) return <LoadingState message="Loading report builder..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Report Builder</h1>
          <p className="text-sm text-gray-500">Create and edit custom report definitions with query configuration.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search custom reports..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Report
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No custom reports" description="Create a custom report definition to get started." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Chart</th>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((report) => (
                <tr key={report.id} className="border-t border-gray-800">
                  <td className="px-4 py-3 font-medium">{report.report_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{report.report_key}</td>
                  <td className="px-4 py-3">{report.report_type?.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{report.chart_type}</td>
                  <td className="px-4 py-3">
                    <AdminBadge label={report.target_system || 'all'} variant="system_admin" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEdit(report)} className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800">Edit</button>
                      <button type="button" disabled={busyId === report.id} onClick={() => handleDelete(report)} className="rounded border border-red-700 bg-red-900/30 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-60">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Custom Report" size="full" hideFooter onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="flex h-full min-h-0 flex-col gap-4">
          {renderFormFields(createForm, setCreateForm)}
          {renderFormActions(() => setShowCreate(false), 'Create', 'Creating...')}
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingReport)} title={`Edit ${editingReport?.report_name || 'Report'}`} size="full" hideFooter onClose={() => setEditingReport(null)}>
        <AdminForm onSubmit={handleEditSave} className="flex h-full min-h-0 flex-col gap-4">
          {renderFormFields(editForm, setEditForm, true)}
          {renderFormActions(() => setEditingReport(null), 'Save', 'Saving...')}
        </AdminForm>
      </AdminModal>

      {modal}
    </div>
  )
}
