import { formatPlanLabel, normalizeFeatureEditorRows, parseSubscriptionFeatures } from './subscriptionConstants.js'

function formatCurrency(amount, currency = 'USD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

const MEMBER_LIMIT_FEATURE_RE = /^(up to\s+)?\d+\s+team members?$/i
const PROJECT_LIMIT_FEATURE_RES = [
  /^\d+\s+projects?$/i,
  /^unlimited projects?$/i,
  /^up to\s+\d+\s+projects?$/i,
]

export function formatMemberLimitFeature(limit) {
  if (limit == null || limit === '') return null
  const n = Number(limit)
  if (!Number.isFinite(n) || n < 0) return null
  if (n === 1) return '1 team member'
  return `Up to ${n} team members`
}

function formatProjectLimitFeature(limit) {
  if (limit == null || limit === '') return 'Unlimited projects'
  const n = Number(limit)
  if (!Number.isFinite(n) || n < 0) return null
  if (n === 1) return '1 project'
  return `${n} projects`
}

/** Keep feature bullets aligned with authoritative member_limit / project_limit columns. */
export function syncPlanLimitFeatures(features = [], memberLimit, projectLimit) {
  const rest = (features || []).filter((feature) => {
    const text = String(feature ?? '').trim()
    if (!text) return false
    if (MEMBER_LIMIT_FEATURE_RE.test(text)) return false
    if (PROJECT_LIMIT_FEATURE_RES.some((re) => re.test(text))) return false
    return true
  })

  const limitFeatures = []
  const projectFeature = formatProjectLimitFeature(projectLimit)
  if (projectFeature) limitFeatures.push(projectFeature)
  const memberFeature = formatMemberLimitFeature(memberLimit)
  if (memberFeature) limitFeatures.push(memberFeature)

  return [...limitFeatures, ...rest]
}

function parseDbFeatures(record) {
  const raw = parseSubscriptionFeatures({ features: record?.features })
  return syncPlanLimitFeatures(raw, record?.member_limit, record?.project_limit)
}

/** Feature bullets from DB, aligned with member_limit / project_limit. */
export function parseDbPlanFeatures(record) {
  return parseDbFeatures(record)
}

function discountPercent(price, originalPrice) {
  const current = Number(price)
  const original = Number(originalPrice)
  if (!Number.isFinite(current) || !Number.isFinite(original) || original <= current) return null
  return Math.round((1 - current / original) * 100)
}

/** Build a preview/form plan object from a subscription_plans row (features from DB only). */
function mapDbPlanToPreview(dbPlan) {
  if (!dbPlan) return null
  const features = parseDbFeatures(dbPlan)
  return {
    id: dbPlan.plan_type,
    plan_type: dbPlan.plan_type,
    name: dbPlan.plan_name
      ?.replace(/\s*\(Simulator\)\s*/i, '')
      ?.replace(/\s+(Monthly|Yearly|Lifetime)$/i, '')
      || formatPlanLabel(dbPlan.plan_type),
    subtitle: dbPlan.plan_type === 'lifetime' ? 'One-time payment' : '',
    price: dbPlan.price != null ? Number(dbPlan.price) : null,
    original_price: dbPlan.original_price != null ? Number(dbPlan.original_price) : null,
    currency: dbPlan.currency || 'USD',
    billing_cycle: dbPlan.billing_cycle,
    features,
    member_limit: dbPlan.member_limit,
    project_limit: dbPlan.project_limit,
    additional_member_price: dbPlan.additional_member_price != null
      ? Number(dbPlan.additional_member_price)
      : null,
    is_popular: Boolean(dbPlan.is_popular),
    display_order: dbPlan.display_order ?? 0,
    source: 'database',
  }
}

function filterCatalogPlansBySystem(dbPlans = [], system = 'platform') {
  return (dbPlans || []).filter((plan) => {
    if (plan.is_active === false) return false

    const scope = plan.catalog_scope || 'both'
    if (system === 'simulator') {
      if (plan.simulator_included === false) return false
      return scope === 'simulator' || scope === 'both'
    }

    if (plan.platform_included === false) return false
    return scope === 'platform' || scope === 'both'
  })
}

/** Admin feature picker — include any active plan row included on the target system. */
function filterPlansForFeatureOptions(dbPlans = [], system = 'platform') {
  return (dbPlans || []).filter((plan) => {
    if (plan.is_active === false) return false
    if (system === 'simulator') return plan.simulator_included !== false
    return plan.platform_included !== false
  })
}

function matchesBillingCycleForPreview(plan, billingCycle) {
  const cycle = billingCycle === 'lifetime' ? 'lifetime' : (billingCycle || 'monthly')
  return plan.billing_cycle === cycle
}

function planMatchesCatalogRow(row, planType, system = 'platform') {
  if (!row || !planType) return false
  if (row.plan_type === planType) return true
  return normalizePlanTypeForCatalog(planType, system) === row.plan_type
}

/** Feature labels from subscription_plans.features for a single plan row. */
export function getCatalogPlanFeatures(
  planType,
  system = 'platform',
  billingCycle = 'monthly',
  dbPlans = [],
  options = {},
) {
  const row = findCatalogPlanRow(planType, system, billingCycle, dbPlans, options)
  return parseDbFeatures(row)
}

function withPreviousTierLabel(plans) {
  return plans.map((plan, index) => {
    if (index === 0) return plan
    return {
      ...plan,
      previous_tier_name: plans[index - 1]?.name || null,
    }
  })
}

export function getSubscriptionPriceHints(subscriptions = [], system = 'platform', billingCycle = 'monthly') {
  const hints = {}

  for (const sub of subscriptions) {
    if ((sub.target_system || 'platform') !== system) continue

    const cycle = sub.billing_cycle || 'monthly'
    if (system === 'platform' && cycle !== billingCycle) continue
    if (system === 'simulator' && billingCycle !== 'monthly' && cycle !== billingCycle) continue

    const paid = sub.amount_paid
    if (paid == null || paid === '' || !Number.isFinite(Number(paid))) continue

    const planType = sub.plan_type
    if (!planType) continue

    const ts = Date.parse(sub.started_at || sub.created_at || sub.updated_at || 0)
    const prev = hints[planType]
    if (!prev || ts >= prev.ts) {
      hints[planType] = {
        price: Number(paid),
        currency: sub.currency || 'USD',
        ts,
      }
    }
  }

  return hints
}

function applyPriceHintsToPlans(plans, hints = {}) {
  if (!hints || Object.keys(hints).length === 0) return plans

  return plans.map((plan) => {
    const hint = hints[plan.plan_type]
    if (!hint || !Number.isFinite(hint.price)) return plan
    return {
      ...plan,
      price: hint.price,
      currency: hint.currency || plan.currency || 'USD',
      source: plan.source === 'database' ? 'database_subscription' : 'subscription',
    }
  })
}

export function buildPlatformPreviewPlans(dbPlans = [], billingCycle = 'monthly') {
  const cycle = billingCycle === 'lifetime' ? 'lifetime' : (billingCycle || 'monthly')
  const cyclePlans = filterCatalogPlansBySystem(dbPlans, 'platform')
    .filter((plan) => matchesBillingCycleForPreview(plan, cycle))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const plans = cyclePlans.map(mapDbPlanToPreview).filter(Boolean)
  return withPreviousTierLabel(plans)
}

/** Link lifetime tiers to the highest recurring tier shown above them (matches public pricing layout). */
export function attachLifetimePreviousTier(lifetimePlans = [], recurringPlans = []) {
  const previousTier = recurringPlans[recurringPlans.length - 1]?.name
  if (!previousTier) return lifetimePlans

  return lifetimePlans.map((plan) => ({
    ...plan,
    previous_tier_name: plan.previous_tier_name || previousTier,
  }))
}

export function buildSimulatorPreviewPlans(dbPlans = [], billingCycle = 'monthly') {
  const cycle = billingCycle === 'yearly' ? 'yearly' : 'monthly'
  const simulatorDb = filterCatalogPlansBySystem(dbPlans, 'simulator')
    .filter((plan) => {
      if (plan.billing_cycle === 'lifetime') return true
      if (plan.plan_type === 'free') return plan.billing_cycle === 'monthly'
      return plan.billing_cycle === cycle
    })
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const plans = simulatorDb.map(mapDbPlanToPreview).filter(Boolean)
  return withPreviousTierLabel(plans)
}

function resolveBillingCycle(planType, billingCycle, isLifetime) {
  if (isLifetime || billingCycle === 'lifetime' || String(planType || '').startsWith('lifetime_')) {
    return 'lifetime'
  }
  return billingCycle || 'monthly'
}

/** Map subscription plan_type values to catalog plan_type keys */
export function normalizePlanTypeForCatalog(planType, system = 'platform') {
  if (system === 'simulator') {
    if (planType === 'lifetime_professional' || planType === 'lifetime_ultimate') return 'lifetime'
    return planType
  }
  if (planType === 'lifetime_enterprise') return 'lifetime'
  return planType
}

function findCatalogPlanRow(planType, system, billingCycle, dbPlans = [], options = {}) {
  const cycle = resolveBillingCycle(planType, billingCycle, options.isLifetime)
  const catalogType = normalizePlanTypeForCatalog(planType, system)
  const rows = (dbPlans || []).filter((plan) => {
    if (!filterCatalogPlansBySystem([plan], system).length) return false
    return plan.billing_cycle === cycle
  })

  return rows.find((plan) => plan.plan_type === planType)
    || rows.find((plan) => plan.plan_type === catalogType)
    || null
}

export function findMergedPlanInCatalog(planType, system = 'platform', billingCycle = 'monthly', dbPlans = [], options = {}) {
  if (!planType) return null

  const cycle = resolveBillingCycle(planType, billingCycle, options.isLifetime)
  const subscriptions = options.subscriptions || []

  const fromDb = mapDbPlanToPreview(
    findCatalogPlanRow(planType, system, cycle, dbPlans, options),
  )
  if (fromDb) return fromDb

  if (system === 'simulator') {
    const plans = buildSimulatorPreviewPlans(dbPlans, cycle)
    const catalogType = normalizePlanTypeForCatalog(planType, system)
    return plans.find((plan) => plan.plan_type === planType)
      || plans.find((plan) => plan.plan_type === catalogType)
      || null
  }

  const platformDb = filterCatalogPlansBySystem(dbPlans, 'platform')
  const plans = buildPlatformPreviewPlans(platformDb, cycle)
  const catalogType = normalizePlanTypeForCatalog(planType, system)
  let match = plans.find((plan) => plan.plan_type === planType)
  if (!match && catalogType !== planType) {
    match = plans.find((plan) => plan.plan_type === catalogType)
  }

  if (!match && cycle !== 'lifetime' && String(planType).startsWith('lifetime_')) {
    match = buildPlatformPreviewPlans(filterCatalogPlansBySystem(dbPlans, 'platform'), 'lifetime').find(
      (plan) => plan.plan_type === catalogType || plan.plan_type === planType,
    )
  }

  return match || null
}

export function getCatalogPlanPrice(planType, system = 'platform', dbPlans = [], billingCycle = 'monthly', options = {}) {
  if (!planType) return null

  const hints = getSubscriptionPriceHints(options.subscriptions || [], system, billingCycle)
  if (hints[planType]?.price != null) return hints[planType].price

  const merged = findMergedPlanInCatalog(planType, system, billingCycle, dbPlans, options)
  if (merged?.price != null) return Number(merged.price)

  const catalogRow = findCatalogPlanRow(planType, system, billingCycle, dbPlans, options)
  if (catalogRow?.price != null) return Number(catalogRow.price)

  if (planType === 'enterprise' || planType === 'lifetime_enterprise') return null

  return null
}

function formatAmountDisplay(amount, currency = 'USD', billingCycle = 'monthly', isLifetime = false) {
  if (amount == null) return null
  if (Number(amount) === 0) return 'Free'

  const formatted = formatCurrency(Number(amount), currency)
  if (billingCycle === 'yearly') return `${formatted}/yr`
  if (billingCycle === 'lifetime' || isLifetime) return formatted
  return `${formatted}/mo`
}

export function resolveSubscriptionAmount(row, dbPlans = [], subscriptions = []) {
  const paid = row?.amount_paid
  if (paid != null && paid !== '' && Number.isFinite(Number(paid))) {
    return Number(paid)
  }

  const system = row?.target_system || 'platform'
  const billingCycle = row?.billing_cycle || 'monthly'
  return getCatalogPlanPrice(
    row?.plan_type,
    system,
    dbPlans,
    billingCycle,
    { isLifetime: row?.is_lifetime, subscriptions },
  )
}

export function formatSubscriptionAmount(row, dbPlans = [], subscriptions = []) {
  const system = row?.target_system || 'platform'
  const billingCycle = row?.billing_cycle || 'monthly'
  const currency = row?.currency || 'USD'
  const isLifetime = Boolean(row?.is_lifetime)

  const paid = row?.amount_paid
  if (paid != null && paid !== '' && Number.isFinite(Number(paid))) {
    return formatAmountDisplay(Number(paid), currency, billingCycle, isLifetime)
  }

  const plan = findMergedPlanInCatalog(
    row?.plan_type,
    system,
    billingCycle,
    dbPlans,
    { isLifetime, subscriptions },
  )

  if (plan) return formatPreviewPrice(plan, billingCycle)

  const amount = resolveSubscriptionAmount(row, dbPlans, subscriptions)

  if (amount == null) {
    if (row?.plan_type === 'enterprise' || String(row?.plan_type || '').includes('enterprise')) {
      return 'Custom'
    }
    return '—'
  }

  return formatAmountDisplay(amount, currency, billingCycle, isLifetime) || '—'
}

export function formatSubscriptionPlanLabel(row, dbPlans = [], subscriptions = []) {
  if (!row?.plan_type) return '—'

  const system = row.target_system || 'platform'
  const billingCycle = row.billing_cycle || 'monthly'
  const merged = findMergedPlanInCatalog(
    row.plan_type,
    system,
    billingCycle,
    dbPlans,
    { isLifetime: row.is_lifetime, subscriptions },
  )
  if (merged?.name) return merged.name

  const catalogRow = findCatalogPlanRow(
    row.plan_type,
    system,
    billingCycle,
    dbPlans,
    { isLifetime: row.is_lifetime },
  )
  if (catalogRow?.plan_name) {
    return catalogRow.plan_name.replace(/\s+(Monthly|Yearly|Lifetime)$/i, '').trim() || catalogRow.plan_name
  }

  return formatPlanLabel(row.plan_type)
}

/**
 * Feature dropdown options from subscription_plans.features (database catalog only).
 */
export function buildSubscriptionFeatureOptions({
  targetSystem = 'platform',
  billingCycle = 'monthly',
  planType = null,
  dbPlans = [],
  useRelaxedPlanFilter = false,
} = {}) {
  const filterPlans = useRelaxedPlanFilter ? filterPlansForFeatureOptions : filterCatalogPlansBySystem
  const systemPlans = filterPlans(dbPlans, targetSystem)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const orderedPlans = planType
    ? [
      ...systemPlans.filter((row) => planMatchesCatalogRow(row, planType, targetSystem)),
      ...systemPlans.filter((row) => !planMatchesCatalogRow(row, planType, targetSystem)),
    ]
    : systemPlans

  const entries = new Map()
  let sortIndex = 0

  for (const row of orderedPlans) {
    const preview = mapDbPlanToPreview(row)
    if (!preview) continue
    for (const feature of preview.features || []) {
      const label = String(feature ?? '').trim()
      if (!label || entries.has(label)) continue
      entries.set(label, {
        value: label,
        label,
        description: `${preview.name} plan`,
        category: preview.name,
        sortOrder: sortIndex,
      })
      sortIndex += 1
    }
  }

  return Array.from(entries.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  )
}

export function buildFeatureCatalogTableOptions(catalogRows = []) {
  const entries = new Map()
  for (const row of catalogRows || []) {
    const label = String(row.feature_label ?? row.feature_key ?? '').trim()
    if (!label || entries.has(label)) continue
    entries.set(label, {
      value: label,
      label,
      description: row.description || undefined,
      category: row.category || undefined,
      sortOrder: row.sort_order ?? 0,
    })
  }
  return Array.from(entries.values())
}

export function mergeFeatureEditorOptions(...lists) {
  const entries = new Map()
  let sortIndex = 0
  for (const list of lists) {
    for (const opt of list || []) {
      const label = String(opt?.value ?? opt?.label ?? '').trim()
      if (!label || entries.has(label)) continue
      entries.set(label, {
        value: label,
        label: String(opt.label ?? label),
        description: opt.description,
        category: opt.category,
        sortOrder: opt.sortOrder ?? sortIndex,
      })
      sortIndex += 1
    }
  }
  return Array.from(entries.values()).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label),
  )
}

export function systemsForCatalogScope(catalogScope = 'platform') {
  if (catalogScope === 'both') return ['platform', 'simulator']
  if (catalogScope === 'simulator') return ['simulator']
  return ['platform']
}

function featureCatalogRowsForScope(rows = [], catalogScope = 'platform', targetSystem = null) {
  const systems = targetSystem ? [targetSystem] : systemsForCatalogScope(catalogScope)
  const allowed = new Set([...systems, 'both'])
  return (rows || []).filter((row) => allowed.has(row.target_system))
}

/** SearchableSelect options for plan catalog forms (feature catalog + existing plan rows). */
export function buildPlanFormFeatureOptions({
  catalogScope = 'platform',
  targetSystem = null,
  billingCycle = 'monthly',
  planType = null,
  dbPlans = [],
  featureCatalogRows = [],
  extraFeatureLabels = [],
} = {}) {
  const systems = targetSystem ? [targetSystem] : systemsForCatalogScope(catalogScope)
  const scopedCatalogRows = featureCatalogRowsForScope(featureCatalogRows, catalogScope, targetSystem)

  const planOptions = systems.flatMap((system) =>
    buildSubscriptionFeatureOptions({
      targetSystem: system,
      billingCycle,
      planType,
      dbPlans,
      useRelaxedPlanFilter: true,
    }),
  )

  const tableOptions = buildFeatureCatalogTableOptions(scopedCatalogRows)
  const persistedOptions = (extraFeatureLabels || [])
    .map((label) => String(label ?? '').trim())
    .filter(Boolean)
    .map((label) => ({ value: label, label }))

  return mergeFeatureEditorOptions(tableOptions, planOptions, persistedOptions)
}

/** Default feature labels from subscription_plans.features for the selected plan. */
export function getDefaultPlanFeatures({
  planType,
  targetSystem = 'platform',
  billingCycle = 'monthly',
  isLifetime = false,
  dbPlans = [],
  subscriptions = [],
} = {}) {
  if (!planType) return []

  const cycle = isLifetime ? 'lifetime' : (billingCycle || 'monthly')
  return getCatalogPlanFeatures(planType, targetSystem, cycle, dbPlans, {
    isLifetime,
    subscriptions,
  })
}

/**
 * Features for the subscription form: saved list when non-empty, otherwise plan defaults.
 * Empty persisted arrays (e.g. after a save with no features) fall back to plan defaults.
 */
export function resolveSubscriptionFormFeatures(record, options = {}) {
  const {
    targetSystem = 'platform',
    planType = null,
    billingCycle = 'monthly',
    isLifetime = false,
    dbPlans = [],
    subscriptions = [],
  } = options

  const savedList = record ? parseSubscriptionFeatures(record) : []
  const effectivePlanType = planType || record?.plan_type
  const defaults = getDefaultPlanFeatures({
    planType: effectivePlanType,
    targetSystem,
    billingCycle: record?.billing_cycle || billingCycle,
    isLifetime: record?.is_lifetime ?? isLifetime,
    dbPlans,
    subscriptions,
  })

  const features = savedList.length > 0 ? savedList : defaults
  return normalizeFeatureEditorRows(features.length > 0 ? features : [''])
}

export function formatPreviewPrice(plan, billingCycle) {
  if (plan.price == null) return 'Contact us'
  if (Number(plan.price) === 0) return 'Free'

  const currency = plan.currency || 'USD'
  const amount = Number(plan.price)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)

  if (plan.billing_cycle === 'lifetime' || billingCycle === 'lifetime') {
    return formatted
  }
  if (billingCycle === 'yearly' || plan.billing_cycle === 'yearly') {
    return `${formatted}/yr`
  }
  return `${formatted}/mo`
}

export function getPreviewDiscount(plan) {
  return discountPercent(plan.price, plan.original_price)
}

function formatLimitValue(limit, { unlimitedLabel = 'Unlimited' } = {}) {
  if (limit == null) return unlimitedLabel
  return String(limit)
}

/**
 * Build feature/limit comparison rows from catalog plans (no hardcoded matrix).
 * Cell values are strings for limits or booleans for feature inclusion.
 */
export function buildPricingComparisonRows(plans = []) {
  if (!plans.length) return []

  const rows = []

  if (plans.some((plan) => plan.project_limit != null)) {
    rows.push({
      label: 'Projects',
      values: plans.map((plan) => formatLimitValue(plan.project_limit)),
    })
  }

  if (plans.some((plan) => plan.member_limit != null)) {
    rows.push({
      label: 'Team members',
      values: plans.map((plan) => formatLimitValue(plan.member_limit, { unlimitedLabel: '—' })),
    })
  }

  const featureOrder = []
  const featureFlags = new Map()

  plans.forEach((plan, planIndex) => {
    for (const feature of plan.features || []) {
      const label = String(feature ?? '').trim()
      if (!label) continue
      if (MEMBER_LIMIT_FEATURE_RE.test(label)) continue
      if (PROJECT_LIMIT_FEATURE_RES.some((re) => re.test(label))) continue
      if (!featureFlags.has(label)) {
        featureFlags.set(label, plans.map(() => false))
        featureOrder.push(label)
      }
      featureFlags.get(label)[planIndex] = true
    }
  })

  for (const label of featureOrder) {
    rows.push({ label, values: featureFlags.get(label) })
  }

  return rows
}
