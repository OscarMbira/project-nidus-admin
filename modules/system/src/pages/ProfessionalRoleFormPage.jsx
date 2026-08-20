import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createProfessionalRole,
  fetchProfessionalRoleById,
  updateProfessionalRole,
  useUnsavedChangesGuard,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  inputClass,
  useToast,
} from '@nidus-admin/ui'

const EMPTY_FORM = { role_code: '', role_label: '', description: '', display_order: 0, is_active: true }

function roleToForm(role) {
  return {
    role_code: role.role_code || '',
    role_label: role.role_label || '',
    description: role.description || '',
    display_order: role.display_order ?? 0,
    is_active: role.is_active !== false,
  }
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function ProfessionalRoleFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roleId = searchParams.get('id')
  const isEdit = Boolean(roleId)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(roleId)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [baselineForm, setBaselineForm] = useState(EMPTY_FORM)
  const [loadError, setLoadError] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!isEdit) { setLoading(false); return }
      setLoading(true)
      setLoadError(null)
      const { data, error } = await fetchProfessionalRoleById(roleId)
      if (!active) return
      if (error || !data) {
        setLoadError(error?.message || String(error) || 'Professional role not found.')
        setLoading(false)
        return
      }
      const nextForm = roleToForm(data)
      setRole(data)
      setForm(nextForm)
      setBaselineForm(nextForm)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [isEdit, roleId])

  const isDirty = useMemo(() => !isViewOnly && !formsEqual(form, baselineForm), [form, baselineForm, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved professional role changes.')
  const goBack = () => requestNavigation('/system/professional-roles')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.role_code.trim() || !form.role_label.trim()) {
      showError('Role code and label are required.')
      return
    }
    setSaving(true)
    const { error } = isEdit ? await updateProfessionalRole(roleId, form) : await createProfessionalRole(form)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(isEdit ? 'Professional role updated.' : 'Professional role created.')
    navigate('/system/professional-roles')
  }

  if (loading) return <LoadingState message={isEdit ? 'Loading professional role...' : 'Loading form...'} />

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load professional role" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to professional roles
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to professional roles
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Professional Role' : isEdit ? 'Edit Professional Role' : 'Create Professional Role'}
          </h1>
          {isEdit && role && <p className="text-xs text-gray-500 dark:text-gray-500">{role.role_code}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && role && (
            <AdminBadge label={role.is_active ? 'active' : 'inactive'} variant={role.is_active ? 'active' : 'inactive'} />
          )}
          {isViewOnly ? (
            <PermissionGate permission="system.industries.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/professional-role-form?id=${roleId}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="professional-role-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create role')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !role && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this role is saved.</p>
      )}
      {detailTab === 'audit' && role && (
        <AuditDetailsPanel description="Who created or changed this professional role, and how it is classified.">
          <AuditCard title="Identity" description="How this role is labelled.">
            <AuditField label="Role code" value={role.role_code} />
            <AuditField label="Role label" value={role.role_label} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this role sits.">
            <AuditField label="Display order" value={role.display_order} />
            <AuditField label="Active" value={role.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this role was created and last changed.">
            <AuditField label="Created by" value={role.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={role.created_at} />
            <AuditField label="Updated by" value={role.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={role.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
        <AdminForm id="professional-role-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit} className="space-y-0">
          <fieldset disabled={isViewOnly} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4 flex flex-col gap-3 disabled:opacity-95">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <AdminField label="Role code" required>
                <input
                  className={inputClass}
                  value={form.role_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, role_code: e.target.value }))}
                  placeholder="project_manager"
                />
              </AdminField>
              <AdminField label="Role label" required>
                <input
                  className={inputClass}
                  value={form.role_label}
                  onChange={(e) => setForm((prev) => ({ ...prev, role_label: e.target.value }))}
                  placeholder="Project Manager"
                />
              </AdminField>
            </div>
            <AdminField label="Description">
              <textarea
                className={inputClass}
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </AdminField>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <AdminField label="Display order">
                <input
                  type="number"
                  className={inputClass}
                  value={form.display_order}
                  onChange={(e) => setForm((prev) => ({ ...prev, display_order: Number(e.target.value) }))}
                />
              </AdminField>
              <AdminField label="Active">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  Offered at registration / invitation acceptance
                </label>
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
