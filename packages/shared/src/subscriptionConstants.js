export const SUBSCRIPTION_SYSTEMS = ['platform', 'simulator']

/** ID generation rule target_table — covers platform and simulator subscription rows */
export const SUBSCRIPTION_DISPLAY_TABLE = 'public.platform_subscriptions'

export const PLATFORM_PLAN_TYPES = [
  'free',
  'starter',
  'professional',
  'enterprise',
  'lifetime_starter',
  'lifetime_professional',
  'lifetime_enterprise',
]

export const SIMULATOR_PLAN_TYPES = [
  'free',
  'basic',
  'professional',
  'enterprise',
  'lifetime_basic',
  'lifetime_professional',
  'lifetime_ultimate',
]

export const PLATFORM_STATUSES = ['active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired']
export const SIMULATOR_STATUSES = ['active', 'trialing', 'past_due', 'cancelled', 'expired']

export const BILLING_CYCLES = ['monthly', 'yearly', 'lifetime', 'custom']

/** Aligns with Platform / Simulator reporting & billing currency selects */
/** @deprecated Use fetchActiveCurrencies() + currenciesRowsToOptions() instead */
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', label: 'USD ($)' },
  { code: 'EUR', label: 'EUR (€)' },
  { code: 'GBP', label: 'GBP (£)' },
  { code: 'ZWL', label: 'ZWL (Z$)' },
  { code: 'ZAR', label: 'ZAR (R)' },
  { code: 'AED', label: 'AED (د.إ)' },
  { code: 'AUD', label: 'AUD (A$)' },
  { code: 'CAD', label: 'CAD (C$)' },
]

export function currencyOptionsForValue(currentValue, dynamicCurrencies = null) {
  const source = dynamicCurrencies?.length ? dynamicCurrencies : SUPPORTED_CURRENCIES
  const codes = new Set(source.map((c) => c.code))
  const value = String(currentValue || '').toUpperCase()
  if (value && !codes.has(value)) {
    return [...source, { code: value, label: value }]
  }
  return source
}

export function normalizeSubscriptionCurrency(code) {
  const upper = String(code || 'USD').toUpperCase()
  return SUPPORTED_CURRENCIES.some((c) => c.code === upper) ? upper : 'USD'
}

export function planTypesForSystem(system) {
  return system === 'simulator' ? SIMULATOR_PLAN_TYPES : PLATFORM_PLAN_TYPES
}

export function statusesForSystem(system) {
  return system === 'simulator' ? SIMULATOR_STATUSES : PLATFORM_STATUSES
}

export function formatPlanLabel(planType) {
  if (planType == null || planType === '') return '—'

  let value = planType
  if (typeof value === 'object') {
    value = value.plan_type ?? value.plan_name ?? value.name ?? null
  } else if (typeof value !== 'string') {
    value = String(value)
  }

  const normalized = String(value || '').trim()
  if (!normalized) return '—'

  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function systemLabel(system) {
  if (system === 'simulator') return 'Simulator'
  if (system === 'platform') return 'Platform'
  return system || 'Unknown'
}

/** Parse feature strings from subscription row / detail payload */
export function parseSubscriptionFeatures(record) {
  if (!record) return []

  if (Array.isArray(record.features)) {
    return record.features.map((item) => String(item ?? '').trim()).filter(Boolean)
  }

  if (typeof record.features === 'string') {
    try {
      const parsed = JSON.parse(record.features)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
      }
    } catch {
      return record.features.trim() ? [record.features.trim()] : []
    }
  }

  const custom = record.custom_features
  if (Array.isArray(custom)) {
    return custom.map((item) => String(item ?? '').trim()).filter(Boolean)
  }
  if (custom?.features && Array.isArray(custom.features)) {
    return custom.features.map((item) => String(item ?? '').trim()).filter(Boolean)
  }

  return []
}

/** Normalize editable feature rows for forms (always at least one empty row) */
export function normalizeFeatureEditorRows(features) {
  const cleaned = (features || []).map((item) => String(item ?? '').trim())
  return cleaned.length > 0 ? cleaned : ['']
}

/** Whether a subscription row has persisted feature data (vs unset defaults). */
export function subscriptionHasStoredFeatures(record, targetSystem = 'platform') {
  if (!record) return false
  if (targetSystem === 'simulator') {
    return record.features != null
  }
  const custom = record.custom_features
  if (custom == null) return false
  if (Array.isArray(custom)) return true
  if (typeof custom === 'object') {
    return Object.prototype.hasOwnProperty.call(custom, 'features')
  }
  return false
}

/** Strip empty rows before save */
export function serializeSubscriptionFeatures(features) {
  return (features || []).map((item) => String(item ?? '').trim()).filter(Boolean)
}
