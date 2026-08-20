import {
  normalizeCustomColumnDefs,
  emptyCustomFieldValue,
  newCustomColumnId,
  MAX_CUSTOM_COLUMNS,
  CUSTOM_COLUMN_TYPES,
} from './industryPlanGridColumns.js'

const RECORD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** True when value looks like a UUID primary key (not a display_id like GTL-0001). */
export function isRecordUuid(value) {
  return RECORD_UUID_RE.test(String(value || '').trim())
}

/**
 * Prefer human-readable display_id for URLs; fall back to UUID.
 * @param {object|string} rowOrId - row with display_id/id, or a raw id/display_id string
 * @param {string} [displayId] - optional override when rowOrId is a UUID string
 */
export function globalTemplateUrlKey(rowOrId, displayId) {
  if (rowOrId && typeof rowOrId === 'object') {
    return String(rowOrId.display_id || rowOrId.id || '').trim()
  }
  const fromDisplay = String(displayId || '').trim()
  if (fromDisplay) return fromDisplay
  return String(rowOrId || '').trim()
}

export function globalTemplateDetailPath(rowOrId, displayId) {
  const key = globalTemplateUrlKey(rowOrId, displayId)
  return `/content/global-template-detail?id=${encodeURIComponent(key)}`
}

export function globalTemplateFormPath(rowOrId, {
  displayId,
  mode,
  focusDefaults = false,
} = {}) {
  const key = globalTemplateUrlKey(rowOrId, displayId)
  let path = `/content/global-template-form?id=${encodeURIComponent(key)}`
  if (mode === 'view') path += '&mode=view'
  if (focusDefaults) path += '&focus=defaults'
  return path
}

export function emptyFieldPayloadRow() {
  return {
    field_code: '',
    label: '',
    field_type: 'text',
    required: false,
    guidance_text: '',
    default_value: null,
    validation_rules: {},
    display_order: 0,
  }
}

/**
 * Planning-default fields shared by Phases/Activities/Deliverables/Milestones.
 * These are template-time DEFAULTS only — actual progress (% complete, actual
 * dates, baseline) is captured later, on the real project once instantiated,
 * not authored here. `start_offset_days` is relative (days from the parent
 * phase's — or, for a Phase row, the project's — start), since a template has
 * no calendar date to anchor an absolute date to.
 */
function emptyPlanningDefaults() {
  return {
    priority: '',
    planned_hours: '',
    planned_cost: '',
    is_locked: false,
    start_offset_days: '',
  }
}

/** Stable id for WBS nesting (parent_id references this). */
export function newIndustryRowId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `r${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`
}

function normRowId(value) {
  const id = str(value).trim()
  return id || newIndustryRowId()
}

function normParentId(value) {
  return str(value).trim()
}

export function emptyIndustryPhaseRow(sortOrder = 1) {
  return {
    row_id: newIndustryRowId(),
    parent_id: '',
    phase_number: sortOrder,
    phase_name: '',
    phase_description: '',
    estimated_duration: '',
    ...emptyPlanningDefaults(),
    custom_fields: {},
    sort_order: sortOrder,
  }
}

export function emptyIndustryActivityRow(sortOrder = 1) {
  return {
    row_id: newIndustryRowId(),
    parent_id: '',
    phase_number: '',
    activity_name: '',
    activity_description: '',
    activity_type: 'task',
    typical_duration: '',
    typical_effort: '',
    resource_type: '',
    required_skills: [],
    predecessor_notes: '',
    constraints: '',
    ...emptyPlanningDefaults(),
    custom_fields: {},
    sort_order: sortOrder,
  }
}

export function emptyIndustryDeliverableRow(sortOrder = 1) {
  return {
    row_id: newIndustryRowId(),
    parent_id: '',
    phase_number: '',
    deliverable_name: '',
    deliverable_type: 'document',
    is_mandatory: false,
    ...emptyPlanningDefaults(),
    custom_fields: {},
    sort_order: sortOrder,
  }
}

export function emptyIndustryRiskRow(sortOrder = 1) {
  return {
    risk_title: '',
    risk_description: '',
    risk_category: '',
    likelihood: '',
    impact: '',
    custom_fields: {},
    sort_order: sortOrder,
  }
}

export function emptyIndustryMilestoneRow(sortOrder = 1) {
  return {
    row_id: newIndustryRowId(),
    parent_id: '',
    phase_number: '',
    milestone_name: '',
    milestone_description: '',
    ...emptyPlanningDefaults(),
    custom_fields: {},
    sort_order: sortOrder,
  }
}

export function emptyIndustryRoleRow(sortOrder = 1) {
  return {
    role_title: '',
    role_description: '',
    is_key_role: false,
    custom_fields: {},
    sort_order: sortOrder,
  }
}

/** Minimal valid industry_plan payload object. */
export function emptyIndustryPlanPayload() {
  return {
    industry_code: '',
    industry_name: '',
    description: '',
    typical_duration: '',
    icon: '',
    tags: [],
    ui: { custom_column_defs: [] },
    phases: [emptyIndustryPhaseRow(1)],
    activities: [],
    deliverables: [],
    risks: [],
    milestones: [],
    roles: [],
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function str(value) {
  return value == null ? '' : String(value)
}

/** Ensure every nestable row has a stable row_id (idempotent). */
export function ensureIndustryRowIds(plan) {
  if (!plan || typeof plan !== 'object') return { plan, changed: false }
  let changed = false
  const fix = (row) => {
    if (!row || typeof row !== 'object') return row
    const next = { ...row }
    if (!String(next.row_id || '').trim()) {
      next.row_id = newIndustryRowId()
      changed = true
    }
    if (next.parent_id == null) {
      next.parent_id = ''
      changed = true
    } else {
      next.parent_id = String(next.parent_id).trim()
    }
    return next
  }
  const next = {
    ...plan,
    phases: asArray(plan.phases).map(fix),
    activities: asArray(plan.activities).map(fix),
    deliverables: asArray(plan.deliverables).map(fix),
    milestones: asArray(plan.milestones).map(fix),
  }
  return { plan: next, changed }
}

/** Numeric field that may legitimately be blank (unset) — never coerces an empty/invalid value to 0. */
function numOrEmpty(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? n : ''
}

const PRIORITIES = ['', 'low', 'medium', 'high', 'critical']

function normPriority(value) {
  const v = str(value).toLowerCase()
  return PRIORITIES.includes(v) ? v : ''
}

/** Normalise the shared planning-default fields (see emptyPlanningDefaults). */
function normPlanningDefaults(row) {
  return {
    priority: normPriority(row?.priority),
    planned_hours: numOrEmpty(row?.planned_hours),
    planned_cost: numOrEmpty(row?.planned_cost),
    is_locked: Boolean(row?.is_locked),
    start_offset_days: numOrEmpty(row?.start_offset_days),
  }
}

/** Keep only defined custom keys; coerce by type. */
function normCustomFields(row, defs) {
  const src = row?.custom_fields && typeof row.custom_fields === 'object' && !Array.isArray(row.custom_fields)
    ? row.custom_fields
    : {}
  const out = {}
  for (const def of defs) {
    const raw = src[def.id]
    if (def.type === 'yes_no') {
      out[def.id] = Boolean(raw)
    } else if (def.type === 'number') {
      out[def.id] = numOrEmpty(raw)
    } else {
      out[def.id] = str(raw)
    }
  }
  return out
}

function customFieldsOut(row, defs) {
  if (!defs.length) return undefined
  const src = row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {}
  const out = {}
  for (const def of defs) {
    const raw = src[def.id]
    if (def.type === 'yes_no') {
      out[def.id] = Boolean(raw)
    } else if (def.type === 'number') {
      if (raw === '' || raw == null) continue
      out[def.id] = raw
    } else {
      const t = str(raw).trim()
      if (t) out[def.id] = t
    }
  }
  return Object.keys(out).length ? out : undefined
}

/** Normalise API/DB payload into a stable form-state object. */
export function normalizeIndustryPlanPayload(payload) {
  const base = emptyIndustryPlanPayload()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return base
  }
  const customDefs = normalizeCustomColumnDefs(payload.ui?.custom_column_defs)
  const phases = asArray(payload.phases).map((p, i) => ({
    ...emptyIndustryPhaseRow(i + 1),
    row_id: normRowId(p.row_id),
    parent_id: normParentId(p.parent_id),
    phase_number: p.phase_number != null && p.phase_number !== '' ? Number(p.phase_number) || i + 1 : i + 1,
    phase_name: str(p.phase_name),
    phase_description: str(p.phase_description),
    estimated_duration: str(p.estimated_duration),
    ...normPlanningDefaults(p),
    custom_fields: normCustomFields(p, customDefs),
    sort_order: p.sort_order != null ? Number(p.sort_order) || i + 1 : i + 1,
  }))
  return {
    industry_code: str(payload.industry_code),
    industry_name: str(payload.industry_name),
    description: str(payload.description),
    typical_duration: str(payload.typical_duration),
    icon: str(payload.icon),
    tags: asArray(payload.tags).map((t) => str(t)).filter(Boolean),
    ui: { custom_column_defs: customDefs },
    phases: phases.length ? phases : [emptyIndustryPhaseRow(1)],
    activities: asArray(payload.activities).map((a, i) => ({
      ...emptyIndustryActivityRow(i + 1),
      row_id: normRowId(a.row_id),
      parent_id: normParentId(a.parent_id),
      phase_number: a.phase_number != null && a.phase_number !== '' ? String(a.phase_number) : '',
      activity_name: str(a.activity_name),
      activity_description: str(a.activity_description),
      activity_type: str(a.activity_type) || 'task',
      typical_duration: str(a.typical_duration),
      typical_effort: str(a.typical_effort),
      resource_type: str(a.resource_type),
      required_skills: asArray(a.required_skills).map((s) => str(s).trim()).filter(Boolean),
      predecessor_notes: str(a.predecessor_notes),
      constraints: str(a.constraints),
      ...normPlanningDefaults(a),
      custom_fields: normCustomFields(a, customDefs),
      sort_order: a.sort_order != null ? Number(a.sort_order) || i + 1 : i + 1,
    })),
    deliverables: asArray(payload.deliverables).map((d, i) => ({
      ...emptyIndustryDeliverableRow(i + 1),
      row_id: normRowId(d.row_id),
      parent_id: normParentId(d.parent_id),
      phase_number: d.phase_number != null && d.phase_number !== '' ? String(d.phase_number) : '',
      deliverable_name: str(d.deliverable_name),
      deliverable_type: str(d.deliverable_type) || 'document',
      is_mandatory: Boolean(d.is_mandatory),
      ...normPlanningDefaults(d),
      custom_fields: normCustomFields(d, customDefs),
      sort_order: d.sort_order != null ? Number(d.sort_order) || i + 1 : i + 1,
    })),
    risks: asArray(payload.risks).map((r, i) => ({
      ...emptyIndustryRiskRow(i + 1),
      risk_title: str(r.risk_title),
      risk_description: str(r.risk_description),
      risk_category: str(r.risk_category),
      likelihood: str(r.likelihood),
      impact: str(r.impact),
      custom_fields: normCustomFields(r, customDefs),
      sort_order: r.sort_order != null ? Number(r.sort_order) || i + 1 : i + 1,
    })),
    milestones: asArray(payload.milestones).map((m, i) => ({
      ...emptyIndustryMilestoneRow(i + 1),
      row_id: normRowId(m.row_id),
      parent_id: normParentId(m.parent_id),
      phase_number: m.phase_number != null && m.phase_number !== '' ? String(m.phase_number) : '',
      milestone_name: str(m.milestone_name),
      milestone_description: str(m.milestone_description),
      ...normPlanningDefaults(m),
      custom_fields: normCustomFields(m, customDefs),
      sort_order: m.sort_order != null ? Number(m.sort_order) || i + 1 : i + 1,
    })),
    roles: asArray(payload.roles).map((r, i) => ({
      ...emptyIndustryRoleRow(i + 1),
      role_title: str(r.role_title),
      role_description: str(r.role_description),
      is_key_role: Boolean(r.is_key_role),
      custom_fields: normCustomFields(r, customDefs),
      sort_order: r.sort_order != null ? Number(r.sort_order) || i + 1 : i + 1,
    })),
  }
}

/**
 * Build publishable industry_plan JSON from form state.
 * Returns { ok: true, payload } or { ok: false, error }.
 */
export function buildIndustryPlanPayload(plan) {
  const normalized = normalizeIndustryPlanPayload(plan)
  const industry_code = normalized.industry_code.trim()
  if (!industry_code) {
    return { ok: false, error: 'Industry code is required.' }
  }

  const customDefs = normalizeCustomColumnDefs(normalized.ui?.custom_column_defs)

  const phaseNum = (raw) => {
    const t = String(raw ?? '').trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  /** Publishable shape for the shared planning-default fields — omits unset values as null, never 0. */
  const planningDefaultsOut = (row) => ({
    priority: row.priority || null,
    planned_hours: row.planned_hours === '' ? null : row.planned_hours,
    planned_cost: row.planned_cost === '' ? null : row.planned_cost,
    is_locked: Boolean(row.is_locked),
    start_offset_days: row.start_offset_days === '' ? null : row.start_offset_days,
  })

  const nestingOut = (row) => ({
    row_id: row.row_id || null,
    parent_id: row.parent_id ? row.parent_id : null,
  })

  const withCustom = (row, obj) => {
    const cf = customFieldsOut(row, customDefs)
    return cf ? { ...obj, custom_fields: cf } : obj
  }

  const phases = normalized.phases
    .map((p, i) => withCustom(p, {
      ...nestingOut(p),
      phase_number: Number(p.phase_number) || i + 1,
      phase_name: p.phase_name.trim() || `Phase ${i + 1}`,
      phase_description: p.phase_description.trim() || null,
      estimated_duration: p.estimated_duration.trim() || null,
      ...planningDefaultsOut(p),
      sort_order: Number(p.sort_order) || i + 1,
    }))
    .filter((p) => p.phase_name)

  if (!phases.length) {
    return { ok: false, error: 'Add at least one phase.' }
  }

  const payload = {
    industry_code,
    industry_name: normalized.industry_name.trim() || industry_code,
    description: normalized.description.trim() || null,
    typical_duration: normalized.typical_duration.trim() || null,
    icon: normalized.icon.trim() || null,
    tags: normalized.tags,
    phases,
    activities: normalized.activities
      .filter((a) => a.activity_name.trim())
      .map((a, i) => withCustom(a, {
        ...nestingOut(a),
        phase_number: phaseNum(a.phase_number),
        activity_name: a.activity_name.trim(),
        activity_description: a.activity_description.trim() || null,
        activity_type: a.activity_type.trim() || 'task',
        typical_duration: a.typical_duration.trim() || null,
        typical_effort: a.typical_effort.trim() || null,
        resource_type: a.resource_type.trim() || null,
        required_skills: a.required_skills,
        predecessor_notes: a.predecessor_notes.trim() || null,
        constraints: a.constraints.trim() || null,
        ...planningDefaultsOut(a),
        sort_order: Number(a.sort_order) || i + 1,
      })),
    deliverables: normalized.deliverables
      .filter((d) => d.deliverable_name.trim())
      .map((d, i) => withCustom(d, {
        ...nestingOut(d),
        phase_number: phaseNum(d.phase_number),
        deliverable_name: d.deliverable_name.trim(),
        deliverable_type: d.deliverable_type.trim() || 'document',
        is_mandatory: Boolean(d.is_mandatory),
        ...planningDefaultsOut(d),
        sort_order: Number(d.sort_order) || i + 1,
      })),
    risks: normalized.risks
      .filter((r) => r.risk_title.trim())
      .map((r, i) => withCustom(r, {
        risk_title: r.risk_title.trim(),
        risk_description: r.risk_description.trim() || null,
        risk_category: r.risk_category.trim() || null,
        likelihood: r.likelihood.trim() || null,
        impact: r.impact.trim() || null,
        sort_order: Number(r.sort_order) || i + 1,
      })),
    milestones: normalized.milestones
      .filter((m) => m.milestone_name.trim())
      .map((m, i) => withCustom(m, {
        ...nestingOut(m),
        phase_number: phaseNum(m.phase_number),
        milestone_name: m.milestone_name.trim(),
        milestone_description: m.milestone_description.trim() || null,
        ...planningDefaultsOut(m),
        sort_order: Number(m.sort_order) || i + 1,
      })),
    roles: normalized.roles
      .filter((r) => r.role_title.trim())
      .map((r, i) => withCustom(r, {
        role_title: r.role_title.trim(),
        role_description: r.role_description.trim() || null,
        is_key_role: Boolean(r.is_key_role),
        sort_order: Number(r.sort_order) || i + 1,
      })),
  }

  if (customDefs.length) {
    payload.ui = { custom_column_defs: customDefs }
  }

  return { ok: true, payload }
}

/** Comma-separated tags helper for form inputs. */
export function tagsToInput(tags) {
  return asArray(tags).map((t) => str(t).trim()).filter(Boolean).join(', ')
}

export function parseTagsInput(raw) {
  return String(raw || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Brief counts for industry_plan payload summary on detail pages. */
export function summariseIndustryPlanPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }
  const len = (key) => (Array.isArray(payload[key]) ? payload[key].length : 0)
  return {
    industry_code: payload.industry_code || '',
    industry_name: payload.industry_name || '',
    phases: len('phases'),
    activities: len('activities'),
    deliverables: len('deliverables'),
    risks: len('risks'),
    milestones: len('milestones'),
    roles: len('roles'),
  }
}

/** Per-target sync: 'platform' | 'simulator'. Falls back to legacy synced_at. */
export function syncStatusLabelForTarget(row, target) {
  if (!row) return 'unknown'
  const usePlatform = target === 'platform'
  const at = usePlatform
    ? (row.platform_synced_at ?? row.synced_at)
    : (row.sim_synced_at ?? row.synced_at)
  const ver = usePlatform
    ? (row.platform_synced_version ?? row.synced_version)
    : (row.sim_synced_version ?? row.synced_version)
  if (!at) return 'not_synced'
  if (ver != null && row.record_version != null && ver < row.record_version) {
    return 'out_of_sync'
  }
  return 'synced'
}

/**
 * Overall sync across Platform + Simulator.
 * Returns synced | partial | out_of_sync | not_synced | unknown
 */
export function syncStatusLabel(row) {
  if (!row) return 'unknown'
  const platform = syncStatusLabelForTarget(row, 'platform')
  const simulator = syncStatusLabelForTarget(row, 'simulator')
  if (platform === 'synced' && simulator === 'synced') return 'synced'
  if (platform === 'not_synced' && simulator === 'not_synced') return 'not_synced'
  if (platform === 'out_of_sync' || simulator === 'out_of_sync') return 'out_of_sync'
  return 'partial'
}

export function needsPublishForTarget(row, target = 'both') {
  if (!row || row.record_status !== 'live') return false
  if (target === 'platform') {
    const s = syncStatusLabelForTarget(row, 'platform')
    return s === 'not_synced' || s === 'out_of_sync'
  }
  if (target === 'simulator') {
    const s = syncStatusLabelForTarget(row, 'simulator')
    return s === 'not_synced' || s === 'out_of_sync'
  }
  const overall = syncStatusLabel(row)
  return overall === 'not_synced' || overall === 'out_of_sync' || overall === 'partial'
}

/** Normalise payload field default for form inputs (string). */
export function defaultValueToInput(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/** Parse sample default from form input; numbers stay numeric when field_type is number/integer. */
export function parseDefaultValueInput(raw, fieldType) {
  const text = raw == null ? '' : String(raw)
  if (text.trim() === '') return null
  if (fieldType === 'number' || fieldType === 'integer') {
    const n = Number(text)
    return Number.isFinite(n) ? n : text
  }
  if (fieldType === 'boolean') {
    if (text === 'true' || text === 'false') return text === 'true'
  }
  return text
}

const ENTITY_LIST_KEYS = ['phases', 'activities', 'deliverables', 'risks', 'milestones', 'roles']

function mapEntityRows(plan, mapper) {
  const next = { ...plan }
  for (const key of ENTITY_LIST_KEYS) {
    next[key] = asArray(plan[key]).map(mapper)
  }
  return next
}

/**
 * Add a template-local custom column (v184).
 * @returns {{ ok: true, plan: object, id: string } | { ok: false, error: string }}
 */
export function addIndustryPlanCustomColumn(plan, { label, type } = {}) {
  const defs = normalizeCustomColumnDefs(plan?.ui?.custom_column_defs)
  if (defs.length >= MAX_CUSTOM_COLUMNS) {
    return { ok: false, error: `Maximum of ${MAX_CUSTOM_COLUMNS} custom columns allowed.` }
  }
  const trimmed = str(label).trim()
  if (!trimmed) return { ok: false, error: 'Label is required.' }
  const colType = CUSTOM_COLUMN_TYPES.includes(type) ? type : 'text'
  const id = newCustomColumnId()
  const def = { id, label: trimmed, type: colType }
  const nextDefs = [...defs, def]
  const emptyVal = emptyCustomFieldValue(colType)
  const next = mapEntityRows(plan || {}, (row) => ({
    ...row,
    custom_fields: { ...(row.custom_fields || {}), [id]: emptyVal },
  }))
  next.ui = { ...(plan?.ui || {}), custom_column_defs: nextDefs }
  return { ok: true, plan: next, id }
}

/**
 * Update label/type of an existing custom column (id unchanged).
 */
export function updateIndustryPlanCustomColumn(plan, id, { label, type } = {}) {
  const defs = normalizeCustomColumnDefs(plan?.ui?.custom_column_defs)
  const idx = defs.findIndex((d) => d.id === id)
  if (idx < 0) return { ok: false, error: 'Custom column not found.' }
  const trimmed = str(label).trim()
  if (!trimmed) return { ok: false, error: 'Label is required.' }
  const colType = CUSTOM_COLUMN_TYPES.includes(type) ? type : defs[idx].type
  const nextDefs = defs.map((d, i) => (i === idx ? { ...d, label: trimmed, type: colType } : d))
  const prevType = defs[idx].type
  let next = { ...plan, ui: { ...(plan?.ui || {}), custom_column_defs: nextDefs } }
  if (prevType !== colType) {
    const emptyVal = emptyCustomFieldValue(colType)
    next = mapEntityRows(next, (row) => {
      const cf = { ...(row.custom_fields || {}) }
      const raw = cf[id]
      if (colType === 'yes_no') cf[id] = Boolean(raw)
      else if (colType === 'number') cf[id] = raw === '' || raw == null || Number.isNaN(Number(raw)) ? emptyVal : Number(raw)
      else cf[id] = raw == null || typeof raw === 'boolean' ? '' : String(raw)
      return { ...row, custom_fields: cf }
    })
  }
  return { ok: true, plan: next }
}

/**
 * Hard-delete a custom column definition and strip values from all rows.
 */
export function deleteIndustryPlanCustomColumn(plan, id) {
  const defs = normalizeCustomColumnDefs(plan?.ui?.custom_column_defs)
  if (!defs.some((d) => d.id === id)) return { ok: false, error: 'Custom column not found.' }
  const nextDefs = defs.filter((d) => d.id !== id)
  const next = mapEntityRows(plan || {}, (row) => {
    const cf = { ...(row.custom_fields || {}) }
    delete cf[id]
    return { ...row, custom_fields: cf }
  })
  next.ui = { ...(plan?.ui || {}), custom_column_defs: nextDefs }
  return { ok: true, plan: next }
}

// ---------------------------------------------------------------------------
// Portfolio / Programme templates (v187) — Industry-Plan-shaped JSON payloads
// ---------------------------------------------------------------------------

export const PORTFOLIO_TYPES = Object.freeze([
  'strategic', 'operational', 'innovation', 'compliance', 'mixed',
])
export const PROGRAMME_TYPES = Object.freeze([
  'transformation', 'compliance', 'product', 'infrastructure', 'mixed',
])
export const GOVERNANCE_MODELS = Object.freeze([
  'board', 'steering_committee', 'pmo_led', 'federated', 'hybrid',
])
export const REVIEW_FREQUENCIES = Object.freeze([
  'weekly', 'fortnightly', 'monthly', 'quarterly', 'stage_gate', 'ad_hoc',
])
export const BENEFIT_CATEGORIES = Object.freeze([
  'financial', 'operational', 'strategic', 'compliance',
  'customer', 'employee', 'technology', 'environmental',
])
export const OBJECTIVE_LEVELS = Object.freeze([
  'strategic', 'tactical', 'operational',
])
export const DEPENDENCY_TYPES = Object.freeze([
  'finish_to_start', 'start_to_start', 'finish_to_finish', 'external', 'resource',
])

export function emptyPortfolioObjectiveRow(sortOrder = 1) {
  return {
    objective_code: '',
    objective_name: '',
    objective_description: '',
    objective_type: '',
    objective_level: 'strategic',
    measurement_criteria: '',
    target_value: '',
    strategic_alignment: '',
    importance_score: '',
    sort_order: sortOrder,
  }
}

export function emptyPortfolioGovernanceRow(sortOrder = 1) {
  return {
    board_name: '',
    decision_making_process: '',
    selection_criteria: '',
    prioritisation_rules: '',
    resource_allocation_rules: '',
    escalation_process: '',
    compliance_requirements: '',
    sort_order: sortOrder,
  }
}

export function emptyBenefitCategoryRow(sortOrder = 1) {
  return {
    category: 'strategic',
    notes: '',
    sort_order: sortOrder,
  }
}

export function emptyPortfolioMetricRow(sortOrder = 1) {
  return {
    kpi_name: '',
    target: '',
    measurement_frequency: 'monthly',
    description: '',
    sort_order: sortOrder,
  }
}

export function emptyProgrammeGovernanceRow(sortOrder = 1) {
  return {
    structure: '',
    terms_of_reference: '',
    governance_documents: '',
    sort_order: sortOrder,
  }
}

export function emptyProgrammeDependencyRow(sortOrder = 1) {
  return {
    dependency_description: '',
    dependency_type: 'finish_to_start',
    linked_reference: '',
    sort_order: sortOrder,
  }
}

export function emptyProgrammeBenefitRow(sortOrder = 1) {
  return {
    benefit_name: '',
    category: 'strategic',
    target_value: '',
    description: '',
    sort_order: sortOrder,
  }
}

/** Minimal valid portfolio_template payload. */
export function emptyPortfolioTemplatePayload() {
  return {
    template_code: '',
    portfolio_type: 'strategic',
    governance_model: 'steering_committee',
    review_frequency: 'monthly',
    description: '',
    objectives: [],
    governance: [],
    benefit_categories: [],
    risks: [],
    metrics: [],
    roles: [],
  }
}

/** Minimal valid programme_template payload. */
export function emptyProgrammeTemplatePayload() {
  return {
    template_code: '',
    programme_type: 'transformation',
    governance_model: 'steering_committee',
    review_frequency: 'monthly',
    description: '',
    governance: [],
    milestones: [],
    dependencies: [],
    benefits: [],
    risks: [],
    roles: [],
  }
}

function normSort(row, i) {
  return row?.sort_order != null ? Number(row.sort_order) || i + 1 : i + 1
}

export function normalizePortfolioTemplatePayload(payload) {
  const base = emptyPortfolioTemplatePayload()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return base
  return {
    template_code: str(payload.template_code),
    portfolio_type: str(payload.portfolio_type) || 'strategic',
    governance_model: str(payload.governance_model) || 'steering_committee',
    review_frequency: str(payload.review_frequency) || 'monthly',
    description: str(payload.description),
    objectives: asArray(payload.objectives).map((r, i) => ({
      ...emptyPortfolioObjectiveRow(i + 1),
      objective_code: str(r.objective_code),
      objective_name: str(r.objective_name),
      objective_description: str(r.objective_description),
      objective_type: str(r.objective_type),
      objective_level: str(r.objective_level) || 'strategic',
      measurement_criteria: str(r.measurement_criteria),
      target_value: str(r.target_value),
      strategic_alignment: str(r.strategic_alignment),
      importance_score: str(r.importance_score),
      sort_order: normSort(r, i),
    })),
    governance: asArray(payload.governance).map((r, i) => ({
      ...emptyPortfolioGovernanceRow(i + 1),
      board_name: str(r.board_name),
      decision_making_process: str(r.decision_making_process),
      selection_criteria: str(r.selection_criteria),
      prioritisation_rules: str(r.prioritisation_rules),
      resource_allocation_rules: str(r.resource_allocation_rules),
      escalation_process: str(r.escalation_process),
      compliance_requirements: str(r.compliance_requirements),
      sort_order: normSort(r, i),
    })),
    benefit_categories: asArray(payload.benefit_categories).map((r, i) => ({
      ...emptyBenefitCategoryRow(i + 1),
      category: str(r.category) || 'strategic',
      notes: str(r.notes),
      sort_order: normSort(r, i),
    })),
    risks: asArray(payload.risks).map((r, i) => ({
      ...emptyIndustryRiskRow(i + 1),
      risk_title: str(r.risk_title),
      risk_description: str(r.risk_description),
      risk_category: str(r.risk_category),
      likelihood: str(r.likelihood),
      impact: str(r.impact),
      sort_order: normSort(r, i),
    })),
    metrics: asArray(payload.metrics).map((r, i) => ({
      ...emptyPortfolioMetricRow(i + 1),
      kpi_name: str(r.kpi_name),
      target: str(r.target),
      measurement_frequency: str(r.measurement_frequency) || 'monthly',
      description: str(r.description),
      sort_order: normSort(r, i),
    })),
    roles: asArray(payload.roles).map((r, i) => ({
      ...emptyIndustryRoleRow(i + 1),
      role_title: str(r.role_title),
      role_description: str(r.role_description),
      is_key_role: Boolean(r.is_key_role),
      sort_order: normSort(r, i),
    })),
  }
}

export function normalizeProgrammeTemplatePayload(payload) {
  const base = emptyProgrammeTemplatePayload()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return base
  return {
    template_code: str(payload.template_code),
    programme_type: str(payload.programme_type) || 'transformation',
    governance_model: str(payload.governance_model) || 'steering_committee',
    review_frequency: str(payload.review_frequency) || 'monthly',
    description: str(payload.description),
    governance: asArray(payload.governance).map((r, i) => ({
      ...emptyProgrammeGovernanceRow(i + 1),
      structure: str(r.structure),
      terms_of_reference: str(r.terms_of_reference),
      governance_documents: str(r.governance_documents),
      sort_order: normSort(r, i),
    })),
    milestones: asArray(payload.milestones).map((m, i) => ({
      ...emptyIndustryMilestoneRow(i + 1),
      row_id: normRowId(m.row_id),
      parent_id: normParentId(m.parent_id),
      phase_number: m.phase_number != null && m.phase_number !== '' ? String(m.phase_number) : '',
      milestone_name: str(m.milestone_name),
      milestone_description: str(m.milestone_description),
      ...normPlanningDefaults(m),
      sort_order: normSort(m, i),
    })),
    dependencies: asArray(payload.dependencies).map((r, i) => ({
      ...emptyProgrammeDependencyRow(i + 1),
      dependency_description: str(r.dependency_description),
      dependency_type: str(r.dependency_type) || 'finish_to_start',
      linked_reference: str(r.linked_reference),
      sort_order: normSort(r, i),
    })),
    benefits: asArray(payload.benefits).map((r, i) => ({
      ...emptyProgrammeBenefitRow(i + 1),
      benefit_name: str(r.benefit_name),
      category: str(r.category) || 'strategic',
      target_value: str(r.target_value),
      description: str(r.description),
      sort_order: normSort(r, i),
    })),
    risks: asArray(payload.risks).map((r, i) => ({
      ...emptyIndustryRiskRow(i + 1),
      risk_title: str(r.risk_title),
      risk_description: str(r.risk_description),
      risk_category: str(r.risk_category),
      likelihood: str(r.likelihood),
      impact: str(r.impact),
      sort_order: normSort(r, i),
    })),
    roles: asArray(payload.roles).map((r, i) => ({
      ...emptyIndustryRoleRow(i + 1),
      role_title: str(r.role_title),
      role_description: str(r.role_description),
      is_key_role: Boolean(r.is_key_role),
      sort_order: normSort(r, i),
    })),
  }
}

export function buildPortfolioTemplatePayload(plan) {
  const n = normalizePortfolioTemplatePayload(plan)
  const template_code = n.template_code.trim()
  if (!template_code) return { ok: false, error: 'Template code is required.' }
  return {
    ok: true,
    payload: {
      template_code,
      portfolio_type: n.portfolio_type || 'strategic',
      governance_model: n.governance_model || null,
      review_frequency: n.review_frequency || null,
      description: n.description.trim() || null,
      objectives: n.objectives
        .filter((r) => r.objective_name.trim() || r.objective_code.trim())
        .map((r, i) => ({
          objective_code: r.objective_code.trim() || null,
          objective_name: r.objective_name.trim() || `Objective ${i + 1}`,
          objective_description: r.objective_description.trim() || null,
          objective_type: r.objective_type.trim() || null,
          objective_level: r.objective_level || null,
          measurement_criteria: r.measurement_criteria.trim() || null,
          target_value: r.target_value.trim() || null,
          strategic_alignment: r.strategic_alignment.trim() || null,
          importance_score: r.importance_score === '' ? null : Number(r.importance_score) || r.importance_score,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      governance: n.governance
        .filter((r) => r.board_name.trim() || r.decision_making_process.trim())
        .map((r, i) => ({
          board_name: r.board_name.trim() || null,
          decision_making_process: r.decision_making_process.trim() || null,
          selection_criteria: r.selection_criteria.trim() || null,
          prioritisation_rules: r.prioritisation_rules.trim() || null,
          resource_allocation_rules: r.resource_allocation_rules.trim() || null,
          escalation_process: r.escalation_process.trim() || null,
          compliance_requirements: r.compliance_requirements.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      benefit_categories: n.benefit_categories
        .filter((r) => r.category)
        .map((r, i) => ({
          category: r.category,
          notes: r.notes.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      risks: n.risks
        .filter((r) => r.risk_title.trim())
        .map((r, i) => ({
          risk_title: r.risk_title.trim(),
          risk_description: r.risk_description.trim() || null,
          risk_category: r.risk_category.trim() || null,
          likelihood: r.likelihood.trim() || null,
          impact: r.impact.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      metrics: n.metrics
        .filter((r) => r.kpi_name.trim())
        .map((r, i) => ({
          kpi_name: r.kpi_name.trim(),
          target: r.target.trim() || null,
          measurement_frequency: r.measurement_frequency || null,
          description: r.description.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      roles: n.roles
        .filter((r) => r.role_title.trim())
        .map((r, i) => ({
          role_title: r.role_title.trim(),
          role_description: r.role_description.trim() || null,
          is_key_role: Boolean(r.is_key_role),
          sort_order: Number(r.sort_order) || i + 1,
        })),
    },
  }
}

export function buildProgrammeTemplatePayload(plan) {
  const n = normalizeProgrammeTemplatePayload(plan)
  const template_code = n.template_code.trim()
  if (!template_code) return { ok: false, error: 'Template code is required.' }
  const phaseNum = (raw) => {
    const t = String(raw ?? '').trim()
    if (!t) return null
    const num = Number(t)
    return Number.isFinite(num) ? num : null
  }
  const planningDefaultsOut = (row) => ({
    priority: row.priority || null,
    planned_hours: row.planned_hours === '' ? null : row.planned_hours,
    planned_cost: row.planned_cost === '' ? null : row.planned_cost,
    is_locked: Boolean(row.is_locked),
    start_offset_days: row.start_offset_days === '' ? null : row.start_offset_days,
  })
  return {
    ok: true,
    payload: {
      template_code,
      programme_type: n.programme_type || 'transformation',
      governance_model: n.governance_model || null,
      review_frequency: n.review_frequency || null,
      description: n.description.trim() || null,
      governance: n.governance
        .filter((r) => r.structure.trim() || r.terms_of_reference.trim())
        .map((r, i) => ({
          structure: r.structure.trim() || null,
          terms_of_reference: r.terms_of_reference.trim() || null,
          governance_documents: r.governance_documents.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      milestones: n.milestones
        .filter((m) => m.milestone_name.trim())
        .map((m, i) => ({
          row_id: m.row_id || null,
          parent_id: m.parent_id ? m.parent_id : null,
          phase_number: phaseNum(m.phase_number),
          milestone_name: m.milestone_name.trim(),
          milestone_description: m.milestone_description.trim() || null,
          ...planningDefaultsOut(m),
          sort_order: Number(m.sort_order) || i + 1,
        })),
      dependencies: n.dependencies
        .filter((r) => r.dependency_description.trim())
        .map((r, i) => ({
          dependency_description: r.dependency_description.trim(),
          dependency_type: r.dependency_type || null,
          linked_reference: r.linked_reference.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      benefits: n.benefits
        .filter((r) => r.benefit_name.trim())
        .map((r, i) => ({
          benefit_name: r.benefit_name.trim(),
          category: r.category || null,
          target_value: r.target_value.trim() || null,
          description: r.description.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      risks: n.risks
        .filter((r) => r.risk_title.trim())
        .map((r, i) => ({
          risk_title: r.risk_title.trim(),
          risk_description: r.risk_description.trim() || null,
          risk_category: r.risk_category.trim() || null,
          likelihood: r.likelihood.trim() || null,
          impact: r.impact.trim() || null,
          sort_order: Number(r.sort_order) || i + 1,
        })),
      roles: n.roles
        .filter((r) => r.role_title.trim())
        .map((r, i) => ({
          role_title: r.role_title.trim(),
          role_description: r.role_description.trim() || null,
          is_key_role: Boolean(r.is_key_role),
          sort_order: Number(r.sort_order) || i + 1,
        })),
    },
  }
}

export function summarisePortfolioTemplatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const len = (key) => (Array.isArray(payload[key]) ? payload[key].length : 0)
  return {
    template_code: payload.template_code || '',
    portfolio_type: payload.portfolio_type || '',
    objectives: len('objectives'),
    governance: len('governance'),
    risks: len('risks'),
    metrics: len('metrics'),
    roles: len('roles'),
  }
}

export function summariseProgrammeTemplatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const len = (key) => (Array.isArray(payload[key]) ? payload[key].length : 0)
  return {
    template_code: payload.template_code || '',
    programme_type: payload.programme_type || '',
    governance: len('governance'),
    milestones: len('milestones'),
    dependencies: len('dependencies'),
    benefits: len('benefits'),
    risks: len('risks'),
    roles: len('roles'),
  }
}
