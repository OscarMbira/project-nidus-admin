import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createNotificationTemplate,
  fetchNotificationTemplates,
  updateNotificationTemplate,
  useUnsavedChangesGuard,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminForm,
  AdminIconActionButton,
  EmptyState,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
} from '@nidus-admin/ui'
import NotificationTemplateFormFields from './NotificationTemplateFormFields.jsx'
import {
  EMPTY_NOTIFICATION_TEMPLATE_FORM,
  buildNotificationTemplatePayload,
  formsEqual,
  templateToForm,
} from './notificationTemplateFormUtils.js'

export default function NotificationTemplateFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const templateId = searchParams.get('id')
  const isEdit = Boolean(templateId)
  const isViewOnly = searchParams.get('view') === '1' && Boolean(templateId)
  const { showSuccess, showError } = useToast()

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState(null)
  const [form, setForm] = useState(EMPTY_NOTIFICATION_TEMPLATE_FORM)
  const [baselineForm, setBaselineForm] = useState(EMPTY_NOTIFICATION_TEMPLATE_FORM)
  const [loadError, setLoadError] = useState(null)
  const [detailTab, setDetailTab] = useState('details')

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!isEdit) {
        setLoading(false)
        return
      }

      setLoading(true)
      setLoadError(null)

      const { data, error } = await fetchNotificationTemplates({
        filters: [{ op: 'eq', col: 'id', val: templateId }],
        limit: 1,
      })

      if (!active) return

      if (error) {
        setLoadError(error.message || String(error))
        setLoading(false)
        return
      }

      const record = data?.[0]
      if (!record) {
        setLoadError('Notification template not found.')
        setLoading(false)
        return
      }

      const nextForm = templateToForm(record)
      setTemplate(record)
      setForm(nextForm)
      setBaselineForm(nextForm)
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [isEdit, templateId])

  const isDirty = useMemo(
    () => !isViewOnly && !formsEqual(form, baselineForm),
    [form, baselineForm, isViewOnly],
  )

  const { requestNavigation } = useUnsavedChangesGuard(
    isDirty,
    'You have unsaved notification template changes.',
  )

  const goBack = () => requestNavigation('/system/notification-templates')

  const handleSubmit = async (event) => {
    event.preventDefault()

    let payload
    try {
      payload = buildNotificationTemplatePayload(form, isEdit)
    } catch (err) {
      showError(err.message || 'Invalid form values.')
      return
    }

    setSaving(true)
    const { error } = isEdit
      ? await updateNotificationTemplate(templateId, payload)
      : await createNotificationTemplate(payload)
    setSaving(false)

    if (error) {
      showError(error.message || String(error))
      return
    }

    showSuccess(isEdit ? 'Notification template updated.' : 'Notification template created.')
    navigate('/system/notification-templates')
  }

  if (loading) {
    return <LoadingState message={isEdit ? 'Loading notification template...' : 'Loading form...'} />
  }

  if (loadError) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Unable to load notification template" description={loadError} />
        <button
          type="button"
          onClick={goBack}
          className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          Back to notification templates
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={goBack}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            ← Back to notification templates
          </button>
          <h1 className="text-xl font-semibold text-gray-100">
            {isViewOnly ? 'View Notification Template' : isEdit ? 'Edit Notification Template' : 'Create Notification Template'}
          </h1>
          {isEdit && template && (
            <p className="text-xs text-gray-500">{template.template_key}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isEdit && template && (
            <AdminBadge
              label={template.is_active ? 'active' : 'inactive'}
              variant={template.is_active ? 'active' : 'inactive'}
            />
          )}
          {isViewOnly ? (
            <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/system/notification-template-form?id=${templateId}`)} />
          ) : (
            <>
              <button
                type="button"
                onClick={goBack}
                className="rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="notification-template-form"
                disabled={saving || (isEdit && !isDirty)}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save changes' : 'Create template')}
              </button>
            </>
          )}
        </div>
      </div>

      {isViewOnly && (
        <div className="shrink-0 rounded-lg border border-gray-600 bg-gray-800/80 px-3 py-2 text-sm text-gray-300">
          Viewing notification template in read-only mode. Use Edit to make changes.
        </div>
      )}

      <DetailAuditTabList activeTab={detailTab} onChange={setDetailTab} />

      {detailTab === 'audit' && !template && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this template is saved.</p>
      )}

      {detailTab === 'audit' && template && (
        <AuditDetailsPanel description="Who created or changed this notification template, and how it is classified.">
          <AuditCard title="Identity" description="How this template is labelled.">
            <AuditField label="Template key" value={template.template_key} />
            <AuditField label="Template name" value={template.template_name} />
          </AuditCard>
          <AuditCard title="Classification" description="Where this template sits.">
            <AuditField label="Channel" value={template.channel} />
            <AuditField label="Category" value={template.category} />
            <AuditField label="Active" value={template.is_active ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this template was created and last changed.">
            <AuditField label="Created by" value={template.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={template.created_at} />
            <AuditField label="Updated by" value={template.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={template.updated_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {detailTab === 'details' && (
      <AdminForm
        id="notification-template-form"
        onSubmit={isViewOnly ? (event) => event.preventDefault() : handleSubmit}
        className="space-y-0"
      >
        <NotificationTemplateFormFields
          form={form}
          setForm={setForm}
          isEdit={isEdit}
          readOnly={isViewOnly}
        />
      </AdminForm>
      )}
    </div>
  )
}
