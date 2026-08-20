import { useEffect, useMemo, useState } from 'react'
import { fetchCobProcesses, updateCobProcess } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AdminModal,
  AdminTable,
  EmptyState,
  inputClass,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const toErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error)
}

export default function CobProcessesPage() {
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [busyId, setBusyId] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({ process_name: '', description: '', parametersJson: '{}' })
  const [saving, setSaving] = useState(false)
  const [editTab, setEditTab] = useState('details')

  const loadData = async () => {
    setLoading(true)
    const { data, error } = await fetchCobProcesses()
    if (error) {
      showError(toErrorMessage(error, 'Failed to load COB processes.'))
      setLoading(false)
      return
    }
    setRows((data || []).sort((a, b) => (a.process_order ?? 0) - (b.process_order ?? 0)))
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const reorder = async (process, direction) => {
    const index = rows.findIndex((row) => row.id === process.id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= rows.length) return
    const other = rows[swapIndex]
    setBusyId(process.id)
    const [resA, resB] = await Promise.all([
      updateCobProcess(process.id, { process_order: other.process_order }),
      updateCobProcess(other.id, { process_order: process.process_order }),
    ])
    setBusyId('')
    if (resA.error || resB.error) {
      showError(toErrorMessage(resA.error || resB.error, 'Failed to reorder processes.'))
      return
    }
    showSuccess('Process order updated.')
    await loadData()
  }

  const toggleActive = async (process) => {
    setBusyId(process.id)
    const { error } = await updateCobProcess(process.id, { is_active: !process.is_active })
    setBusyId('')
    if (error) {
      showError(toErrorMessage(error, 'Failed to update process.'))
      return
    }
    showSuccess(process.is_active ? 'Process deactivated.' : 'Process activated.')
    await loadData()
  }

  const openEdit = (process) => {
    setEditing(process)
    setEditTab('details')
    setEditForm({
      process_name: process.process_name || '',
      description: process.description || '',
      parametersJson: JSON.stringify(process.parameters || {}, null, 2),
    })
  }

  const handleSave = async (event) => {
    event.preventDefault()
    if (!editing) return
    let parameters
    try {
      parameters = JSON.parse(editForm.parametersJson || '{}')
    } catch {
      showError('Parameters must be valid JSON.')
      return
    }
    setSaving(true)
    const { error } = await updateCobProcess(editing.id, {
      process_name: editForm.process_name.trim(),
      description: editForm.description.trim() || null,
      parameters,
    })
    setSaving(false)
    if (error) {
      showError(toErrorMessage(error, 'Failed to save process.'))
      return
    }
    showSuccess('Process updated.')
    setEditing(null)
    await loadData()
  }

  const columns = useMemo(() => [
    {
      key: 'process_order',
      label: 'Order',
      render: (row) => (
        <div className="flex items-center gap-1">
          <span className="w-6 text-center">{row.process_order}</span>
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={() => reorder(row, 'up')}
            className="rounded border border-gray-700 px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-50"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={() => reorder(row, 'down')}
            className="rounded border border-gray-700 px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-50"
          >
            ↓
          </button>
        </div>
      ),
    },
    {
      key: 'process_name',
      label: 'Name',
      render: (row) => (
        <div>
          <div className="font-medium">{row.process_name}</div>
          <div className="text-xs text-gray-500">{row.process_key}</div>
        </div>
      ),
    },
    { key: 'target_system', label: 'Target' },
    {
      key: 'is_active',
      label: 'Status',
      render: (row) => (
        <AdminBadge
          label={row.is_active ? 'active' : 'inactive'}
          variant={row.is_active ? 'active' : 'inactive'}
        />
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      sortable: false,
      render: (row) => (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busyId === row.id}
            onClick={() => toggleActive(row)}
            className="rounded border border-gray-600 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
          >
            {row.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <AdminIconActionButton variant="edit" label="Edit" onClick={() => openEdit(row)} />
        </div>
      ),
    },
  ], [busyId, rows])

  if (loading) return <LoadingState message="Loading COB processes..." />

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">COB Processes</h1>
        <p className="text-sm text-gray-500">Configure the close-of-business pipeline order, activation, and parameters.</p>
      </div>

      {!rows.length ? (
        <EmptyState title="No COB processes configured" description="Seed COB processes in the database to manage them here." />
      ) : (
        <AdminTable columns={columns} rows={rows} pageSize={20} />
      )}

      <AdminModal
        open={Boolean(editing)}
        title={`Edit ${editing?.process_name || 'Process'}`}
        onClose={() => setEditing(null)}
      >
        <div className="mb-3">
          <DetailAuditTabList activeTab={editTab} onChange={setEditTab} />
        </div>

        {editTab === 'audit' && editing && (
          <AuditDetailsPanel description="Who created this process, and how it is classified.">
            <AuditCard title="Identity" description="How this process is labelled.">
              <AuditField label="Process name" value={editing.process_name} />
              <AuditField label="Process key" value={editing.process_key} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this process sits.">
              <AuditField label="Target system" value={editing.target_system} />
              <AuditField label="Active" value={editing.is_active ? 'Yes' : 'No'} />
            </AuditCard>
            <AuditCard title="Record history" description="When this process was created.">
              <AuditField label="Created by" value={editing.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={editing.created_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {editTab === 'details' && (
        <AdminForm onSubmit={handleSave} className="mt-2 space-y-3">
          <AdminField label="Process Name" required>
            <input
              className={inputClass}
              value={editForm.process_name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, process_name: e.target.value }))}
            />
          </AdminField>
          <AdminField label="Description">
            <textarea
              className={`${inputClass} min-h-[80px]`}
              value={editForm.description}
              onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
            />
          </AdminField>
          <AdminField label="Parameters (JSON)">
            <textarea
              className={`${inputClass} min-h-[120px] font-mono text-xs`}
              value={editForm.parametersJson}
              onChange={(e) => setEditForm((prev) => ({ ...prev, parametersJson: e.target.value }))}
            />
          </AdminField>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="rounded px-3 py-1.5 text-sm text-gray-400">Cancel</button>
            <button type="submit" disabled={saving} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-60">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </AdminForm>
        )}
      </AdminModal>
    </div>
  )
}
