/**
 * Industry plan grid column catalog + layout helpers (Admin v183 / v184).
 * MS Project–style Insert Column: show/hide standard fields, reorder shown keys.
 * v184: template-local custom columns (cf_*).
 */

export const COLUMN_STORAGE_PREFIX = 'nidus.admin.industryPlan.columns.'

export const CUSTOM_COLUMN_TYPES = ['text', 'number', 'yes_no']
export const MAX_CUSTOM_COLUMNS = 10

export function isCustomColumnKey(key) {
  return typeof key === 'string' && /^cf_[a-zA-Z0-9]+$/.test(key)
}

export function newCustomColumnId() {
  const hex = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
    : `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 8)}`
  return `cf_${hex}`
}

export function emptyCustomFieldValue(type) {
  if (type === 'yes_no') return false
  return ''
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, label: string, type: string }[]}
 */
export function normalizeCustomColumnDefs(raw) {
  const list = Array.isArray(raw) ? raw : []
  const out = []
  const seen = new Set()
  for (const d of list) {
    if (!d || typeof d !== 'object') continue
    let id = d.id == null ? '' : String(d.id).trim()
    if (!isCustomColumnKey(id)) id = newCustomColumnId()
    if (seen.has(id)) continue
    seen.add(id)
    const type = CUSTOM_COLUMN_TYPES.includes(d.type) ? d.type : 'text'
    const label = (d.label == null ? '' : String(d.label)).trim() || 'Custom field'
    out.push({ id, label, type })
    if (out.length >= MAX_CUSTOM_COLUMNS) break
  }
  return out
}

/** Merge custom column ids into a WBS/flat column opts object. */
export function mergeColumnOptsWithCustom(baseOpts, customDefs) {
  const defs = normalizeCustomColumnDefs(customDefs)
  const labels = { ...(baseOpts.labels || {}) }
  const extra = []
  for (const d of defs) {
    labels[d.id] = d.label
    extra.push(d.id)
  }
  return {
    ...baseOpts,
    optionalPool: [...(baseOpts.optionalPool || []), ...extra],
    labels,
    customDefs: defs,
  }
}
export const INDUSTRY_PLAN_COLUMN_DEFS = {
  wbs: { key: 'wbs', label: 'WBS', locked: true },
  kind: { key: 'kind', label: 'Kind', locked: true },
  name: { key: 'name', label: 'Name', locked: true },
  _row: { key: '_row', label: '#', locked: true },
  _actions: { key: '_actions', label: 'Actions', locked: true },
  duration: { key: 'duration', label: 'Duration' },
  phase_number: { key: 'phase_number', label: 'Phase #' },
  type: { key: 'type', label: 'Type' },
  resource_type: { key: 'resource_type', label: 'Resource type' },
  typical_effort: { key: 'typical_effort', label: 'Effort' },
  priority: { key: 'priority', label: 'Priority' },
  planned_hours: { key: 'planned_hours', label: 'Planned hours' },
  planned_cost: { key: 'planned_cost', label: 'Planned cost' },
  start_offset_days: { key: 'start_offset_days', label: 'Offset (days)' },
  is_locked: { key: 'is_locked', label: 'Locked' },
  is_mandatory: { key: 'is_mandatory', label: 'Mandatory' },
  is_key_role: { key: 'is_key_role', label: 'Key role' },
  likelihood: { key: 'likelihood', label: 'Likelihood' },
  impact: { key: 'impact', label: 'Impact' },
  risk_category: { key: 'risk_category', label: 'Category' },
  required_skills: { key: 'required_skills', label: 'Skills' },
}

export const WBS_LOCKED_PREFIX = ['wbs', 'kind', 'name']
export const WBS_LOCKED_SUFFIX = ['_actions']
export const WBS_OPTIONAL_POOL = [
  'duration',
  'phase_number',
  'type',
  'resource_type',
  'typical_effort',
  'priority',
  'planned_hours',
  'planned_cost',
  'start_offset_days',
  'is_locked',
  'is_mandatory',
  'required_skills',
]
export const WBS_DEFAULT_SHOWN = ['wbs', 'kind', 'name', 'duration', '_actions']

/** Per flat-tab configs (Phase A). */
export const FLAT_COLUMN_CONFIG = {
  activities: {
    lockedPrefix: ['_row', 'activity_name'],
    lockedSuffix: ['_actions'],
    optionalPool: [
      'phase_number',
      'type',
      'duration',
      'resource_type',
      'typical_effort',
      'priority',
      'planned_hours',
      'planned_cost',
      'start_offset_days',
      'is_locked',
      'required_skills',
    ],
    defaultShown: ['_row', 'activity_name', 'phase_number', 'type', 'duration', '_actions'],
    labels: {
      activity_name: 'Activity name',
      type: 'Type',
      duration: 'Duration',
    },
  },
  deliverables: {
    lockedPrefix: ['_row', 'deliverable_name'],
    lockedSuffix: ['_actions'],
    optionalPool: [
      'phase_number',
      'type',
      'is_mandatory',
      'priority',
      'planned_hours',
      'planned_cost',
      'start_offset_days',
      'is_locked',
    ],
    defaultShown: ['_row', 'deliverable_name', 'phase_number', 'type', 'is_mandatory', '_actions'],
    labels: {
      deliverable_name: 'Deliverable name',
      type: 'Type',
    },
  },
  risks: {
    lockedPrefix: ['_row', 'risk_title'],
    lockedSuffix: ['_actions'],
    optionalPool: ['risk_category', 'likelihood', 'impact'],
    defaultShown: ['_row', 'risk_title', 'risk_category', 'likelihood', 'impact', '_actions'],
    labels: {
      risk_title: 'Title',
      risk_category: 'Category',
    },
  },
  milestones: {
    lockedPrefix: ['_row', 'milestone_name'],
    lockedSuffix: ['_actions'],
    optionalPool: [
      'phase_number',
      'priority',
      'planned_hours',
      'planned_cost',
      'start_offset_days',
      'is_locked',
    ],
    defaultShown: ['_row', 'milestone_name', 'phase_number', '_actions'],
    labels: {
      milestone_name: 'Milestone name',
    },
  },
  roles: {
    lockedPrefix: ['_row', 'role_title'],
    lockedSuffix: ['_actions'],
    optionalPool: ['is_key_role'],
    defaultShown: ['_row', 'role_title', 'is_key_role', '_actions'],
    labels: {
      role_title: 'Title',
    },
  },
  benefit_categories: {
    lockedPrefix: ['_row', 'category'],
    lockedSuffix: ['_actions'],
    optionalPool: ['notes'],
    defaultShown: ['_row', 'category', 'notes', '_actions'],
    labels: {
      category: 'Category',
      notes: 'Notes',
    },
  },
  objectives: {
    lockedPrefix: ['_row', 'objective_name'],
    lockedSuffix: ['_actions'],
    optionalPool: [
      'objective_code',
      'objective_level',
      'importance_score',
      'measurement_criteria',
      'target_value',
      'strategic_alignment',
    ],
    defaultShown: ['_row', 'objective_name', 'objective_code', 'objective_level', '_actions'],
    labels: {
      objective_name: 'Name',
      objective_code: 'Code',
      objective_level: 'Level',
      importance_score: 'Importance',
      measurement_criteria: 'Measurement',
      target_value: 'Target',
      strategic_alignment: 'Strategic alignment',
    },
  },
  governance: {
    lockedPrefix: ['_row', 'board_name'],
    lockedSuffix: ['_actions'],
    optionalPool: [
      'decision_making_process',
      'selection_criteria',
      'prioritisation_rules',
      'resource_allocation_rules',
      'escalation_process',
      'compliance_requirements',
    ],
    defaultShown: ['_row', 'board_name', 'decision_making_process', '_actions'],
    labels: {
      board_name: 'Board / body',
      decision_making_process: 'Decision-making',
      selection_criteria: 'Selection criteria',
      prioritisation_rules: 'Prioritisation',
      resource_allocation_rules: 'Resource allocation',
      escalation_process: 'Escalation',
      compliance_requirements: 'Compliance',
    },
  },
  programme_governance: {
    lockedPrefix: ['_row', 'structure'],
    lockedSuffix: ['_actions'],
    optionalPool: ['terms_of_reference', 'governance_documents'],
    defaultShown: ['_row', 'structure', 'terms_of_reference', '_actions'],
    labels: {
      structure: 'Structure',
      terms_of_reference: 'Terms of reference',
      governance_documents: 'Governance documents',
    },
  },
  metrics: {
    lockedPrefix: ['_row', 'kpi_name'],
    lockedSuffix: ['_actions'],
    optionalPool: ['target', 'measurement_frequency', 'description'],
    defaultShown: ['_row', 'kpi_name', 'target', 'measurement_frequency', '_actions'],
    labels: {
      kpi_name: 'KPI name',
      target: 'Target',
      measurement_frequency: 'Frequency',
      description: 'Description',
    },
  },
  benefits: {
    lockedPrefix: ['_row', 'benefit_name'],
    lockedSuffix: ['_actions'],
    optionalPool: ['category', 'target_value', 'description'],
    defaultShown: ['_row', 'benefit_name', 'category', 'target_value', '_actions'],
    labels: {
      benefit_name: 'Benefit name',
      category: 'Category',
      target_value: 'Target',
      description: 'Description',
    },
  },
  dependencies: {
    lockedPrefix: ['_row', 'dependency_description'],
    lockedSuffix: ['_actions'],
    optionalPool: ['dependency_type', 'linked_reference'],
    defaultShown: ['_row', 'dependency_description', 'dependency_type', '_actions'],
    labels: {
      dependency_description: 'Description',
      dependency_type: 'Type',
      linked_reference: 'Linked reference',
    },
  },
}

// Flat-only name keys registered for labels
const FLAT_EXTRA_DEFS = {
  activity_name: { key: 'activity_name', label: 'Activity name' },
  deliverable_name: { key: 'deliverable_name', label: 'Deliverable name' },
  milestone_name: { key: 'milestone_name', label: 'Milestone name' },
  risk_title: { key: 'risk_title', label: 'Title' },
  role_title: { key: 'role_title', label: 'Title' },
  objective_name: { key: 'objective_name', label: 'Name' },
  kpi_name: { key: 'kpi_name', label: 'KPI name' },
  benefit_name: { key: 'benefit_name', label: 'Benefit name' },
  board_name: { key: 'board_name', label: 'Board / body' },
  category: { key: 'category', label: 'Category' },
  dependency_description: { key: 'dependency_description', label: 'Description' },
}

export function getColumnLabel(key, labels = {}) {
  if (labels[key]) return labels[key]
  if (INDUSTRY_PLAN_COLUMN_DEFS[key]) return INDUSTRY_PLAN_COLUMN_DEFS[key].label
  if (FLAT_EXTRA_DEFS[key]) return FLAT_EXTRA_DEFS[key].label
  return key
}

/**
 * Normalize a shown-key list: locked prefix → unique optionals from pool → locked suffix.
 */
export function normalizeColumnLayout(
  shownKeys,
  {
    lockedPrefix = WBS_LOCKED_PREFIX,
    lockedSuffix = WBS_LOCKED_SUFFIX,
    optionalPool = WBS_OPTIONAL_POOL,
    defaultShown = WBS_DEFAULT_SHOWN,
  } = {},
) {
  const pool = new Set(optionalPool)
  const useDefault = !Array.isArray(shownKeys)
  const input = useDefault ? defaultShown : shownKeys
  const seen = new Set()
  const optionals = []
  for (const key of input) {
    if (!pool.has(key)) continue
    if (seen.has(key)) continue
    if (lockedPrefix.includes(key) || lockedSuffix.includes(key)) continue
    seen.add(key)
    optionals.push(key)
  }
  return [...lockedPrefix, ...optionals, ...lockedSuffix]
}

/** Keys in optional pool not currently shown. */
export function availableColumns(shownKeys, optionalPool = WBS_OPTIONAL_POOL) {
  const shown = new Set(shownKeys || [])
  return optionalPool.filter((k) => !shown.has(k))
}

/** Optional keys currently shown (middle section). */
export function shownOptionalColumns(
  shownKeys,
  { lockedPrefix = WBS_LOCKED_PREFIX, lockedSuffix = WBS_LOCKED_SUFFIX, optionalPool = WBS_OPTIONAL_POOL } = {},
) {
  const layout = normalizeColumnLayout(shownKeys, { lockedPrefix, lockedSuffix, optionalPool, defaultShown: shownKeys })
  const locked = new Set([...lockedPrefix, ...lockedSuffix])
  return layout.filter((k) => !locked.has(k) && optionalPool.includes(k))
}

/**
 * Move an optional column within the shown layout (between locked prefix and suffix).
 */
export function moveColumn(order, fromKey, toKey, opts = {}) {
  const {
    lockedPrefix = WBS_LOCKED_PREFIX,
    lockedSuffix = WBS_LOCKED_SUFFIX,
    optionalPool = WBS_OPTIONAL_POOL,
  } = opts
  const layout = normalizeColumnLayout(order, { lockedPrefix, lockedSuffix, optionalPool, defaultShown: order })
  if (fromKey === toKey) return layout
  const locked = new Set([...lockedPrefix, ...lockedSuffix])
  if (locked.has(fromKey) || locked.has(toKey)) return layout
  if (!optionalPool.includes(fromKey) || !optionalPool.includes(toKey)) return layout

  const mid = layout.filter((k) => !locked.has(k))
  const fromIdx = mid.indexOf(fromKey)
  const toIdx = mid.indexOf(toKey)
  if (fromIdx < 0 || toIdx < 0) return layout
  const nextMid = [...mid]
  const [moved] = nextMid.splice(fromIdx, 1)
  nextMid.splice(toIdx, 0, moved)
  return [...lockedPrefix, ...nextMid, ...lockedSuffix]
}

export function showColumn(order, key, opts = {}) {
  const {
    lockedPrefix = WBS_LOCKED_PREFIX,
    lockedSuffix = WBS_LOCKED_SUFFIX,
    optionalPool = WBS_OPTIONAL_POOL,
  } = opts
  if (!optionalPool.includes(key)) {
    return normalizeColumnLayout(order, { lockedPrefix, lockedSuffix, optionalPool, defaultShown: order })
  }
  const layout = normalizeColumnLayout(order, { lockedPrefix, lockedSuffix, optionalPool, defaultShown: order })
  if (layout.includes(key)) return layout
  const withoutSuffix = layout.filter((k) => !lockedSuffix.includes(k))
  return [...withoutSuffix, key, ...lockedSuffix]
}

export function hideColumn(order, key, opts = {}) {
  const {
    lockedPrefix = WBS_LOCKED_PREFIX,
    lockedSuffix = WBS_LOCKED_SUFFIX,
    optionalPool = WBS_OPTIONAL_POOL,
  } = opts
  if (lockedPrefix.includes(key) || lockedSuffix.includes(key)) {
    return normalizeColumnLayout(order, { lockedPrefix, lockedSuffix, optionalPool, defaultShown: order })
  }
  return normalizeColumnLayout(
    (order || []).filter((k) => k !== key),
    { lockedPrefix, lockedSuffix, optionalPool, defaultShown: order },
  )
}

export function loadColumnLayout(storageKey, opts) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return normalizeColumnLayout(opts.defaultShown, opts)
    const parsed = JSON.parse(raw)
    return normalizeColumnLayout(parsed, opts)
  } catch {
    return normalizeColumnLayout(opts.defaultShown, opts)
  }
}

export function saveColumnLayout(storageKey, shownKeys) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(shownKeys))
  } catch { /* ignore */ }
}

export function wbsColumnOpts() {
  return {
    lockedPrefix: WBS_LOCKED_PREFIX,
    lockedSuffix: WBS_LOCKED_SUFFIX,
    optionalPool: WBS_OPTIONAL_POOL,
    defaultShown: WBS_DEFAULT_SHOWN,
  }
}

export function flatColumnOpts(listKey) {
  const cfg = FLAT_COLUMN_CONFIG[listKey]
  if (!cfg) return null
  return {
    lockedPrefix: cfg.lockedPrefix,
    lockedSuffix: cfg.lockedSuffix,
    optionalPool: cfg.optionalPool,
    defaultShown: cfg.defaultShown,
    labels: cfg.labels || {},
  }
}

/**
 * Display value for a WBS / flat cell (read-only).
 * @param {string} key
 * @param {{ kind?: string, row?: object, wbs?: string, label?: string, depth?: number }} ctx
 */
export function formatIndustryPlanCell(key, ctx = {}) {
  const { kind, row = {}, wbs, label } = ctx
  switch (key) {
    case 'wbs':
      return wbs != null ? String(wbs) : '—'
    case 'kind':
      return label || kind || '—'
    case 'name': {
      if (kind === 'phases' || ctx.isPhase) return row.phase_name || '—'
      return (
        row.activity_name
        || row.deliverable_name
        || row.milestone_name
        || row.risk_title
        || row.role_title
        || row.objective_name
        || row.kpi_name
        || row.benefit_name
        || row.board_name
        || row.category
        || row.dependency_description
        || row.structure
        || '—'
      )
    }
    case 'activity_name':
      return row.activity_name || '—'
    case 'deliverable_name':
      return row.deliverable_name || '—'
    case 'milestone_name':
      return row.milestone_name || '—'
    case 'risk_title':
      return row.risk_title || '—'
    case 'role_title':
      return row.role_title || '—'
    case 'objective_name':
      return row.objective_name || '—'
    case 'objective_code':
      return row.objective_code || '—'
    case 'objective_level':
      return row.objective_level || '—'
    case 'importance_score':
      return row.importance_score === '' || row.importance_score == null ? '—' : String(row.importance_score)
    case 'measurement_criteria':
      return row.measurement_criteria || '—'
    case 'target_value':
      return row.target_value || '—'
    case 'strategic_alignment':
      return row.strategic_alignment || '—'
    case 'kpi_name':
      return row.kpi_name || '—'
    case 'target':
      return row.target || '—'
    case 'measurement_frequency':
      return row.measurement_frequency || '—'
    case 'description':
      return row.description || '—'
    case 'notes':
      return row.notes || '—'
    case 'category':
      return row.category || '—'
    case 'benefit_name':
      return row.benefit_name || '—'
    case 'board_name':
      return row.board_name || '—'
    case 'decision_making_process':
      return row.decision_making_process || '—'
    case 'selection_criteria':
      return row.selection_criteria || '—'
    case 'prioritisation_rules':
      return row.prioritisation_rules || '—'
    case 'resource_allocation_rules':
      return row.resource_allocation_rules || '—'
    case 'escalation_process':
      return row.escalation_process || '—'
    case 'compliance_requirements':
      return row.compliance_requirements || '—'
    case 'structure':
      return row.structure || '—'
    case 'terms_of_reference':
      return row.terms_of_reference || '—'
    case 'governance_documents':
      return row.governance_documents || '—'
    case 'dependency_description':
      return row.dependency_description || '—'
    case 'dependency_type':
      return row.dependency_type || '—'
    case 'linked_reference':
      return row.linked_reference || '—'
    case 'duration': {
      if (kind === 'phases' || ctx.isPhase) return row.estimated_duration || '—'
      return row.typical_duration || row.estimated_duration || '—'
    }
    case 'phase_number':
      if (kind === 'phases' || ctx.isPhase) return '—'
      return row.phase_number == null || row.phase_number === '' ? '—' : String(row.phase_number)
    case 'type':
      return row.activity_type || row.deliverable_type || '—'
    case 'resource_type':
      return row.resource_type || '—'
    case 'typical_effort':
      return row.typical_effort || '—'
    case 'priority':
      return row.priority || '—'
    case 'planned_hours':
      return row.planned_hours === '' || row.planned_hours == null ? '—' : String(row.planned_hours)
    case 'planned_cost':
      return row.planned_cost === '' || row.planned_cost == null ? '—' : String(row.planned_cost)
    case 'start_offset_days':
      return row.start_offset_days === '' || row.start_offset_days == null ? '—' : String(row.start_offset_days)
    case 'is_locked':
      return row.is_locked ? 'Yes' : 'No'
    case 'is_mandatory':
      return row.is_mandatory ? 'Yes' : 'No'
    case 'is_key_role':
      return row.is_key_role ? 'Yes' : 'No'
    case 'likelihood':
      return row.likelihood || '—'
    case 'impact':
      return row.impact || '—'
    case 'risk_category':
      return row.risk_category || '—'
    case 'required_skills': {
      const skills = Array.isArray(row.required_skills) ? row.required_skills.filter(Boolean) : []
      if (!skills.length) return '—'
      return skills.length <= 2 ? skills.join(', ') : `${skills.slice(0, 2).join(', ')} +${skills.length - 2}`
    }
    default: {
      if (isCustomColumnKey(key)) {
        const defs = ctx.customDefs || []
        const def = defs.find((d) => d.id === key)
        const raw = row.custom_fields && typeof row.custom_fields === 'object'
          ? row.custom_fields[key]
          : undefined
        if (def?.type === 'yes_no') return raw ? 'Yes' : 'No'
        if (raw == null || raw === '') return '—'
        return String(raw)
      }
      return '—'
    }
  }
}
