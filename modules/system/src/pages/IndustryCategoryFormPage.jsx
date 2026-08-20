import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createIndustryCategory,
  fetchIndustryCategoryById,
  updateIndustryCategory,
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

const EMPTY_FORM = { name: '', is_active: true }

function categoryToForm(category) {
  return { name: category.name || '', is_active: category.is_active !== false }
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function IndustryCategoryFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const categoryId = searchParams.get('id')
  const isEdit = Boolean(categoryId)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(categoryId)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState(null)
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
      const { data, error } = await fetchIndustryCategoryById(categoryId)
      if (!active) return
      if (error || !data) {
        setLoadError(error?.message || String(error) || 'Industry category not found.')
        setLoading(false)
        return
      }
      const nextForm = categoryToForm(data)
      setCategory(data)
      setForm(nextForm)
      setBaselineForm(nextForm)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [isEdit, categoryId])

  const isDirty = useMemo(() => !isViewOnly && !formsEqual(form, baselineForm), [form, baselineForm, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved industry category changes.')
  const goBack = () => requestNavigation('/system/industry-categories')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      showError('Name is required.')
      return
    }
    setSaving(true)
    const { error } = isEdit ? await updateIndustryCategory(categoryId, form) : await createIndustryCategory(form)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(isEdit ? 'Industry category updated.' : 'Industry category created.')
    navigate('/system/industry-categories')
  }

  if (loading) return <LoadingState message={isEdit ? 'Loading industry category...' : 'Loading form...'} />

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load industry category" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to industry categories
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to industry categories
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Industry Category' : isEdit ? 'Edit Industry Category' : 'Create Industry Category'}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && category && (
            <AdminBadge label={category.is_active ? 'active' : 'inactive'} variant={category.is_active ? 'active' : 'inactive'} />
          )}
          {isViewOnly ? (
            <PermissionGate permission="system.industries.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/industry-category-form?id=${categoryId}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="industry-category-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create category')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !category && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this category is saved.</p>
      )}
      {detailTab === 'audit' && category && (
        <AuditDetailsPanel description="How this industry category is classified.">
          <AuditCard title="Identity" description="How this industry is labelled.">
            <AuditField label="Name" value={category.name} />
          </AuditCard>
          <AuditCard title="Classification" description="Availability.">
            <AuditField label="Active" value={category.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this category was created and last changed.">
            <AuditTimestampPair dateLabel="Created at" value={category.created_at} />
            <AuditTimestampPair dateLabel="Last updated" value={category.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
        <AdminForm id="industry-category-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit} className="space-y-0">
          <fieldset disabled={isViewOnly} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4 flex flex-col gap-3 disabled:opacity-95">
            <AdminField label="Name" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Healthcare"
              />
            </AdminField>
            <AdminField label="Active">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Offered at registration and in Organisation Settings
              </label>
            </AdminField>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
