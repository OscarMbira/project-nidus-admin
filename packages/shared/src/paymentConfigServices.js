import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data: data ?? null, error: error?.message || error || null }
}

async function withAdmin(params = {}) {
  const adminUserId = await getCurrentAdminUserId()
  if (!adminUserId) return params
  return { ...params, p_admin_user_id: adminUserId }
}

const asRows = (data) => (Array.isArray(data) ? data : data ? [data] : [])

// ─── Payment Gateways ────────────────────────────────────────────────────────

export async function listPaymentGateways() {
  const result = await rpc('list_payment_gateways', await withAdmin())
  return { ...result, data: asRows(result.data) }
}

export async function getPaymentGateway(gatewayId) {
  const result = await rpc('get_payment_gateway', await withAdmin({ p_gateway_id: gatewayId }))
  const row = asRows(result.data)[0] ?? null
  if (!result.error && row) {
    return { ...result, data: row }
  }

  const listResult = await listPaymentGateways()
  const fallback = listResult.data?.find((gateway) => gateway.id === gatewayId) ?? null
  if (fallback) {
    const db = getAdminDb()
    if (db) {
      const { data: lifecycleRow } = await db
        .from('payment_gateways')
        .select('record_status, root_record_id')
        .eq('id', gatewayId)
        .maybeSingle()
      return {
        data: {
          ...fallback,
          record_status: lifecycleRow?.record_status || 'live',
          root_record_id: lifecycleRow?.root_record_id || gatewayId,
        },
        error: null,
      }
    }
    return { data: fallback, error: null }
  }

  return { ...result, data: null }
}

export async function createPaymentGateway(data) {
  return rpc('create_payment_gateway', await withAdmin({
    p_name: data.name,
    p_provider_key: data.provider_key,
    p_display_name: data.display_name,
    p_environment: data.environment,
    p_api_key: data.api_key || null,
    p_api_secret: data.api_secret || null,
    p_webhook_secret: data.webhook_secret || null,
    p_is_active: data.is_active ?? false,
    p_is_default: data.is_default ?? false,
    p_metadata: data.metadata || {},
    p_notes: data.notes || null,
  }))
}

export async function updatePaymentGateway(gatewayId, data) {
  return rpc('update_payment_gateway', await withAdmin({
    p_gateway_id: gatewayId,
    p_name: data.name,
    p_display_name: data.display_name,
    p_environment: data.environment,
    p_api_key: data.api_key || null,
    p_api_secret: data.api_secret || null,
    p_webhook_secret: data.webhook_secret || null,
    p_is_active: data.is_active,
    p_is_default: data.is_default,
    p_metadata: data.metadata,
    p_notes: data.notes,
  }))
}

export async function togglePaymentGateway(gatewayId, active) {
  return rpc('toggle_payment_gateway', await withAdmin({ p_gateway_id: gatewayId, p_active: active }))
}

export async function setDefaultPaymentGateway(gatewayId) {
  return rpc('set_default_gateway', await withAdmin({ p_gateway_id: gatewayId }))
}

export async function deletePaymentGateway(gatewayId) {
  return rpc('delete_payment_gateway', await withAdmin({ p_gateway_id: gatewayId }))
}

// ─── Payment Methods ───────────────────────────────────────────────────────────

export async function listPaymentMethods(gatewayId = null) {
  const result = await rpc('list_payment_methods', await withAdmin({
    p_gateway_id: gatewayId || null,
  }))
  return { ...result, data: asRows(result.data) }
}

export async function upsertPaymentMethod(data) {
  return rpc('upsert_payment_method', await withAdmin({
    p_id: data.id || null,
    p_gateway_id: data.gateway_id,
    p_method_type: data.method_type,
    p_display_name: data.display_name,
    p_supported_currencies: data.supported_currencies || ['USD'],
    p_min_amount: data.min_amount ?? 0,
    p_max_amount: data.max_amount ?? null,
    p_fee_type: data.fee_type || 'none',
    p_fee_value: data.fee_value ?? 0,
    p_display_order: data.display_order ?? 0,
    p_is_enabled: data.is_enabled ?? true,
  }))
}

export async function togglePaymentMethod(methodId, enabled) {
  return rpc('toggle_payment_method', await withAdmin({ p_method_id: methodId, p_enabled: enabled }))
}

export async function deletePaymentMethod(methodId) {
  return rpc('delete_payment_method', await withAdmin({ p_method_id: methodId }))
}

// ─── Method Routing ────────────────────────────────────────────────────────────

export async function listRoutingRules() {
  const result = await rpc('list_routing_rules', await withAdmin())
  return { ...result, data: asRows(result.data) }
}

export async function upsertRoutingRule(data) {
  return rpc('upsert_routing_rule', await withAdmin({
    p_id: data.id || null,
    p_display_label: data.display_label,
    p_payment_method_id: data.payment_method_id,
    p_primary_gateway_id: data.primary_gateway_id,
    p_fallback_gateway_id: data.fallback_gateway_id || null,
    p_region_scope: data.region_scope,
    p_supported_countries: data.supported_countries?.length ? data.supported_countries : null,
    p_display_order: data.display_order ?? 0,
    p_is_enabled: data.is_enabled ?? true,
  }))
}

export async function toggleRoutingRule(ruleId, enabled) {
  return rpc('toggle_routing_rule', await withAdmin({ p_rule_id: ruleId, p_enabled: enabled }))
}

export async function reorderRoutingRules(ids) {
  return rpc('reorder_routing_rules', await withAdmin({ p_ids: ids }))
}

export async function deleteRoutingRule(ruleId) {
  return rpc('delete_routing_rule', await withAdmin({ p_rule_id: ruleId }))
}

export async function resolvePaymentMethods(countryCode) {
  const result = await rpc('resolve_payment_methods', await withAdmin({ p_country_code: countryCode }))
  return { ...result, data: asRows(result.data) }
}

// ─── Promo Codes ───────────────────────────────────────────────────────────────

export async function listPromoCodes() {
  const result = await rpc('list_promo_codes', await withAdmin())
  return { ...result, data: asRows(result.data) }
}

export async function getPromoCode(promoId) {
  const result = await rpc('get_promo_code', await withAdmin({ p_promo_code_id: promoId }))
  const row = asRows(result.data)[0] ?? null
  if (!result.error && row) {
    return { ...result, data: row }
  }

  const listResult = await listPromoCodes()
  const fallback = listResult.data?.find((promo) => promo.id === promoId) ?? null
  if (fallback) {
    return { data: fallback, error: null }
  }

  return { ...result, data: null }
}

export async function createPromoCode(data) {
  return rpc('create_promo_code', await withAdmin({
    p_code: data.code,
    p_name: data.name,
    p_description: data.description || null,
    p_discount_type: data.discount_type,
    p_discount_value: data.discount_value,
    p_currency_code: data.currency_code || 'USD',
    p_max_uses: data.max_uses ?? null,
    p_applicable_plan_keys: data.applicable_plan_keys?.length ? data.applicable_plan_keys : null,
    p_valid_from: data.valid_from || null,
    p_valid_until: data.valid_until || null,
    p_is_active: data.is_active ?? true,
  }))
}

export async function updatePromoCode(promoId, data) {
  return rpc('update_promo_code', await withAdmin({
    p_promo_code_id: promoId,
    p_name: data.name,
    p_description: data.description,
    p_discount_type: data.discount_type,
    p_discount_value: data.discount_value,
    p_currency_code: data.currency_code,
    p_max_uses: data.max_uses,
    p_applicable_plan_keys: data.applicable_plan_keys?.length ? data.applicable_plan_keys : null,
    p_valid_from: data.valid_from,
    p_valid_until: data.valid_until,
    p_is_active: data.is_active,
  }))
}

export async function togglePromoCode(promoId, active) {
  return rpc('toggle_promo_code', await withAdmin({ p_promo_code_id: promoId, p_active: active }))
}

export async function deletePromoCode(promoId) {
  return rpc('delete_promo_code', await withAdmin({ p_promo_code_id: promoId }))
}

// ─── Retry Rules ───────────────────────────────────────────────────────────────

export async function listRetryRules() {
  const result = await rpc('list_retry_rules', await withAdmin())
  return { ...result, data: asRows(result.data) }
}

export async function upsertRetryRule(data) {
  return rpc('upsert_retry_rule', await withAdmin({
    p_id: data.id || null,
    p_rule_name: data.rule_name,
    p_gateway_id: data.gateway_id || null,
    p_failure_code: data.failure_code || null,
    p_retry_schedule: data.retry_schedule,
    p_max_attempts: data.max_attempts ?? data.retry_schedule?.length ?? 1,
    p_is_active: data.is_active ?? true,
  }))
}

export async function toggleRetryRule(ruleId, active) {
  return rpc('toggle_retry_rule', await withAdmin({ p_rule_id: ruleId, p_active: active }))
}

export async function deleteRetryRule(ruleId) {
  return rpc('delete_retry_rule', await withAdmin({ p_rule_id: ruleId }))
}

// ─── Settlement Accounts ───────────────────────────────────────────────────────

export async function listSettlementAccounts() {
  const result = await rpc('list_settlement_accounts', await withAdmin())
  return { ...result, data: asRows(result.data) }
}

export async function upsertSettlementAccount(data) {
  return rpc('upsert_settlement_account', await withAdmin({
    p_id: data.id || null,
    p_account_name: data.account_name,
    p_gateway_id: data.gateway_id || null,
    p_bank_name: data.bank_name,
    p_account_number: data.account_number || null,
    p_routing_code: data.routing_code || null,
    p_currency_code: data.currency_code,
    p_account_type: data.account_type || 'checking',
    p_is_default: data.is_default ?? false,
    p_is_active: data.is_active ?? true,
    p_notes: data.notes || null,
  }))
}

export async function toggleSettlementAccount(accountId, active) {
  return rpc('toggle_settlement_account', await withAdmin({ p_account_id: accountId, p_active: active }))
}

export async function setDefaultSettlementAccount(accountId) {
  return rpc('set_default_settlement_account', await withAdmin({ p_account_id: accountId }))
}

export async function deleteSettlementAccount(accountId) {
  return rpc('delete_settlement_account', await withAdmin({ p_account_id: accountId }))
}

// ─── Payment Events (v8.0 visibility) ────────────────────────────────────────

export async function fetchPaymentEvents(filters = {}) {
  const result = await rpc('list_payment_events', await withAdmin({
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_gateway_id: filters.gatewayId || null,
    p_status: filters.status || null,
    p_country_code: filters.countryCode || null,
    p_search: filters.search || null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchPaymentJourney(subscriptionId, targetSystem = 'platform') {
  const result = await rpc('get_payment_journey', await withAdmin({
    p_subscription_id: subscriptionId,
    p_target_system: targetSystem,
  }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchPaymentMonitorStats(from, to) {
  return rpc('get_payment_monitor_stats', await withAdmin({
    p_from: from || null,
    p_to: to || null,
  }))
}

export async function fetchPaymentDashboardKpis(from, to) {
  return rpc('get_payment_dashboard_kpis', await withAdmin({ p_from: from, p_to: to }))
}

export async function fetchPaymentRevenueChart(from, to, granularity = 'daily', methodType = null) {
  const result = await rpc('get_payment_revenue_chart', await withAdmin({
    p_from: from,
    p_to: to,
    p_granularity: granularity,
    p_method_type: methodType,
  }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchPaymentMethodBreakdown(from, to) {
  const result = await rpc('get_payment_method_breakdown', await withAdmin({ p_from: from, p_to: to }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchGatewayPerformance(from, to) {
  const result = await rpc('get_gateway_performance', await withAdmin({ p_from: from, p_to: to }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchPaymentGeographicBreakdown(from, to) {
  const result = await rpc('get_payment_geographic_breakdown', await withAdmin({ p_from: from, p_to: to }))
  return { ...result, data: asRows(result.data) }
}

export async function fetchRecentFailedPayments(limit = 10) {
  const result = await rpc('get_recent_failed_payments', await withAdmin({ p_limit: limit }))
  return { ...result, data: asRows(result.data) }
}

const REPORT_RPC_MAP = {
  payment_summary: 'generate_payment_summary_report',
  failed_payments: 'generate_failed_payments_report',
  gateway_performance: 'generate_gateway_performance_report',
  retry_analytics: 'generate_retry_analytics_report',
  settlement: 'generate_settlement_report',
  promo_redemption: 'generate_promo_redemption_report',
}

async function buildPaymentReportRpcParams(reportType, params = {}) {
  const adminUserId = await getCurrentAdminUserId()
  const base = {
    p_from: params.from,
    p_to: params.to,
    p_admin_user_id: adminUserId,
  }

  switch (reportType) {
    case 'payment_summary':
      return {
        ...base,
        p_granularity: params.granularity || 'daily',
        p_gateway_id: params.gatewayId || null,
        p_country_code: params.countryCode || null,
      }
    case 'failed_payments':
      return {
        ...base,
        p_gateway_id: params.gatewayId || null,
        p_country_code: params.countryCode || null,
      }
    case 'gateway_performance':
    case 'retry_analytics':
    case 'settlement':
    case 'promo_redemption':
      return base
    default:
      return null
  }
}

export async function generatePaymentReport(reportType, params = {}) {
  const fn = REPORT_RPC_MAP[reportType]
  if (!fn) return { data: null, error: `Unknown report type: ${reportType}` }

  const rpcParams = await buildPaymentReportRpcParams(reportType, params)
  if (!rpcParams) return { data: null, error: `Unknown report type: ${reportType}` }

  const result = await rpc(fn, rpcParams)
  return { ...result, data: asRows(result.data) }
}

export function subscribePaymentEvents(onInsert) {
  const db = getAdminDb()
  if (!db) return () => {}

  const channel = db
    .channel('payment-events-monitor')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'admin', table: 'payment_events' },
      (payload) => onInsert?.(payload.new),
    )
    .subscribe()

  return () => {
    db.removeChannel(channel)
  }
}
