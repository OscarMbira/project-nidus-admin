export const CONDITION_TYPE_OPTIONS = [
  { value: 'subscription_expiry', label: 'Subscription expiry' },
  { value: 'failed_payment', label: 'Failed payment' },
  { value: 'usage_threshold', label: 'Usage threshold' },
  { value: 'system_health', label: 'System health' },
  { value: 'custom', label: 'Custom' },
]

export const TARGET_SYSTEM_OPTIONS = [
  { value: 'all', label: 'All systems' },
  { value: 'platform', label: 'Platform' },
  { value: 'simulator', label: 'Simulator' },
  { value: 'admin', label: 'Admin' },
]

export const CONDITION_PARAM_HINTS = {
  subscription_expiry: '{ "days_before": 7 }',
  failed_payment: '{ "threshold": 5, "window_hours": 24 }',
  usage_threshold: '{ "metric": "api_calls", "threshold": 1000, "window_hours": 24 }',
  system_health: '{ "metric_name": "api_latency_ms", "threshold": 500 }',
  custom: '{ "event": "failed_admin_login", "count_threshold": 10, "window_minutes": 5 }',
}

/** Field definitions for structured condition-param editing (non-custom types). */
export const CONDITION_PARAM_FIELDS = {
  subscription_expiry: [
    { key: 'days_before', label: 'Days before expiry', type: 'number', min: 1, default: 7, altKeys: ['threshold_days'] },
  ],
  failed_payment: [
    { key: 'threshold', label: 'Failed payment count', type: 'number', min: 1, default: 5 },
    { key: 'window_hours', label: 'Rolling window (hours)', type: 'number', min: 1, default: 24 },
  ],
  usage_threshold: [
    { key: 'metric', label: 'Metric name', type: 'text', default: 'api_calls' },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 1, default: 1000 },
    { key: 'window_hours', label: 'Rolling window (hours)', type: 'number', min: 1, default: 24 },
  ],
  system_health: [
    { key: 'metric_name', label: 'Metric name', type: 'text', default: 'api_latency_ms', altKeys: ['check'] },
    { key: 'threshold', label: 'Threshold', type: 'number', min: 1, default: 500, altKeys: ['threshold_pct'] },
  ],
}

export function defaultConditionParamsForType(conditionType) {
  const fields = CONDITION_PARAM_FIELDS[conditionType]
  if (!fields) return {}
  return Object.fromEntries(fields.map((field) => [field.key, field.default]))
}

export function readConditionParamValues(conditionType, paramsObj = {}) {
  const fields = CONDITION_PARAM_FIELDS[conditionType] || []
  return Object.fromEntries(fields.map((field) => {
    const keys = [field.key, ...(field.altKeys || [])]
    const matchedKey = keys.find((key) => paramsObj[key] != null && paramsObj[key] !== '')
    return [field.key, matchedKey != null ? paramsObj[matchedKey] : field.default]
  }))
}

export function writeConditionParams(conditionType, values) {
  const fields = CONDITION_PARAM_FIELDS[conditionType] || []
  const out = {}
  for (const field of fields) {
    const raw = values[field.key]
    if (raw == null || raw === '') continue
    out[field.key] = field.type === 'number' ? Number(raw) : String(raw).trim()
  }
  return out
}

export function conditionParamsForTypeChange(nextType) {
  return formatConditionParams(defaultConditionParamsForType(nextType))
}

export const EMPTY_ALERT_RULE_FORM = {
  rule_name: '',
  rule_key: '',
  description: '',
  condition_type: 'system_health',
  condition_params: '{}',
  notification_template_id: '',
  target_roles: '',
  target_system: 'all',
  check_interval_minutes: '60',
  is_active: true,
}

export function parseConditionParams(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Condition params must be a JSON object.')
  }
  return parsed
}

export function parseTargetRoles(raw) {
  return raw
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean)
}

export function formatConditionParams(value) {
  if (!value || typeof value !== 'object') return '{}'
  return JSON.stringify(value, null, 2)
}

export function formatTargetRoles(roles) {
  if (!Array.isArray(roles)) return ''
  return roles.join(', ')
}

export function ruleToForm(rule) {
  return {
    rule_name: rule.rule_name || '',
    rule_key: rule.rule_key || '',
    description: rule.description || '',
    condition_type: rule.condition_type || 'system_health',
    condition_params: formatConditionParams(rule.condition_params),
    notification_template_id: rule.notification_template_id || '',
    target_roles: formatTargetRoles(rule.target_roles),
    target_system: rule.target_system || 'all',
    check_interval_minutes: String(rule.check_interval_minutes ?? 60),
    is_active: rule.is_active !== false,
  }
}

export function buildAlertRulePayload(form) {
  let conditionParams
  try {
    conditionParams = parseConditionParams(form.condition_params)
  } catch {
    throw new Error('Invalid condition parameters.')
  }

  if (form.condition_type !== 'custom') {
    const fields = CONDITION_PARAM_FIELDS[form.condition_type] || []
    for (const field of fields) {
      const value = conditionParams[field.key]
      if (value == null || value === '') {
        throw new Error(`${field.label} is required.`)
      }
      if (field.type === 'number' && !Number.isFinite(Number(value))) {
        throw new Error(`${field.label} must be a number.`)
      }
    }
  } else if (!Object.keys(conditionParams).length) {
    throw new Error('Custom condition parameters cannot be empty.')
  }

  const interval = Number.parseInt(form.check_interval_minutes, 10)

  if (!Number.isFinite(interval) || interval < 1) {
    throw new Error('Check interval must be at least 1 minute.')
  }

  return {
    rule_name: form.rule_name.trim(),
    rule_key: form.rule_key.trim(),
    description: form.description.trim() || null,
    condition_type: form.condition_type,
    condition_params: conditionParams,
    notification_template_id: form.notification_template_id || null,
    target_roles: parseTargetRoles(form.target_roles),
    target_system: form.target_system,
    check_interval_minutes: interval,
    is_active: form.is_active,
  }
}

export function formsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
