import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createIndustrySegment,
  fetchIndustryCategories,
  fetchIndustrySegmentById,
  updateIndustrySegment,
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

const EMPTY_FORM = { industry_category_id: '', name: '', description: '', display_order: 0, is_active: true }

function segmentToForm(segment) {
  return {
    industry_category_id: segment.industry_category_id || '',
    name: segment.name || '',
    description: segment.description || '',
    display_order: segment.display_order ?? 0,
    is_active: segment.is_active !== false,
  }
}

function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export default function IndustrySegmentFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const segmentId = searchParams.get('id')
  const isEdit = Boolean(segmentId)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(segmentId)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [segment, setSegment] = useState(null)
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [baselineForm, setBaselineForm] = useState(EMPTY_FORM)
  const [loadError, setLoadError] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      setLoadError(null)

      const [categoriesRes, segmentRes] = await Promise.all([
        fetchIndustryCategories(),
        isEdit ? fetchIndustrySegmentById(segmentId) : Promise.resolve({ data: null, error: null }),
      ])
      if (!active) return

      if (categoriesRes.error) {
        showError(categoriesRes.error.message || String(categoriesRes.error))
      } else {
        setCategories(categoriesRes.data || [])
      }

      if (isEdit) {
        if (segmentRes.error || !segmentRes.data) {
          setLoadError(segmentRes.error?.message || String(segmentRes.error) || 'Industry segment not found.')
          setLoading(false)
          return
        }
        const nextForm = segmentToForm(segmentRes.data)
        setSegment(segmentRes.data)
        setForm(nextForm)
        setBaselineForm(nextForm)
      }

      setLoading(false)
    }
    load()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, segmentId])

  const isDirty = useMemo(() => !isViewOnly && !formsEqual(form, baselineForm), [form, baselineForm, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved industry segment changes.')
  const goBack = () => requestNavigation('/system/industry-segments')

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim() || (!isEdit && !form.industry_category_id)) {
      showError('Industry and name are required.')
      return
    }
    setSaving(true)
    const { error } = isEdit ? await updateIndustrySegment(segmentId, form) : await createIndustrySegment(form)
    setSaving(false)
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess(isEdit ? 'Industry segment updated.' : 'Industry segment created.')
    navigate('/system/industry-segments')
  }

  if (loading) return <LoadingState message={isEdit ? 'Loading industry segment...' : 'Loading form...'} />

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load industry segment" description={loadError} />
        <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          Back to industry segments
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            ← Back to industry segments
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {isViewOnly ? 'View Industry Segment' : isEdit ? 'Edit Industry Segment' : 'Create Industry Segment'}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && segment && (
            <AdminBadge label={segment.is_active ? 'active' : 'inactive'} variant={segment.is_active ? 'active' : 'inactive'} />
          )}
          {isViewOnly ? (
            <PermissionGate permission="system.industries.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/industry-segment-form?id=${segmentId}`)} />
            </PermissionGate>
          ) : (
            <>
              <button type="button" onClick={goBack} className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button
                type="submit"
                form="industry-segment-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create segment')}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !segment && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this segment is saved.</p>
      )}
      {detailTab === 'audit' && segment && (
        <AuditDetailsPanel description="How this industry segment is classified.">
          <AuditCard title="Identity" description="How this segment is labelled.">
            <AuditField label="Name" value={segment.name} />
            <AuditField label="Industry" value={segment.industry_categories?.name} />
          </AuditCard>
          <AuditCard title="Classification" description="Availability.">
            <AuditField label="Display order" value={segment.display_order} />
            <AuditField label="Active" value={segment.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this segment was created and last changed.">
            <AuditField label="Created by" value={segment.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={segment.created_at} />
            <AuditField label="Updated by" value={segment.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={segment.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
        <AdminForm id="industry-segment-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit} className="space-y-0">
          <fieldset disabled={isViewOnly} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 md:p-4 flex flex-col gap-3 disabled:opacity-95">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <AdminField label="Industry" required>
                <select
                  className={`${inputClass} ${isEdit ? 'opacity-70' : ''}`}
                  value={form.industry_category_id}
                  disabled={isEdit}
                  onChange={(e) => setForm((prev) => ({ ...prev, industry_category_id: e.target.value }))}
                >
                  <option value="">Select an industry</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="Segment name" required>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Retail Banking"
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
                  Offered as a sub-industry option
                </label>
              </AdminField>
            </div>
          </fieldset>
        </AdminForm>
      )}
    </div>
  )
}
