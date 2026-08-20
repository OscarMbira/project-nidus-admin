import { useMemo, useState } from 'react'
import { ViewToggle } from '@nidus-admin/ui'

const DOCUMENT_TYPES = [
  { value: 'project_charters', label: 'Project Charter', category: 'Initiating' },
  { value: 'assumption_logs', label: 'Assumption Log', category: 'Planning' },
  { value: 'project_management_plans', label: 'Project Management Plan', category: 'Planning' },
  { value: 'requirements_management_plans', label: 'Requirements Management Plan', category: 'Planning' },
  { value: 'requirements_documentation', label: 'Requirements Documentation', category: 'Planning' },
  { value: 'wbs_dictionary_entries', label: 'WBS Dictionary', category: 'Planning' },
  { value: 'activity_attributes', label: 'Activity Attributes', category: 'Planning' },
  { value: 'activity_resource_requirements', label: 'Activity Resource Requirements', category: 'Planning' },
  { value: 'resource_breakdown_structure', label: 'Resource Breakdown Structure', category: 'Planning' },
  { value: 'activity_duration_estimates', label: 'Activity Duration Estimates', category: 'Planning' },
  { value: 'cost_management_plans', label: 'Cost Management Plan', category: 'Planning' },
  { value: 'activity_cost_estimates', label: 'Activity Cost Estimates', category: 'Planning' },
  { value: 'cost_baselines', label: 'Cost Baseline', category: 'Planning' },
  { value: 'resource_management_plans', label: 'Resource Management Plan', category: 'Planning' },
  { value: 'stakeholder_engagement_plans', label: 'Stakeholder Engagement Plan', category: 'Planning' },
  { value: 'procurement_management_plans', label: 'Procurement Management Plan', category: 'Planning' },
  { value: 'quality_checklists', label: 'Quality Checklist', category: 'Planning' },
  { value: 'team_performance_assessments', label: 'Team Performance Assessment', category: 'Executing' },
  { value: 'make_or_buy_decisions', label: 'Make or Buy Decision', category: 'Executing' },
  { value: 'variance_analysis_reports', label: 'Variance Analysis Report', category: 'Monitoring & Controlling' },
  { value: 'evm_status_reports', label: 'EVM Status Report', category: 'Monitoring & Controlling' },
  { value: 'scope_acceptance_forms', label: 'Scope Acceptance Form', category: 'Monitoring & Controlling' },
  { value: 'project_closure_checklists', label: 'Project Closure Checklist', category: 'Closing' },
  { value: 'contract_closure_documents', label: 'Contract Closure Document', category: 'Closing' },
]

const inputClass = 'mt-1 w-full rounded border border-gray-600 bg-gray-950 px-3 py-2 text-sm text-gray-100'
const labelClass = 'block text-sm text-gray-300'

/** Shared content fields shown for every process document type. */
const COMMON_CONTENT_FIELDS = [
  { key: 'purpose', label: 'Purpose', type: 'textarea', rows: 3, placeholder: 'Why this master document exists' },
  { key: 'owner_role', label: 'Owner role', type: 'text', placeholder: 'e.g. PMO, Project Manager' },
  { key: 'review_cadence', label: 'Review cadence', type: 'text', placeholder: 'e.g. Per stage gate, Monthly' },
  { key: 'sample_notes', label: 'Guidance / notes', type: 'textarea', rows: 3, placeholder: 'Instructions for people using this template' },
]

/** Extra labelled fields by document type (beyond the common set). */
const TYPE_CONTENT_FIELDS = {
  project_charters: [
    { key: 'objectives', label: 'Objectives', type: 'textarea', rows: 3 },
    { key: 'success_criteria', label: 'Success criteria', type: 'textarea', rows: 2 },
    { key: 'high_level_scope', label: 'High-level scope', type: 'textarea', rows: 2 },
  ],
  assumption_logs: [
    { key: 'assumption_categories', label: 'Assumption categories', type: 'text', placeholder: 'e.g. Technical, Business, External' },
    { key: 'escalation_path', label: 'Escalation path', type: 'text' },
  ],
  project_management_plans: [
    { key: 'subsidiary_plans', label: 'Subsidiary plans covered', type: 'textarea', rows: 2 },
    { key: 'baselines', label: 'Baselines included', type: 'text', placeholder: 'Scope, Schedule, Cost' },
  ],
  requirements_management_plans: [
    { key: 'elicitation_methods', label: 'Elicitation methods', type: 'textarea', rows: 2 },
    { key: 'traceability_approach', label: 'Traceability approach', type: 'text' },
  ],
  requirements_documentation: [
    { key: 'requirement_types', label: 'Requirement types', type: 'text', placeholder: 'Business, Functional, Non-functional' },
    { key: 'priority_scale', label: 'Priority scale', type: 'text', placeholder: 'MoSCoW / 1–5' },
  ],
  wbs_dictionary_entries: [
    { key: 'wbs_level_guidance', label: 'WBS level guidance', type: 'textarea', rows: 2 },
    { key: 'acceptance_criteria_hint', label: 'Acceptance criteria hint', type: 'text' },
  ],
  activity_attributes: [
    { key: 'attribute_list', label: 'Typical attributes', type: 'textarea', rows: 2, placeholder: 'ID, predecessors, resources, constraints…' },
  ],
  activity_resource_requirements: [
    { key: 'resource_categories', label: 'Resource categories', type: 'text', placeholder: 'Labour, Equipment, Material' },
  ],
  resource_breakdown_structure: [
    { key: 'hierarchy_levels', label: 'Hierarchy levels', type: 'text', placeholder: 'Category → Type → Resource' },
  ],
  activity_duration_estimates: [
    { key: 'estimating_technique', label: 'Estimating technique', type: 'text', placeholder: 'Analogous, Parametric, Three-point' },
    { key: 'unit_of_measure', label: 'Unit of measure', type: 'text', placeholder: 'Days / Hours' },
  ],
  cost_management_plans: [
    { key: 'cost_precision', label: 'Cost precision', type: 'text', placeholder: 'e.g. nearest thousand' },
    { key: 'control_thresholds', label: 'Control thresholds', type: 'text', placeholder: 'e.g. ±10% variance' },
  ],
  activity_cost_estimates: [
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD' },
    { key: 'contingency_guidance', label: 'Contingency guidance', type: 'textarea', rows: 2 },
  ],
  cost_baselines: [
    { key: 'currency', label: 'Currency', type: 'text', placeholder: 'USD' },
    { key: 'baseline_total', label: 'Baseline total (sample)', type: 'text', placeholder: 'e.g. 1.25m' },
    { key: 'time_phasing', label: 'Time-phasing approach', type: 'textarea', rows: 2, placeholder: 'Monthly / by phase' },
    { key: 'management_reserve', label: 'Management reserve notes', type: 'text' },
  ],
  resource_management_plans: [
    { key: 'acquisition_approach', label: 'Acquisition approach', type: 'textarea', rows: 2 },
    { key: 'team_development', label: 'Team development notes', type: 'text' },
  ],
  stakeholder_engagement_plans: [
    { key: 'engagement_levels', label: 'Engagement levels', type: 'text', placeholder: 'Unaware → Leading' },
    { key: 'communication_channels', label: 'Communication channels', type: 'textarea', rows: 2 },
  ],
  procurement_management_plans: [
    { key: 'contract_types', label: 'Preferred contract types', type: 'text' },
    { key: 'make_or_buy_criteria', label: 'Make-or-buy criteria', type: 'textarea', rows: 2 },
  ],
  quality_checklists: [
    { key: 'checklist_items', label: 'Default checklist items', type: 'textarea', rows: 4, placeholder: 'One item per line' },
    { key: 'pass_fail_rule', label: 'Pass / fail rule', type: 'text' },
  ],
  team_performance_assessments: [
    { key: 'assessment_dimensions', label: 'Assessment dimensions', type: 'textarea', rows: 2 },
    { key: 'rating_scale', label: 'Rating scale', type: 'text', placeholder: '1–5' },
  ],
  make_or_buy_decisions: [
    { key: 'decision_criteria', label: 'Decision criteria', type: 'textarea', rows: 2 },
    { key: 'recommendation_format', label: 'Recommendation format', type: 'text' },
  ],
  variance_analysis_reports: [
    { key: 'variance_types', label: 'Variance types covered', type: 'text', placeholder: 'Schedule, Cost, Scope' },
    { key: 'root_cause_prompt', label: 'Root-cause prompt', type: 'textarea', rows: 2 },
  ],
  evm_status_reports: [
    { key: 'metrics_included', label: 'Metrics included', type: 'text', placeholder: 'PV, EV, AC, CPI, SPI' },
    { key: 'reporting_period', label: 'Reporting period', type: 'text', placeholder: 'Weekly / Monthly' },
  ],
  scope_acceptance_forms: [
    { key: 'acceptance_criteria', label: 'Acceptance criteria guidance', type: 'textarea', rows: 2 },
    { key: 'signoff_roles', label: 'Sign-off roles', type: 'text' },
  ],
  project_closure_checklists: [
    { key: 'closure_steps', label: 'Default closure steps', type: 'textarea', rows: 4, placeholder: 'One step per line' },
    { key: 'archive_location', label: 'Archive location guidance', type: 'text' },
  ],
  contract_closure_documents: [
    { key: 'closure_conditions', label: 'Closure conditions', type: 'textarea', rows: 2 },
    { key: 'final_payment_notes', label: 'Final payment notes', type: 'text' },
  ],
}

function fieldsForDocumentType(documentType) {
  const extras = TYPE_CONTENT_FIELDS[documentType] || []
  const seen = new Set()
  const merged = []
  for (const field of [...COMMON_CONTENT_FIELDS, ...extras]) {
    if (seen.has(field.key)) continue
    seen.add(field.key)
    merged.push(field)
  }
  return merged
}

function valueToInput(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function inputToValue(raw, previous) {
  const text = raw == null ? '' : String(raw)
  if (previous != null && typeof previous === 'object') {
    try {
      return JSON.parse(text || 'null')
    } catch {
      return text
    }
  }
  return text
}

function humanizeKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * User-friendly process_template payload editor.
 * Named fields per document type — no raw JSON required.
 * Supports form (card) and table layouts via ViewToggle.
 */
export default function ProcessTemplatePayloadEditor({ value, onChange, readOnly = false }) {
  const v = value || {}
  const documentType = v.document_type || 'project_charters'
  const data = (v.document_data && typeof v.document_data === 'object' && !Array.isArray(v.document_data))
    ? v.document_data
    : {}

  const schemaFields = useMemo(() => fieldsForDocumentType(documentType), [documentType])
  const schemaKeys = useMemo(() => new Set(schemaFields.map((f) => f.key)), [schemaFields])

  const extraEntries = useMemo(
    () => Object.entries(data).filter(([key]) => !schemaKeys.has(key)),
    [data, schemaKeys],
  )

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [newFieldLabel, setNewFieldLabel] = useState('')
  const [contentView, setContentView] = useState('card')

  const set = (patch) => {
    if (readOnly) return
    onChange({ ...v, ...patch })
  }

  const setDataField = (key, nextValue) => {
    if (readOnly) return
    const next = { ...data, [key]: nextValue }
    if (nextValue === '' || nextValue == null) {
      next[key] = typeof nextValue === 'string' ? nextValue : ''
    }
    set({ document_data: next })
  }

  const removeDataField = (key) => {
    if (readOnly) return
    const next = { ...data }
    delete next[key]
    set({ document_data: next })
  }

  const addCustomField = () => {
    if (readOnly) return
    const label = newFieldLabel.trim()
    if (!label) return
    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 64) || `custom_${Object.keys(data).length + 1}`
    if (data[key] != null || schemaKeys.has(key)) {
      setNewFieldLabel('')
      return
    }
    set({ document_data: { ...data, [key]: '' } })
    setNewFieldLabel('')
  }

  const openAdvanced = () => {
    setJsonDraft(JSON.stringify(data, null, 2))
    setJsonError('')
    setShowAdvanced(true)
  }

  const applyAdvanced = () => {
    if (readOnly) return
    try {
      const parsed = JSON.parse(jsonDraft || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Document content must be a JSON object.')
        return
      }
      set({ document_data: parsed })
      setJsonError('')
      setShowAdvanced(false)
    } catch {
      setJsonError('Invalid JSON — fix the syntax and try again.')
    }
  }

  const renderField = (field) => {
    const current = data[field.key]
    const isComplex = current != null && typeof current === 'object'
    const rows = field.type === 'textarea' ? (field.rows || 3) : (isComplex ? 4 : undefined)

    if (field.type === 'textarea' || isComplex) {
      return (
        <label key={field.key} className={labelClass}>
          {field.label}
          <textarea
            rows={rows || 3}
            value={valueToInput(current)}
            onChange={(e) => setDataField(field.key, inputToValue(e.target.value, current))}
            className={`${inputClass} ${isComplex ? 'font-mono text-xs' : ''}`}
            placeholder={field.placeholder || ''}
            disabled={readOnly}
            readOnly={readOnly}
          />
        </label>
      )
    }

    return (
      <label key={field.key} className={labelClass}>
        {field.label}
        <input
          value={valueToInput(current)}
          onChange={(e) => setDataField(field.key, e.target.value)}
          className={inputClass}
          placeholder={field.placeholder || ''}
          disabled={readOnly}
          readOnly={readOnly}
        />
      </label>
    )
  }

  const renderTableRows = () => {
    const rows = [
      ...schemaFields.map((field) => ({
        key: field.key,
        label: field.label,
        value: data[field.key],
        isTextarea: field.type === 'textarea',
        removable: false,
      })),
      ...extraEntries.map(([key, val]) => ({
        key,
        label: humanizeKey(key),
        value: val,
        isTextarea: true,
        removable: !readOnly,
      })),
    ]

    return (
      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700/80">
        <table className="w-full table-fixed divide-y divide-gray-200 text-xs dark:divide-gray-700">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[62%]" />
            {!readOnly && <col className="w-[10%]" />}
          </colgroup>
          <thead className="bg-gray-100 dark:bg-gray-900">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Field</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-400">Value</th>
              {!readOnly && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-800 dark:bg-gray-950/50">
            {rows.map((row) => {
              const complex = row.value != null && typeof row.value === 'object'
              const useArea = row.isTextarea || complex
              return (
                <tr key={row.key}>
                  <td className="px-3 py-2 align-top font-medium text-gray-700 dark:text-gray-300">
                    {row.label}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {useArea ? (
                      <textarea
                        rows={complex ? 4 : 3}
                        value={valueToInput(row.value)}
                        onChange={(e) => setDataField(row.key, inputToValue(e.target.value, row.value))}
                        className={`${inputClass} mt-0 ${complex ? 'font-mono text-xs' : ''}`}
                        disabled={readOnly}
                        readOnly={readOnly}
                      />
                    ) : (
                      <input
                        value={valueToInput(row.value)}
                        onChange={(e) => setDataField(row.key, e.target.value)}
                        className={`${inputClass} mt-0`}
                        disabled={readOnly}
                        readOnly={readOnly}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className="px-3 py-2 align-top text-right">
                      {row.removable && (
                        <button
                          type="button"
                          onClick={() => removeDataField(row.key)}
                          className="text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-95">
        <label className={labelClass}>
          Document type
          <select
            value={documentType}
            onChange={(e) => {
              const dt = DOCUMENT_TYPES.find((d) => d.value === e.target.value)
              set({
                document_type: e.target.value,
                _suggestedCategory: dt?.category,
              })
            }}
            className={inputClass}
          >
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label} ({d.category})</option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Title
          <input
            value={v.title || ''}
            onChange={(e) => set({ title: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Description
          <textarea
            value={v.description || ''}
            onChange={(e) => set({ description: e.target.value })}
            rows={2}
            className={inputClass}
          />
        </label>
      </fieldset>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-950/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Document content</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {readOnly
                ? 'Browse fields below. Use Form / Table toggle to change layout.'
                : 'Fill in the fields below — no JSON required. Fields adapt to the selected document type.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle view={contentView} onChange={setContentView} />
            {!readOnly && (
              <button
                type="button"
                onClick={openAdvanced}
                className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Advanced JSON
              </button>
            )}
          </div>
        </div>

        {contentView === 'table' ? (
          renderTableRows()
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {schemaFields.filter((f) => f.type !== 'textarea').map(renderField)}
            </div>
            <div className="space-y-3">
              {schemaFields.filter((f) => f.type === 'textarea').map(renderField)}
            </div>

            {extraEntries.length > 0 && (
              <div className="space-y-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Additional fields</p>
                {extraEntries.map(([key, val]) => {
                  const complex = val != null && typeof val === 'object'
                  return (
                    <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                      <label className={`${labelClass} flex-1`}>
                        {humanizeKey(key)}
                        <textarea
                          rows={complex ? 4 : 2}
                          value={valueToInput(val)}
                          onChange={(e) => setDataField(key, inputToValue(e.target.value, val))}
                          className={`${inputClass} ${complex ? 'font-mono text-xs' : ''}`}
                          disabled={readOnly}
                          readOnly={readOnly}
                        />
                      </label>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeDataField(key)}
                          className="shrink-0 pt-6 text-xs text-red-600 hover:underline dark:text-red-400"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <label className={`${labelClass} min-w-[12rem] flex-1`}>
              Add custom field
              <input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCustomField()
                  }
                }}
                className={inputClass}
                placeholder="e.g. Contingency %"
              />
            </label>
            <button
              type="button"
              onClick={addCustomField}
              className="rounded bg-blue-800 px-3 py-2 text-xs text-white hover:bg-blue-700"
            >
              Add field
            </button>
          </div>
        )}
      </div>

      {showAdvanced && !readOnly && (
        <div className="space-y-2 rounded border border-amber-800/60 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-100">Advanced Document Content JSON</p>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="text-xs text-gray-400 hover:underline"
            >
              Close
            </button>
          </div>
          <textarea
            rows={10}
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            className="w-full rounded border border-gray-600 bg-gray-950 px-3 py-2 font-mono text-xs text-gray-100"
          />
          {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          <button
            type="button"
            onClick={applyAdvanced}
            className="rounded bg-amber-800 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
          >
            Apply JSON to form fields
          </button>
        </div>
      )}
    </div>
  )
}

export function emptyProcessTemplatePayload() {
  return {
    document_type: 'project_charters',
    title: '',
    description: '',
    document_data: {
      purpose: '',
      owner_role: '',
      review_cadence: '',
      sample_notes: '',
    },
    status: 'active',
  }
}

export function normalizeProcessTemplatePayload(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const base = emptyProcessTemplatePayload()
  const documentType = p.document_type || base.document_type
  const incoming = p.document_data && typeof p.document_data === 'object' && !Array.isArray(p.document_data)
    ? p.document_data
    : {}
  // Preserve all document_data keys (named guidance + sample content). Seed empty known keys
  // so editors always show the catalog for this document type (v185 option A).
  const knownKeys = fieldsForDocumentType(documentType).map((f) => f.key)
  const document_data = { ...incoming }
  for (const key of knownKeys) {
    if (document_data[key] == null) document_data[key] = ''
  }
  return {
    ...base,
    ...p,
    document_type: documentType,
    document_data,
  }
}

export { DOCUMENT_TYPES }
