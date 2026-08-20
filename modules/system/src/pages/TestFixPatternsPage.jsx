import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchFixPatterns, toggleFixPatternAutoApply, createFixPattern } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminModal,
  AdminTable,
  LoadingState,
  inputClass,
  useToast,
  DetailAuditTabList,
} from '@nidus-admin/ui'

const EMPTY = {
  patternName: '',
  errorRegex: '',
  errorCategory: 'unknown',
  fixStrategy: 'flag_for_review',
  confidence: 'medium',
  autoApply: false,
}

export default function TestFixPatternsPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [createTab, setCreateTab] = useState('details')

  const load = async () => {
    setLoading(true)
    const { data, error } = await fetchFixPatterns()
    if (error) showError(error)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (row) => {
    const { error } = await toggleFixPatternAutoApply(row.id, !row.auto_apply)
    if (error) showError(error)
    else {
      showSuccess('Pattern updated')
      load()
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setSaving(true)
    const { error } = await createFixPattern(form)
    setSaving(false)
    if (error) showError(error)
    else {
      showSuccess('Pattern created')
      setShowCreate(false)
      setForm(EMPTY)
      load()
    }
  }

  if (loading) return <LoadingState message="Loading fix patterns..." />

  const columns = [
    { key: 'pattern_name', label: 'Pattern' },
    { key: 'error_category', label: 'Category' },
    { key: 'fix_strategy', label: 'Strategy' },
    { key: 'confidence', label: 'Confidence', render: (row) => <AdminBadge label={row.confidence} variant={row.confidence} /> },
    { key: 'auto_apply', label: 'Auto-Apply', render: (row) => (
      <button type="button" onClick={() => handleToggle(row)} className="text-blue-400 hover:underline">
        {row.auto_apply ? 'Yes' : 'No'}
      </button>
    ) },
    { key: 'success_count', label: 'Success' },
    { key: 'failure_count', label: 'Failed' },
  ]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <button type="button" onClick={() => navigate('/system/test-dashboard')} className="text-sm text-blue-400 hover:underline">
        ← Back to Dashboard
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Fix Patterns</h1>
          <p className="text-sm text-gray-500">Configure auto-fix error pattern mappings</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500">
          New Pattern
        </button>
      </div>
      <AdminTable columns={columns} rows={rows} />

      <AdminModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Fix Pattern">
        <div className="mb-3">
          <DetailAuditTabList activeTab={createTab} onChange={setCreateTab} />
        </div>

        {createTab === 'audit' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this pattern is saved.</p>
        )}

        {createTab === 'details' && (
        <AdminForm onSubmit={handleCreate}>
          <AdminField label="Pattern Name" required>
            <input className={inputClass} value={form.patternName} onChange={(e) => setForm({ ...form, patternName: e.target.value })} />
          </AdminField>
          <AdminField label="Error Regex" required>
            <input className={inputClass} value={form.errorRegex} onChange={(e) => setForm({ ...form, errorRegex: e.target.value })} />
          </AdminField>
          <AdminField label="Error Category">
            <select className={inputClass} value={form.errorCategory} onChange={(e) => setForm({ ...form, errorCategory: e.target.value })}>
              {['missing_data', 'permission_denied', 'stale_state', 'validation_error', 'element_not_found', 'db_constraint', 'timeout', 'session_expired', 'unknown'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Fix Strategy">
            <input className={inputClass} value={form.fixStrategy} onChange={(e) => setForm({ ...form, fixStrategy: e.target.value })} />
          </AdminField>
          <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-50">
            {saving ? 'Saving...' : 'Create'}
          </button>
        </AdminForm>
        )}
      </AdminModal>
    </div>
  )
}
