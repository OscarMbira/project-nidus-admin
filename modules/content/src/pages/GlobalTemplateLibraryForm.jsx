import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  PermissionGate,
  buildIndustryPlanPayload,
  buildPortfolioTemplatePayload,
  buildProgrammeTemplatePayload,
  createGlobalTemplate,
  defaultValueToInput,
  emptyFieldPayloadRow,
  emptyIndustryPlanPayload,
  emptyPortfolioTemplatePayload,
  emptyProgrammeTemplatePayload,
  fetchGlobalTemplateById,
  normalizeIndustryPlanPayload,
  normalizePortfolioTemplatePayload,
  normalizeProgrammeTemplatePayload,
  parseDefaultValueInput,
  updateGlobalTemplate,
  useCurrentAdmin,
  useUnsavedChangesGuard,
  globalTemplateDetailPath,
  globalTemplateFormPath,
  globalTemplateUrlKey,
} from '@nidus-admin/shared'
import {
  AdminField,
  AdminForm,
  AdminIconActionButton,
  inputClass,
  LoadingState,
  useToast,
  AuditField,
  AuditCard,
  AuditTimestampPair,
  AuditDetailsPanel,
  DetailAuditTabList,
  humanizeAuditToken,
} from '@nidus-admin/ui'
import IndustryPlanPayloadEditor from './IndustryPlanPayloadEditor.jsx'
import FormTemplatePayloadEditor, {
  emptyFormTemplatePayload,
  normalizeFormTemplatePayload,
} from './FormTemplatePayloadEditor.jsx'
import OpaPayloadEditor, { emptyOpaPayload, normalizeOpaPayload } from './OpaPayloadEditor.jsx'
import ProcessTemplatePayloadEditor, {
  emptyProcessTemplatePayload,
  normalizeProcessTemplatePayload,
  DOCUMENT_TYPES,
} from './ProcessTemplatePayloadEditor.jsx'
import {
  PortfolioTemplatePayloadEditor,
  ProgrammeTemplatePayloadEditor,
} from './PortfolioProgrammeTemplateEditors.jsx'

const FIELD_TYPES = [
  'text', 'long_text', 'number', 'integer', 'date', 'datetime', 'boolean',
  'url', 'email', 'dropdown', 'multi_select', 'json',
]

const DOMAINS = [
  { value: 'fields', label: 'Fields' },
  { value: 'industry_plan', label: 'Industry plan' },
  { value: 'form_template', label: 'Form template' },
  { value: 'opa', label: 'OPA' },
  { value: 'process_template', label: 'Process template' },
  { value: 'portfolio_template', label: 'Portfolio template' },
  { value: 'programme_template', label: 'Programme template' },
  { value: 'project_template', label: 'Project template' },
]

const METHODOLOGY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'standards_based', label: 'Standards-Based' },
  { value: 'structured', label: 'Structured' },
  { value: 'agile', label: 'Agile' },
]

const LIST_PATH = '/content/global-template-library'

const EMPTY = {
  domain: 'fields',
  name: '',
  description: '',
  category: '',
  methodology: '',
  fields: [emptyFieldPayloadRow()],
  industryPlan: emptyIndustryPlanPayload(),
  formTemplate: emptyFormTemplatePayload(),
  opa: emptyOpaPayload(),
  processTemplate: emptyProcessTemplatePayload(),
  portfolioTemplate: emptyPortfolioTemplatePayload(),
  programmeTemplate: emptyProgrammeTemplatePayload(),
  projectTemplate: emptyPortfolioTemplatePayload(),
}

function initialFormState(domainFromQuery, isEdit) {
  if (isEdit) return EMPTY
  const domain = DOMAINS.some((d) => d.value === domainFromQuery) ? domainFromQuery : 'fields'
  if (domain === 'portfolio_template') {
    return { ...EMPTY, domain, portfolioTemplate: emptyPortfolioTemplatePayload() }
  }
  if (domain === 'programme_template') {
    return { ...EMPTY, domain, programmeTemplate: emptyProgrammeTemplatePayload() }
  }
  if (domain === 'project_template') {
    return { ...EMPTY, domain, projectTemplate: emptyPortfolioTemplatePayload() }
  }
  if (domain === 'industry_plan') {
    return { ...EMPTY, domain, industryPlan: emptyIndustryPlanPayload() }
  }
  if (domain === 'form_template') {
    return { ...EMPTY, domain, formTemplate: emptyFormTemplatePayload() }
  }
  if (domain === 'opa') {
    return { ...EMPTY, domain, opa: emptyOpaPayload() }
  }
  if (domain === 'process_template') {
    return { ...EMPTY, domain, processTemplate: emptyProcessTemplatePayload() }
  }
  return { ...EMPTY, domain: 'fields' }
}

function rowToForm(row) {
  const domain = DOMAINS.some((d) => d.value === row.domain) ? row.domain : 'fields'
  const base = {
    ...EMPTY,
    domain,
    name: row.name || '',
    description: row.description || '',
    category: row.category || '',
    methodology: row.methodology || '',
  }
  if (domain === 'industry_plan') {
    return { ...base, industryPlan: normalizeIndustryPlanPayload(row.payload) }
  }
  if (domain === 'form_template') {
    return { ...base, formTemplate: normalizeFormTemplatePayload(row.payload) }
  }
  if (domain === 'opa') {
    return { ...base, opa: normalizeOpaPayload(row.payload) }
  }
  if (domain === 'process_template') {
    return { ...base, processTemplate: normalizeProcessTemplatePayload(row.payload) }
  }
  if (domain === 'portfolio_template') {
    return { ...base, portfolioTemplate: normalizePortfolioTemplatePayload(row.payload) }
  }
  if (domain === 'programme_template') {
    return { ...base, programmeTemplate: normalizeProgrammeTemplatePayload(row.payload) }
  }
  if (domain === 'project_template') {
    return { ...base, projectTemplate: normalizePortfolioTemplatePayload(row.payload) }
  }
  const payload = Array.isArray(row.payload) ? row.payload : []
  return {
    ...base,
    domain: 'fields',
    fields: payload.length
      ? payload.map((f, i) => ({
          field_code: f.field_code || '',
          label: f.label || '',
          field_type: f.field_type || 'text',
          required: Boolean(f.required),
          guidance_text: f.guidance_text || '',
          default_value: f.default_value ?? null,
          validation_rules: f.validation_rules || {},
          display_order: f.display_order ?? i + 1,
        }))
      : [emptyFieldPayloadRow()],
  }
}

export default function GlobalTemplateLibraryForm() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const idParam = searchParams.get('id')
  const isViewMode = searchParams.get('mode') === 'view'
  const focusDefaults = searchParams.get('focus') === 'defaults'
  const domainFromQuery = searchParams.get('domain')
  const isEdit = Boolean(idParam)
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useCurrentAdmin()
  const canEditTemplates = hasPermission('content.global_templates.edit')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [recordId, setRecordId] = useState(null)
  const [recordDisplayId, setRecordDisplayId] = useState(null)
  const [form, setForm] = useState(() => initialFormState(domainFromQuery, isEdit))
  const [snapshot, setSnapshot] = useState(() => initialFormState(domainFromQuery, isEdit))
  const [recordStatus, setRecordStatus] = useState('live')
  const [industryTab, setIndustryTab] = useState('overview')
  const [detailTab, setDetailTab] = useState('details')
  const [auditMeta, setAuditMeta] = useState(null)

  useEffect(() => {
    if (!idParam) {
      setRecordId(null)
      setRecordDisplayId(null)
      return
    }
    const load = async () => {
      setLoading(true)
      const { data, error } = await fetchGlobalTemplateById(idParam)
      if (error || !data) {
        showError('Global template not found.')
        setLoading(false)
        return
      }
      const next = rowToForm(data)
      setForm(next)
      setSnapshot(next)
      setRecordId(data.id)
      setRecordDisplayId(data.display_id || null)
      setRecordStatus(data.record_status || 'live')
      setIndustryTab('overview')
      setAuditMeta({
        display_id: data.display_id,
        record_status: data.record_status,
        record_version: data.record_version,
        domain: data.domain,
        methodology: data.methodology,
        category: data.category,
        created_by: data.created_by,
        created_at: data.created_at,
        updated_by: data.updated_by,
        updated_at: data.updated_at,
      })
      const canonical = globalTemplateUrlKey(data)
      if (canonical && canonical !== idParam) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('id', canonical)
        setSearchParams(nextParams, { replace: true })
      }
      setLoading(false)
    }
    load()
  }, [idParam])

  const isDirty = useMemo(() => {
    if (JSON.stringify(form) === JSON.stringify(snapshot)) return false
    // View mode: only form_template field reorder is editable (table drag), and only with edit permission
    if (isViewMode) return form.domain === 'form_template' && canEditTemplates
    return true
  }, [form, snapshot, isViewMode, canEditTemplates])
  const { requestNavigation } = useUnsavedChangesGuard(
    isDirty,
    'You have unsaved Global Template changes. Discard them?',
  )

  const isPendingApproval = isEdit && recordStatus === 'unauthorised'
  const isReadOnly = isViewMode || isPendingApproval
  /** View mode may save form field order after table drag-reorder */
  const canSaveFromView =
    isViewMode && isDirty && form.domain === 'form_template' && canEditTemplates && !isPendingApproval
  const allowViewFieldReorder = isViewMode && canEditTemplates && !isPendingApproval && form.domain === 'form_template'

  const goBack = () => {
    // Prefer returning to the detail page when viewing/editing an existing template
    if (recordId || recordDisplayId || idParam) {
      requestNavigation(globalTemplateDetailPath({
        id: recordId || idParam,
        display_id: recordDisplayId,
      }))
      return
    }
    requestNavigation(LIST_PATH)
  }

  const updateField = (index, key, value) => {
    setForm((prev) => {
      const fields = prev.fields.map((f, i) => (i === index ? { ...f, [key]: value } : f))
      return { ...prev, fields }
    })
  }

  const addField = () => {
    setForm((prev) => ({
      ...prev,
      fields: [...prev.fields, { ...emptyFieldPayloadRow(), display_order: prev.fields.length + 1 }],
    }))
  }

  const removeField = (index) => {
    setForm((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }))
  }

  const handleDomainChange = (domain) => {
    setForm((prev) => {
      if (domain === prev.domain) return prev
      if (domain === 'industry_plan') {
        return {
          ...prev,
          domain,
          industryPlan: prev.industryPlan?.industry_code
            ? prev.industryPlan
            : emptyIndustryPlanPayload(),
        }
      }
      if (domain === 'form_template') {
        return { ...prev, domain, formTemplate: prev.formTemplate?.template_code ? prev.formTemplate : emptyFormTemplatePayload() }
      }
      if (domain === 'opa') {
        return { ...prev, domain, opa: prev.opa?.title ? prev.opa : emptyOpaPayload() }
      }
      if (domain === 'process_template') {
        return { ...prev, domain, processTemplate: prev.processTemplate?.document_type ? prev.processTemplate : emptyProcessTemplatePayload() }
      }
      if (domain === 'portfolio_template') {
        return {
          ...prev,
          domain,
          portfolioTemplate: prev.portfolioTemplate?.template_code
            ? prev.portfolioTemplate
            : emptyPortfolioTemplatePayload(),
        }
      }
      if (domain === 'programme_template') {
        return {
          ...prev,
          domain,
          programmeTemplate: prev.programmeTemplate?.template_code
            ? prev.programmeTemplate
            : emptyProgrammeTemplatePayload(),
        }
      }
      if (domain === 'project_template') {
        return {
          ...prev,
          domain,
          projectTemplate: prev.projectTemplate?.template_code
            ? prev.projectTemplate
            : emptyPortfolioTemplatePayload(),
        }
      }
      return { ...prev, domain: 'fields' }
    })
    setIndustryTab('overview')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.name.trim()) {
      showError('Name is required.')
      return
    }

    let payload
    let category = form.category.trim() || null
    if (form.domain === 'industry_plan') {
      const built = buildIndustryPlanPayload(form.industryPlan)
      if (!built.ok) {
        showError(built.error)
        setIndustryTab(
          built.error.includes('phase') ? 'phases' : 'overview',
        )
        return
      }
      payload = built.payload
    } else if (form.domain === 'form_template') {
      const ft = form.formTemplate || emptyFormTemplatePayload()
      if (!String(ft.template_code || '').trim()) {
        showError('Template code is required (e.g. F001).')
        return
      }
      if (!ft.schema || typeof ft.schema !== 'object' || Array.isArray(ft.schema)) {
        showError('Form layout is invalid. Add at least one section with fields.')
        return
      }
      if (!Array.isArray(ft.schema.sections) || ft.schema.sections.length === 0) {
        showError('Add at least one section to the form layout.')
        return
      }
      payload = {
        ...ft,
        template_code: ft.template_code.trim(),
        name: form.name.trim(),
        schema: {
          ...ft.schema,
          title: ft.schema.title || form.name.trim(),
        },
      }
      if (!category) {
        category = ({
          initiating: 'Initiating',
          planning: 'Planning',
          executing: 'Executing',
          monitoring_controlling: 'Monitoring & Controlling',
          closing: 'Closing',
          agile: 'Agile',
        })[ft.process_group] || null
      }
    } else if (form.domain === 'opa') {
      const opa = { ...(form.opa || emptyOpaPayload()), title: form.name.trim() }
      payload = opa
    } else if (form.domain === 'process_template') {
      const pt = form.processTemplate || emptyProcessTemplatePayload()
      if (!pt.document_type) {
        showError('Document type is required.')
        return
      }
      if (typeof pt.document_data === 'string') {
        showError('Document content is invalid. Use the form fields (or Advanced JSON) and try again.')
        return
      }
      payload = { ...pt, title: form.name.trim() }
      if (!category) {
        category = DOCUMENT_TYPES.find((d) => d.value === pt.document_type)?.category || null
      }
    } else if (form.domain === 'portfolio_template') {
      const built = buildPortfolioTemplatePayload(form.portfolioTemplate)
      if (!built.ok) {
        showError(built.error)
        setIndustryTab('overview')
        return
      }
      payload = built.payload
      if (!category) category = built.payload.portfolio_type || null
    } else if (form.domain === 'programme_template') {
      const built = buildProgrammeTemplatePayload(form.programmeTemplate)
      if (!built.ok) {
        showError(built.error)
        setIndustryTab('overview')
        return
      }
      payload = built.payload
      if (!category) category = built.payload.programme_type || null
    } else if (form.domain === 'project_template') {
      const built = buildPortfolioTemplatePayload(form.projectTemplate)
      if (!built.ok) {
        showError(built.error)
        setIndustryTab('overview')
        return
      }
      payload = built.payload
      if (!category) category = built.payload.project_type || built.payload.portfolio_type || null
    } else {
      payload = form.fields
        .filter((f) => f.field_code.trim() || f.label.trim())
        .map((f, i) => ({
          field_code: f.field_code.trim() || `field_${i + 1}`,
          label: f.label.trim() || f.field_code.trim() || `Field ${i + 1}`,
          field_type: f.field_type || 'text',
          required: Boolean(f.required),
          guidance_text: (f.guidance_text || '').trim() || null,
          default_value: parseDefaultValueInput(
            defaultValueToInput(f.default_value),
            f.field_type || 'text',
          ),
          validation_rules: f.validation_rules || {},
          display_order: i + 1,
        }))

      if (!payload.length) {
        showError('Add at least one field.')
        return
      }
    }

    setSaving(true)
    const body = {
      domain: form.domain,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category,
      methodology: form.methodology || '',
      payload,
    }
    const { data, error } = isEdit
      ? await updateGlobalTemplate(recordId, body)
      : await createGlobalTemplate(body)
    setSaving(false)

    if (error) {
      showError(typeof error === 'string' ? error : 'Save failed.')
      return
    }

    let navRow = {
      id: isEdit ? recordId : data,
      display_id: recordDisplayId,
    }
    if (!isEdit && data) {
      const { data: created } = await fetchGlobalTemplateById(data)
      if (created) navRow = created
    } else if (isEdit && recordId) {
      const { data: updated } = await fetchGlobalTemplateById(recordId)
      if (updated) navRow = updated
    }

    const labelId = navRow.display_id || navRow.id
    showSuccess(
      isViewMode
        ? `Field order saved (ID: ${labelId}).`
        : isEdit
          ? `Global template updated (ID: ${labelId}).`
          : `Global template created (ID: ${labelId}).`,
    )
    setSnapshot(form)
    // Bypass unsaved-changes guard: snapshot update is async, so isDirty is still
    // true if we call requestNavigation() here (that was causing the discard prompt on Save).
    navigate(globalTemplateDetailPath(navRow))
  }

  if (loading) return <LoadingState message="Loading template form..." />

  const formPermission = isViewMode ? 'content.global_templates.view' : 'content.global_templates.edit'

  return (
    <PermissionGate
      permission={formPermission}
      fallback={(
        <div className="p-6 text-sm text-gray-400">
          You do not have permission to {isViewMode ? 'view' : 'edit'} Global Templates.
        </div>
      )}
    >
      <div className={`mx-auto space-y-6 p-4 md:p-6 ${
        form.domain === 'industry_plan'
          || form.domain === 'form_template'
          || form.domain === 'process_template'
          || form.domain === 'portfolio_template'
          || form.domain === 'programme_template'
          || form.domain === 'project_template'
          ? 'w-full max-w-none'
          : 'max-w-3xl'
      }`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link
              to={
                (recordId || recordDisplayId || idParam)
                  ? globalTemplateDetailPath({
                    id: recordId || idParam,
                    display_id: recordDisplayId,
                  })
                  : LIST_PATH
              }
              onClick={(e) => {
                e.preventDefault()
                goBack()
              }}
              className="mb-2 inline-block text-sm text-blue-400 hover:underline"
            >
              ← Back to {(recordId || idParam) ? 'template detail' : 'Global Template Library'}
            </Link>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              {isViewMode ? 'View Global Template' : isEdit ? 'Edit Global Template' : 'New Global Template'}
            </h1>
            {(recordDisplayId || idParam) && (
              <p className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
                {recordDisplayId || idParam}
              </p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isViewMode
                ? 'Read-only view of Global Template masters (fields, plans, forms, OPA, process, portfolio, programme).'
                : 'Author Global Template masters. Publish from the detail page to sync Platform / Simulator.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {isViewMode && (recordId || idParam) && (
              <PermissionGate permission="content.global_templates.edit">
                <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(globalTemplateFormPath({
                    id: recordId || idParam,
                    display_id: recordDisplayId,
                  }))} />
              </PermissionGate>
            )}
            <button
              type="button"
              onClick={goBack}
              className="rounded border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              {isViewMode ? 'Close' : 'Back to list'}
            </button>
          </div>
        </div>

        {isViewMode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            You are in <strong>view mode</strong>. You can browse this template, but you cannot edit fields or add records
            {allowViewFieldReorder
              ? ' — except reordering form fields in table view (drag the # handle, then Save).'
              : '.'}
            {(recordId || idParam) ? (
              <PermissionGate permission="content.global_templates.edit">
                {' '}
                Use{' '}
                <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(globalTemplateFormPath({
                    id: recordId || idParam,
                    display_id: recordDisplayId,
                  }))} />
                {' '}
                to make other changes.
              </PermissionGate>
            ) : null}
          </div>
        )}

        {isPendingApproval && !isViewMode && (
          <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
            This record is locked for editing until the pending change is approved or rejected.
          </div>
        )}

        <DetailAuditTabList
          activeTab={detailTab}
          onChange={setDetailTab}
          detailsLabel="Template details"
          ariaLabel="Global template form sections"
        />

        {detailTab === 'audit' && (
          <AuditDetailsPanel description="Who created or changed this global template, and how it is classified.">
            <AuditCard title="Identity" description="How this record is labelled and versioned.">
              <AuditField label="Display ID" value={auditMeta?.display_id || recordDisplayId} />
              <AuditField label="Status" value={humanizeAuditToken(auditMeta?.record_status || recordStatus)} />
              <AuditField
                label="Version"
                value={auditMeta?.record_version != null ? String(auditMeta.record_version) : null}
              />
              <AuditField label="Name" value={form.name} />
            </AuditCard>
            <AuditCard title="Classification" description="Where this master sits in the library.">
              <AuditField label="Domain" value={humanizeAuditToken(form.domain || auditMeta?.domain)} />
              <AuditField label="Methodology" value={humanizeAuditToken(form.methodology || auditMeta?.methodology)} />
              <AuditField label="Category" value={form.category || auditMeta?.category || null} />
            </AuditCard>
            <AuditCard title="Record history" description="When this template row was created and last changed.">
              <AuditField label="Created by" value={auditMeta?.created_by || null} />
              <AuditTimestampPair dateLabel="Created at" value={auditMeta?.created_at} />
              <AuditField label="Updated by" value={auditMeta?.updated_by || null} />
              <AuditTimestampPair dateLabel="Last updated" value={auditMeta?.updated_at} />
            </AuditCard>
          </AuditDetailsPanel>
        )}

        {detailTab === 'details' && (
        <AdminForm
          onSubmit={isReadOnly && !canSaveFromView ? (e) => e.preventDefault() : handleSubmit}
          className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="m-0 min-w-0 space-y-4">
            <div
              className="max-w-3xl space-y-4"
              onMouseDown={(e) => {
                if (!isViewMode) return
                if (e.target.closest('a, button')) return
                if (!e.target.closest('input, textarea, select, label')) return
                showError('You are in view mode. Switch to Edit to change this template.')
              }}
            >
            <AdminField label="Name" required>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
                disabled={isReadOnly}
                readOnly={isReadOnly}
              />
            </AdminField>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Category">
                <input
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder={
                    form.domain === 'industry_plan'
                      ? 'e.g. international best practice'
                      : 'e.g. phase/stage or free-text tag'
                  }
                  disabled={isReadOnly}
                  readOnly={isReadOnly}
                />
              </AdminField>
              <AdminField label="Methodology">
                <select
                  className={inputClass}
                  value={form.methodology || ''}
                  disabled={isReadOnly}
                  onChange={(e) => setForm((p) => ({ ...p, methodology: e.target.value }))}
                >
                  {METHODOLOGY_OPTIONS.map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Standards-Based / Structured / Agile track. Separate from Category (phase or tag).
                </p>
              </AdminField>
            </div>
            <AdminField label="Description">
              <textarea
                rows={3}
                className={inputClass}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                disabled={isReadOnly}
                readOnly={isReadOnly}
              />
            </AdminField>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Domain" required>
                <select
                  className={inputClass}
                  value={form.domain}
                  disabled={isEdit || isReadOnly}
                  onChange={(e) => handleDomainChange(e.target.value)}
                >
                  {DOMAINS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                {isEdit ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Domain cannot be changed after create.</p>
                ) : null}
              </AdminField>
            </div>
            </div>

            {form.domain === 'industry_plan' && (
              <IndustryPlanPayloadEditor
                value={form.industryPlan}
                onChange={(industryPlan) => setForm((p) => ({ ...p, industryPlan }))}
                activeTab={industryTab}
                onTabChange={setIndustryTab}
                readOnly={isReadOnly}
                viewMode={isViewMode}
              />
            )}
            {form.domain === 'form_template' && (
              <FormTemplatePayloadEditor
                value={form.formTemplate}
                onChange={(formTemplate) => setForm((p) => ({ ...p, formTemplate }))}
                focusDefaults={focusDefaults}
                readOnly={isReadOnly}
                viewMode={allowViewFieldReorder}
              />
            )}
            {form.domain === 'opa' && (
              <fieldset disabled={isReadOnly} className="m-0 min-w-0 border-0 p-0 disabled:opacity-95">
                <OpaPayloadEditor
                  value={form.opa}
                  onChange={(opa) => setForm((p) => ({ ...p, opa }))}
                />
              </fieldset>
            )}
            {form.domain === 'process_template' && (
              <ProcessTemplatePayloadEditor
                value={form.processTemplate}
                onChange={(processTemplate) => setForm((p) => ({ ...p, processTemplate }))}
                readOnly={isReadOnly}
              />
            )}
            {form.domain === 'portfolio_template' && (
              <PortfolioTemplatePayloadEditor
                value={form.portfolioTemplate}
                onChange={(portfolioTemplate) => setForm((p) => ({ ...p, portfolioTemplate }))}
                activeTab={industryTab}
                onTabChange={setIndustryTab}
                readOnly={isReadOnly}
                viewMode={isViewMode}
              />
            )}
            {form.domain === 'programme_template' && (
              <ProgrammeTemplatePayloadEditor
                value={form.programmeTemplate}
                onChange={(programmeTemplate) => setForm((p) => ({ ...p, programmeTemplate }))}
                activeTab={industryTab}
                onTabChange={setIndustryTab}
                readOnly={isReadOnly}
                viewMode={isViewMode}
              />
            )}
            {form.domain === 'project_template' && (
              <PortfolioTemplatePayloadEditor
                value={form.projectTemplate}
                onChange={(projectTemplate) => setForm((p) => ({ ...p, projectTemplate }))}
                activeTab={industryTab}
                onTabChange={setIndustryTab}
                readOnly={isReadOnly}
                viewMode={isViewMode}
              />
            )}
            {form.domain === 'fields' && (
              <fieldset disabled={isReadOnly} className="m-0 min-w-0 space-y-3 border-0 p-0 disabled:opacity-95">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-200">Fields</h2>
                  <button type="button" onClick={addField} className="text-sm text-blue-400 hover:underline">
                    Add field
                  </button>
                </div>
                {form.fields.map((field, index) => (
                  <div key={index} className="space-y-2 rounded border border-gray-700 p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AdminField label="Field code" required>
                        <input
                          className={inputClass}
                          value={field.field_code}
                          onChange={(e) => updateField(index, 'field_code', e.target.value)}
                          placeholder="risk_appetite"
                        />
                      </AdminField>
                      <AdminField label="Label" required>
                        <input
                          className={inputClass}
                          value={field.label}
                          onChange={(e) => updateField(index, 'label', e.target.value)}
                        />
                      </AdminField>
                      <AdminField label="Type">
                        <select
                          className={inputClass}
                          value={field.field_type}
                          onChange={(e) => updateField(index, 'field_type', e.target.value)}
                        >
                          {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </AdminField>
                      <AdminField label="Required">
                        <label className="flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={Boolean(field.required)}
                            onChange={(e) => updateField(index, 'required', e.target.checked)}
                          />
                          Required at this tier
                        </label>
                      </AdminField>
                    </div>
                    <AdminField label="Guidance (instructions)">
                      <textarea
                        rows={3}
                        className={inputClass}
                        value={field.guidance_text || ''}
                        onChange={(e) => updateField(index, 'guidance_text', e.target.value)}
                        placeholder="How should users complete this field?"
                      />
                    </AdminField>
                    <AdminField label="Sample default (pre-fills / sync override)">
                      <textarea
                        rows={3}
                        className={inputClass}
                        value={defaultValueToInput(field.default_value)}
                        onChange={(e) => updateField(index, 'default_value', e.target.value)}
                        placeholder="Copy-ready sample content"
                      />
                    </AdminField>
                    {form.fields.length > 1 && (
                      <button
                        type="button"
                        className="text-xs text-red-400 hover:underline"
                        onClick={() => removeField(index)}
                      >
                        Remove field
                      </button>
                    )}
                  </div>
                ))}
              </div>
              </fieldset>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={goBack}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {isViewMode ? 'Close' : 'Cancel'}
              </button>
              {(!isViewMode || canSaveFromView) && (
                <PermissionGate permission="content.global_templates.edit">
                  <button
                    type="submit"
                    disabled={saving || (isReadOnly && !canSaveFromView)}
                    className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : isViewMode ? 'Save field order' : isEdit ? 'Save' : 'Create'}
                  </button>
                </PermissionGate>
              )}
            </div>
          </div>
        </AdminForm>
        )}
      </div>
    </PermissionGate>
  )
}
