import { useEffect, useMemo, useState } from 'react'
import {
  createScheduledReport,
  deleteScheduledReport,
  fetchReportDefinitions,
  fetchScheduledReports,
  formatDate,
  updateScheduledReport,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  EmptyState,
  inputClass,
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

const SCHEDULE_TYPES = ['daily', 'weekly', 'monthly']
const FORMATS = ['csv', 'pdf', 'json']

const EMPTY_FORM = {
  report_id: '',
  schedule_type: 'weekly',
  schedule_config: '{}',
  recipients: '',
  format: 'csv',
  is_active: true,
}

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

const parseScheduleConfig = (value) => {
  const trimmed = value.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed)
}

const recipientsToArray = (value) => value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)

export default function ScheduledReportsPage() {
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [reports, setReports] = useState([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [editTab, setEditTab] = useState('details')

  const reportMap = useMemo(() => {
    const map = new Map()
    reports.forEach((report) => map.set(report.id, report))
    return map
  }, [reports])

  const loadData = async () => {
    setLoading(true)
    const [schedulesRes, reportsRes] = await Promise.all([
      fetchScheduledReports(),
      fetchReportDefinitions(),
    ])
    if (schedulesRes.error) {
      showError(toErrorMessage(schedulesRes.error, 'Failed to load scheduled reports.'))
      setLoading(false)
      return
    }
    if (reportsRes.error) {
      showError(toErrorMessage(reportsRes.error, 'Failed to load report definitions.'))
      setLoading(false)
      return
    }
    setRows(schedulesRes.data || [])
    setReports(reportsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const report = reportMap.get(row.report_id)
      return [report?.report_name, report?.report_key, row.schedule_type, row.format, ...(row.recipients || [])]
        .some((value) => String(value ?? '').toLowerCase().includes(term))
    })
  }, [rows, search, reportMap])

  const openEdit = (schedule) => {
    setEditingSchedule(schedule)
    setEditTab('details')
    setEditForm({
      report_id: schedule.report_id || '',
      schedule_type: schedule.schedule_type || 'weekly',
      schedule_config: JSON.stringify(schedule.schedule_config || {}, null, 2),
      recipients: (schedule.recipients || []).join(', '),
      format: schedule.format || 'csv',
      is_active: schedule.is_active !== false,
    })
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    const recipients = recipientsToArray(createForm.recipients)
    if (!createForm.report_id || !recipients.length) {
      showError('Report and at least one recipient are required.')
      return
    }
    let scheduleConfig
    try {
      scheduleConfig = parseScheduleConfig(createForm.schedule_config)
    } catch {
      showError('Schedule config must be valid JSON.')
      return
    }
    setSaving(true)
    const { error } = await createScheduledReport({
      report_id: createForm.report_id,
      schedule_type: createForm.schedule_type,
      schedule_config: scheduleConfig,
      recipients,
      format: createForm.format,
      is_active: createForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to create schedule.'))
      return
    }
    showSuccess('Scheduled report created.')
    setShowCreate(false)
    setCreateForm(EMPTY_FORM)
    await loadData()
  }

  const handleEditSave = async (event) => {
    event.preventDefault()
    if (!editingSchedule) return
    const recipients = recipientsToArray(editForm.recipients)
    if (!recipients.length) {
      showError('At least one recipient is required.')
      return
    }
    let scheduleConfig
    try {
      scheduleConfig = parseScheduleConfig(editForm.schedule_config)
    } catch {
      showError('Schedule config must be valid JSON.')
      return
    }
    setSaving(true)
    const { error } = await updateScheduledReport(editingSchedule.id, {
      schedule_type: editForm.schedule_type,
      schedule_config: scheduleConfig,
      recipients,
      format: editForm.format,
      is_active: editForm.is_active,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to update schedule.'))
      return
    }
    showSuccess('Schedule updated.')
    setEditingSchedule(null)
    await loadData()
  }

  const handleDelete = (schedule) => {
    const reportName = reportMap.get(schedule.report_id)?.report_name || 'this report'
    confirm({
      title: 'Delete scheduled report?',
      message: `Remove the ${schedule.schedule_type} schedule for ${reportName}.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setBusyId(schedule.id)
        const { error } = await deleteScheduledReport(schedule.id)
        setBusyId('')
        if (error) {
          showError(toErrorMessage(error, 'Failed to delete schedule.'))
          return
        }
        showSuccess('Schedule deleted.')
        await loadData()
      },
    })
  }

  const renderFormFields = (form, setForm, isEdit = false) => (
    <>
      {!isEdit && (
        <AdminField label="Report" required>
          <select className={inputClass} value={form.report_id} onChange={(e) => setForm((prev) => ({ ...prev, report_id: e.target.value }))}>
            <option value="">Select report...</option>
            {reports.map((report) => (
              <option key={report.id} value={report.id}>{report.report_name}</option>
            ))}
          </select>
        </AdminField>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="Schedule Type" required>
          <select className={inputClass} value={form.schedule_type} onChange={(e) => setForm((prev) => ({ ...prev, schedule_type: e.target.value }))}>
            {SCHEDULE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </AdminField>
        <AdminField label="Format">
          <select className={inputClass} value={form.format} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))}>
            {FORMATS.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select>
        </AdminField>
      </div>
      <AdminField label="Recipients" required>
        <textarea
          rows={3}
          className={inputClass}
          value={form.recipients}
          onChange={(e) => setForm((prev) => ({ ...prev, recipients: e.target.value }))}
          placeholder="admin@example.com, finance@example.com"
        />
      </AdminField>
      <AdminField label="Schedule Config (JSON)">
        <textarea
          rows={5}
          className={`${inputClass} font-mono text-xs`}
          value={form.schedule_config}
          onChange={(e) => setForm((prev) => ({ ...prev, schedule_config: e.target.value }))}
        />
      </AdminField>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
        Active
      </label>
    </>
  )

  if (loading) return <LoadingState message="Loading scheduled reports..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Scheduled Reports</h1>
          <p className="text-sm text-gray-500">Configure recurring delivery for report definitions.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <SearchBar value={search} onChange={setSearch} placeholder="Search report, recipients..." />
          <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
            New Schedule
          </button>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState title="No scheduled reports" description="Create a schedule to deliver reports automatically." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
          <table className="min-w-full text-sm text-gray-200">
            <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Report</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Recipients</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Run</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((schedule) => {
                const report = reportMap.get(schedule.report_id)
                return (
                  <tr key={schedule.id} className="border-t border-gray-800">
                    <td className="px-4 py-3 font-medium">{report?.report_name || schedule.report_id}</td>
                    <td className="px-4 py-3">{schedule.schedule_type}</td>
                    <td className="px-4 py-3">{schedule.format?.toUpperCase()}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{(schedule.recipients || []).join(', ')}</td>
                    <td className="px-4 py-3">
                      <AdminBadge label={schedule.is_active ? 'active' : 'inactive'} variant={schedule.is_active ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{formatDate(schedule.last_run_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(schedule)} />
                        <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(schedule)} disabled={busyId === schedule.id} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <AdminModal open={showCreate} title="Create Scheduled Report" onClose={() => setShowCreate(false)}>
        <AdminForm onSubmit={handleCreate} className="mt-2 space-y-3">
          {renderFormFields(createForm, setCreateForm)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Creating...' : 'Create'}</button>
          </div>
        </AdminForm>
      </AdminModal>

      <AdminModal open={Boolean(editingSchedule)} title="Edit Scheduled Report" onClose={() => setEditingSchedule(null)}>
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editingSchedule && (
          <AuditDetailsPanel description="Who created or changed this schedule, and how it is classified.">
            <AuditCard title="Identity" description="How this schedule is labelled.">
              <AuditField label="Report" value={reportMap.get(editingSchedule.report_id)?.report_name || editingSchedule.report_id} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this schedule sits.">
              <AuditField label="Schedule type" value={editingSchedule.schedule_type} />
              <AuditField label="Format" value={editingSchedule.format} />
              <AuditField label="Active" value={editingSchedule.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this schedule was created and last changed.">
              <AuditField label="Created by" value={editingSchedule.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editingSchedule.created_at} />
              <AuditField label="Updated by" value={editingSchedule.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={editingSchedule.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleEditSave} className="mt-2 space-y-3">
          {renderFormFields(editForm, setEditForm, true)}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditingSchedule(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </AdminForm>
        )}
      </AdminModal>

      {modal}
    </div>
  )
}
