/**
 * Process template content field catalog + Content Coverage helpers (v185).
 * Process templates keep named guidance fields in document_data (option A) — no generic help/sample schema.
 */

import { globalTemplateFormPath } from './globalTemplateUtils.js'

export const PROCESS_COMMON_CONTENT_FIELDS = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'owner_role', label: 'Owner role' },
  { key: 'review_cadence', label: 'Review cadence' },
  { key: 'sample_notes', label: 'Guidance / notes' },
]

/** Extra document_data keys by document_type (beyond the common set). */
export const PROCESS_TYPE_CONTENT_FIELDS = {
  project_charters: [
    { key: 'objectives', label: 'Objectives' },
    { key: 'success_criteria', label: 'Success criteria' },
    { key: 'high_level_scope', label: 'High-level scope' },
  ],
  assumption_logs: [
    { key: 'assumption_categories', label: 'Assumption categories' },
    { key: 'escalation_path', label: 'Escalation path' },
  ],
  project_management_plans: [
    { key: 'subsidiary_plans', label: 'Subsidiary plans covered' },
    { key: 'baselines', label: 'Baselines included' },
  ],
  requirements_management_plans: [
    { key: 'elicitation_methods', label: 'Elicitation methods' },
    { key: 'traceability_approach', label: 'Traceability approach' },
  ],
  requirements_documentation: [
    { key: 'requirement_types', label: 'Requirement types' },
    { key: 'priority_scale', label: 'Priority scale' },
  ],
  wbs_dictionary_entries: [
    { key: 'wbs_level_guidance', label: 'WBS level guidance' },
    { key: 'acceptance_criteria_hint', label: 'Acceptance criteria hint' },
  ],
  activity_attributes: [
    { key: 'attribute_list', label: 'Typical attributes' },
  ],
  activity_resource_requirements: [
    { key: 'resource_categories', label: 'Resource categories' },
  ],
  resource_breakdown_structure: [
    { key: 'hierarchy_levels', label: 'Hierarchy levels' },
  ],
  activity_duration_estimates: [
    { key: 'estimating_technique', label: 'Estimating technique' },
    { key: 'unit_of_measure', label: 'Unit of measure' },
  ],
  cost_management_plans: [
    { key: 'cost_precision', label: 'Cost precision' },
    { key: 'control_thresholds', label: 'Control thresholds' },
  ],
  activity_cost_estimates: [
    { key: 'currency', label: 'Currency' },
    { key: 'contingency_guidance', label: 'Contingency guidance' },
  ],
  cost_baselines: [
    { key: 'currency', label: 'Currency' },
    { key: 'baseline_total', label: 'Baseline total (sample)' },
    { key: 'time_phasing', label: 'Time-phasing approach' },
    { key: 'management_reserve', label: 'Management reserve notes' },
  ],
  resource_management_plans: [
    { key: 'acquisition_approach', label: 'Acquisition approach' },
    { key: 'team_development', label: 'Team development notes' },
  ],
  stakeholder_engagement_plans: [
    { key: 'engagement_levels', label: 'Engagement levels' },
    { key: 'communication_channels', label: 'Communication channels' },
  ],
  procurement_management_plans: [
    { key: 'contract_types', label: 'Preferred contract types' },
    { key: 'make_or_buy_criteria', label: 'Make-or-buy criteria' },
  ],
  quality_checklists: [
    { key: 'checklist_items', label: 'Default checklist items' },
    { key: 'pass_fail_rule', label: 'Pass / fail rule' },
  ],
  team_performance_assessments: [
    { key: 'assessment_dimensions', label: 'Assessment dimensions' },
    { key: 'rating_scale', label: 'Rating scale' },
  ],
  make_or_buy_decisions: [
    { key: 'decision_criteria', label: 'Decision criteria' },
    { key: 'recommendation_format', label: 'Recommendation format' },
  ],
  variance_analysis_reports: [
    { key: 'variance_types', label: 'Variance types covered' },
    { key: 'root_cause_prompt', label: 'Root-cause prompt' },
  ],
  evm_status_reports: [
    { key: 'metrics_included', label: 'Metrics included' },
    { key: 'reporting_period', label: 'Reporting period' },
  ],
  scope_acceptance_forms: [
    { key: 'acceptance_criteria', label: 'Acceptance criteria guidance' },
    { key: 'signoff_roles', label: 'Sign-off roles' },
  ],
  project_closure_checklists: [
    { key: 'closure_steps', label: 'Default closure steps' },
    { key: 'archive_location', label: 'Archive location guidance' },
  ],
  contract_closure_documents: [
    { key: 'closure_conditions', label: 'Closure conditions' },
    { key: 'final_payment_notes', label: 'Final payment notes' },
  ],
}

export function processContentFieldsForType(documentType) {
  const extras = PROCESS_TYPE_CONTENT_FIELDS[documentType] || []
  const seen = new Set()
  const merged = []
  for (const field of [...PROCESS_COMMON_CONTENT_FIELDS, ...extras]) {
    if (seen.has(field.key)) continue
    seen.add(field.key)
    merged.push(field)
  }
  return merged
}

function isFilledValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return String(value).trim() !== ''
}

/**
 * Form template: fields with non-empty `sample` vs total schema fields.
 * @returns {{ filled: number, total: number, pct: number }}
 */
export function countFormTemplateSampleCoverage(payload) {
  const sections = payload?.schema?.sections || []
  let total = 0
  let filled = 0
  for (const section of sections) {
    for (const field of section.fields || []) {
      total += 1
      if (isFilledValue(field?.sample)) filled += 1
    }
  }
  return {
    filled,
    total,
    pct: total === 0 ? 0 : Math.round((filled / total) * 100),
  }
}

/**
 * Process template: filled document_data keys for the type's content field catalog.
 * Named guidance fields (e.g. sample_notes, contingency_guidance) count as content.
 * @returns {{ filled: number, total: number, pct: number }}
 */
export function countProcessTemplateContentCoverage(payload) {
  const documentType = payload?.document_type || 'project_charters'
  const fields = processContentFieldsForType(documentType)
  const data = payload?.document_data && typeof payload.document_data === 'object'
    ? payload.document_data
    : {}
  let filled = 0
  for (const field of fields) {
    if (isFilledValue(data[field.key])) filled += 1
  }
  const total = fields.length
  return {
    filled,
    total,
    pct: total === 0 ? 0 : Math.round((filled / total) * 100),
  }
}

/**
 * Coverage for a global_template_library row (form_template or process_template only).
 * @returns {{ filled: number, total: number, pct: number, applicable: boolean }}
 */
export function countDefaultContentCoverage(row) {
  const domain = row?.domain
  if (domain === 'form_template') {
    return { ...countFormTemplateSampleCoverage(row.payload), applicable: true }
  }
  if (domain === 'process_template') {
    return { ...countProcessTemplateContentCoverage(row.payload), applicable: true }
  }
  return { filled: 0, total: 0, pct: 0, applicable: false }
}

/** Deep-link query for form editor: table view with Sample + Guidance first. */
export const DEFAULT_CONTENT_FOCUS_QUERY = 'focus=defaults'

export function formTemplateEditPath(rowOrId, { focusDefaults = false, displayId } = {}) {
  return globalTemplateFormPath(rowOrId, { displayId, focusDefaults })
}

export function processTemplateEditPath(rowOrId, { displayId } = {}) {
  return globalTemplateFormPath(rowOrId, { displayId })
}
