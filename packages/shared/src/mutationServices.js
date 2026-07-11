import { getAdminDb, getPublicDb, getSimDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'
import { fetchAllSubscriptionPlans, fetchSubscriptionPlansCatalog } from './dataServices.js'
import { normalizePlanTypeForCatalog } from './subscriptionPreviewCatalog.js'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

// ─── Phase 1: Admin Management ───────────────────────────────────────────────

export async function inviteAdminUser(email, role, message, expiryHours = 72) {
  const invitedBy = await getCurrentAdminUserId()
  return rpc('invite_admin_user', {
    p_email: email,
    p_role: role,
    p_message: message,
    p_expiry_hours: expiryHours,
    p_invited_by_id: invitedBy,
  })
}

export async function activateAdminUser(adminUserId) {
  return rpc('activate_admin_user', {
    p_admin_user_id: adminUserId,
    p_activated_by_id: await getCurrentAdminUserId(),
  })
}

export async function rejectAdminUser(adminUserId, reason) {
  return rpc('reject_admin_user', {
    p_admin_user_id: adminUserId,
    p_reason: reason,
    p_rejected_by_id: await getCurrentAdminUserId(),
  })
}

export async function suspendAdminUser(adminUserId, reason) {
  return rpc('suspend_admin_user', {
    p_admin_user_id: adminUserId,
    p_reason: reason,
    p_suspended_by_id: await getCurrentAdminUserId(),
  })
}

export async function reactivateAdminUser(adminUserId) {
  return rpc('reactivate_admin_user', {
    p_admin_user_id: adminUserId,
    p_reactivated_by_id: await getCurrentAdminUserId(),
  })
}

export async function deactivateAdminUser(adminUserId) {
  return rpc('deactivate_admin_user', {
    p_admin_user_id: adminUserId,
    p_deactivated_by_id: await getCurrentAdminUserId(),
  })
}

export async function updateAdminRole(adminUserId, newRole) {
  return rpc('update_admin_role', {
    p_admin_user_id: adminUserId,
    p_new_role: newRole,
    p_changed_by_id: await getCurrentAdminUserId(),
  })
}

export async function updateAdminUser(adminUserId, updates) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db
    .from('admin_users')
    .update({ full_name: updates.full_name, requires_2fa: updates.requires_2fa, updated_at: new Date().toISOString() })
    .eq('id', adminUserId)
    .select()
    .single()
  if (updates.role && updates.role !== data?.role) {
    return updateAdminRole(adminUserId, updates.role)
  }
  return { data, error: error?.message || null }
}

export async function updateRolePermissions(role, permissionKeys) {
  return rpc('update_role_permissions', {
    p_role: role,
    p_permission_keys: permissionKeys,
    p_changed_by_id: await getCurrentAdminUserId(),
  })
}

export async function terminateAdminSession(sessionId) {
  return rpc('terminate_admin_session', {
    p_session_id: sessionId,
    p_terminated_by_id: await getCurrentAdminUserId(),
  })
}

export async function resetAdmin2fa(adminUserId) {
  return rpc('reset_admin_2fa', {
    p_admin_user_id: adminUserId,
    p_reset_by_id: await getCurrentAdminUserId(),
  })
}

// ─── Phase 2: Users & Organisations ──────────────────────────────────────────

export async function deactivatePlatformUser(userId, reason) {
  return rpc('deactivate_platform_user', {
    p_user_id: userId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export { suspendPlatformUser, uploadSuspensionAttachments } from './userSuspensionServices.js'

export async function reactivatePlatformUser(userId) {
  return rpc('reactivate_platform_user', {
    p_user_id: userId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function resetUserPassword(userId) {
  return rpc('reset_user_password', {
    p_user_id: userId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function verifyOrganisation(accountId) {
  return rpc('verify_organisation', {
    p_account_id: accountId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function suspendOrganisation(accountId, reason) {
  return rpc('suspend_organisation', {
    p_account_id: accountId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export async function startImpersonation(targetUserId, targetSystem, reason) {
  return rpc('start_impersonation', {
    p_admin_user_id: await getCurrentAdminUserId(),
    p_target_user_id: targetUserId,
    p_target_system: targetSystem,
    p_reason: reason,
  })
}

export async function endImpersonation(impersonationId) {
  return rpc('end_impersonation', { p_impersonation_id: impersonationId })
}

// ─── Phase 3: Subscriptions & Revenue ────────────────────────────────────────

export async function createSubscription(payload) {
  return rpc('admin_create_subscription', {
    p_target_system: payload.targetSystem,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_user_id: payload.userId,
    p_plan_type: payload.planType,
    p_status: payload.status,
    p_billing_cycle: payload.billingCycle || 'monthly',
    p_amount_paid: payload.amountPaid ?? null,
    p_currency: payload.currency || 'USD',
    p_started_at: payload.startedAt || null,
    p_expires_at: payload.expiresAt || null,
    p_trial_end: payload.trialEnd || null,
    p_next_billing_date: payload.nextBillingDate || null,
    p_account_id: payload.accountId || null,
    p_is_lifetime: payload.isLifetime ?? false,
    p_reason: payload.reason || null,
    p_features: Array.isArray(payload.features) ? payload.features : [],
  })
}

export async function updateSubscription(payload) {
  return rpc('admin_update_subscription', {
    p_subscription_id: payload.subscriptionId,
    p_target_system: payload.targetSystem,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_plan_type: payload.planType,
    p_status: payload.status,
    p_billing_cycle: payload.billingCycle || null,
    p_amount_paid: payload.amountPaid ?? null,
    p_currency: payload.currency || null,
    p_started_at: payload.startedAt || null,
    p_expires_at: payload.expiresAt ?? null,
    p_trial_end: payload.trialEnd ?? null,
    p_next_billing_date: payload.nextBillingDate ?? null,
    p_account_id: payload.accountId ?? null,
    p_is_lifetime: payload.isLifetime ?? null,
    p_reason: payload.reason || null,
    p_features: Array.isArray(payload.features) ? payload.features : [],
  })
}

export async function deleteSubscription(subscriptionId, targetSystem, reason) {
  return rpc('admin_delete_subscription', {
    p_subscription_id: subscriptionId,
    p_target_system: targetSystem,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export async function updateSubscriptionStatus(subscriptionId, targetSystem, newStatus, reason) {
  return rpc('admin_update_subscription_status', {
    p_subscription_id: subscriptionId,
    p_target_system: targetSystem,
    p_new_status: newStatus,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function extendSubscriptionTrial(subscriptionId, targetSystem, extensionDays, reason) {
  return rpc('admin_extend_subscription_trial', {
    p_subscription_id: subscriptionId,
    p_target_system: targetSystem,
    p_extension_days: extensionDays,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updatePricingPlan(planId, targetSystem, newPrice, effectiveDate, reason) {
  return rpc('record_pricing_change', {
    p_plan_id: planId,
    p_target_system: targetSystem,
    p_new_price: newPrice,
    p_effective_date: effectiveDate,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_change_reason: reason,
  })
}

export async function syncSubscriptionPlanCatalogPrice({
  planType,
  billingCycle,
  targetSystem = 'platform',
  newPrice,
  reason,
}) {
  if (newPrice == null || newPrice === '' || !planType || !billingCycle) {
    return { data: null, error: null }
  }

  const parsedPrice = Number(newPrice)
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return { data: null, error: 'Invalid catalog price.' }
  }

  const catalogPlanType = normalizePlanTypeForCatalog(planType, targetSystem)
  const catalogBillingCycle = (
    billingCycle === 'lifetime'
    || catalogPlanType === 'lifetime'
    || String(planType || '').startsWith('lifetime_')
  ) ? 'lifetime' : billingCycle

  if (parsedPrice === 0 && catalogPlanType !== 'free') {
    return { data: null, error: null }
  }

  const { data: plans, error: fetchError } = await fetchAllSubscriptionPlans()
  if (fetchError) return { data: null, error: fetchError }

  const candidates = (plans || []).filter((plan) => {
    if (plan.plan_type !== catalogPlanType || plan.billing_cycle !== catalogBillingCycle) return false
    const scope = plan.catalog_scope || 'both'
    if (targetSystem === 'simulator') {
      return plan.simulator_included !== false && scope === 'simulator'
    }
    return plan.platform_included !== false && (scope === 'platform' || scope === 'both')
  })

  const preferredScope = targetSystem === 'simulator' ? 'simulator' : 'platform'
  const match = candidates.find((plan) => plan.catalog_scope === preferredScope)
    || candidates.find((plan) => (plan.catalog_scope || 'both') === 'both')
    || candidates[0]
  if (!match) return { data: null, error: null }
  if (Number(match.price) === parsedPrice && match.is_active !== false) return { data: match, error: null }

  const adminUserId = await getCurrentAdminUserId()
  const syncResult = await rpc('sync_subscription_plan_price', {
    p_plan_type: catalogPlanType,
    p_billing_cycle: catalogBillingCycle,
    p_new_price: parsedPrice,
    p_admin_user_id: adminUserId,
    p_reason: reason || 'Synced subscription amount to plan catalog',
    p_catalog_scope: targetSystem === 'simulator' ? 'simulator' : 'platform',
  })
  if (!syncResult.error) return syncResult

  return updatePricingPlan(
    match.id,
    targetSystem,
    parsedPrice,
    new Date().toISOString(),
    reason || 'Synced subscription amount to plan catalog',
  )
}

export async function publishSubscriptionPlanToCatalog({
  planType,
  billingCycle,
  targetSystem = 'platform',
  newPrice,
  reason,
}) {
  if (newPrice == null || newPrice === '' || !planType || !billingCycle) {
    return { data: null, error: null }
  }

  const parsedPrice = Number(newPrice)
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return { data: null, error: null }
  }

  const catalogPlanType = normalizePlanTypeForCatalog(planType, targetSystem)
  const catalogBillingCycle = (
    billingCycle === 'lifetime'
    || catalogPlanType === 'lifetime'
    || String(planType || '').startsWith('lifetime_')
  ) ? 'lifetime' : billingCycle

  if (catalogPlanType === 'free') {
    return { data: null, error: null }
  }

  const adminUserId = await getCurrentAdminUserId()
  return rpc('publish_subscription_plan_catalog', {
    p_plan_type: catalogPlanType,
    p_billing_cycle: catalogBillingCycle,
    p_new_price: parsedPrice,
    p_catalog_scope: targetSystem === 'simulator' ? 'simulator' : 'platform',
    p_admin_user_id: adminUserId,
    p_reason: reason || 'Published subscription plan to public pricing catalog',
  })
}

export async function setSubscriptionPlanCatalogActive(planId, isActive, reason) {
  return rpc('set_subscription_plan_catalog_active', {
    p_plan_id: planId,
    p_is_active: Boolean(isActive),
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason || null,
  })
}

export async function createSubscriptionPlan(planData, reason) {
  const adminUserId = await getCurrentAdminUserId()
  return rpc('create_subscription_plan', {
    p_plan_name: planData.plan_name,
    p_plan_type: planData.plan_type,
    p_billing_cycle: planData.billing_cycle,
    p_catalog_scope: planData.catalog_scope,
    p_price: planData.price,
    p_original_price: planData.original_price ?? null,
    p_currency: planData.currency || 'USD',
    p_member_limit: planData.member_limit ?? null,
    p_project_limit: planData.project_limit ?? null,
    p_additional_member_price: planData.additional_member_price ?? null,
    p_features: planData.features ?? [],
    p_platform_included: planData.platform_included ?? true,
    p_simulator_included: planData.simulator_included ?? false,
    p_is_popular: planData.is_popular ?? false,
    p_is_active: planData.is_active ?? true,
    p_display_order: planData.display_order ?? 0,
    p_admin_user_id: adminUserId,
    p_reason: reason || null,
  })
}

export async function updateSubscriptionPlan(planId, planData, reason) {
  const adminUserId = await getCurrentAdminUserId()
  return rpc('update_subscription_plan', {
    p_plan_id: planId,
    p_plan_name: planData.plan_name,
    p_price: planData.price,
    p_original_price: planData.original_price ?? null,
    p_currency: planData.currency || null,
    p_member_limit: planData.member_limit ?? null,
    p_project_limit: planData.project_limit ?? null,
    p_additional_member_price: planData.additional_member_price ?? null,
    p_features: planData.features ?? null,
    p_platform_included: planData.platform_included ?? null,
    p_simulator_included: planData.simulator_included ?? null,
    p_is_popular: planData.is_popular ?? null,
    p_is_active: planData.is_active ?? null,
    p_display_order: planData.display_order ?? null,
    p_admin_user_id: adminUserId,
    p_reason: reason || null,
  })
}

export async function deleteSubscriptionPlan(planId, reason) {
  return rpc('delete_subscription_plan', {
    p_plan_id: planId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason || null,
  })
}

// ─── Phase 4: Support ──────────────────────────────────────────────────────────

export async function createTicketReply(ticketId, message, isInternal = false) {
  return rpc('create_ticket_reply', {
    p_ticket_id: ticketId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_message: message,
    p_is_internal: isInternal,
  })
}

export async function updateTicketStatus(ticketId, newStatus) {
  return rpc('update_ticket_status', {
    p_ticket_id: ticketId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_new_status: newStatus,
  })
}

export async function updateTicketPriority(ticketId, newPriority) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.from('support_tickets').update({ priority: newPriority }).eq('id', ticketId).select().single()
  return { data, error: error?.message || null }
}

export async function assignTicket(ticketId, assignedToId) {
  return rpc('assign_ticket', {
    p_ticket_id: ticketId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_assigned_to_id: assignedToId,
  })
}

export async function createAnnouncement(data) {
  return rpc('create_announcement', {
    p_title: data.title,
    p_body: data.body,
    p_type: data.announcement_type || data.type,
    p_audience: data.target_audience || data.audience,
    p_publish_at: data.publish_at,
    p_expires_at: data.expires_at,
    p_created_by: await getCurrentAdminUserId(),
  })
}

export async function updateAnnouncement(id, data) {
  return rpc('update_announcement', {
    p_id: id,
    p_updates: data,
    p_updated_by: await getCurrentAdminUserId(),
  })
}

export async function publishAnnouncement(id) {
  return rpc('publish_announcement', {
    p_id: id,
    p_published_by: await getCurrentAdminUserId(),
  })
}

export async function archiveAnnouncement(id) {
  return updateAnnouncement(id, { status: 'archived' })
}

// ─── Feedback: Bug reports ───────────────────────────────────────────────────

export async function updateBugReport(bugId, updates) {
  return rpc('update_bug_report', {
    p_bug_id: bugId,
    p_updates: updates,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function rejectBugReport(bugId, reason) {
  return rpc('reject_bug_report', {
    p_bug_id: bugId,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function assignBugReport(bugId, assigneeAdminUserId) {
  return updateBugReport(bugId, { assignee_admin_user_id: assigneeAdminUserId })
}

export async function setBugReportStatus(bugId, status, resolutionNotes = null) {
  const updates = { status }
  if (resolutionNotes) updates.resolution_notes = resolutionNotes
  return updateBugReport(bugId, updates)
}

// ─── Feedback: Feature requests ──────────────────────────────────────────────

export async function updateFeatureRequest(requestId, updates) {
  return rpc('update_feature_request', {
    p_request_id: requestId,
    p_updates: updates,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function declineFeatureRequest(requestId, reason) {
  return rpc('decline_feature_request', {
    p_request_id: requestId,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function assignFeatureRequest(requestId, assigneeAdminUserId) {
  return updateFeatureRequest(requestId, { assignee_admin_user_id: assigneeAdminUserId })
}

export async function setFeatureRequestStatus(requestId, status, implementationNotes = null) {
  const updates = { status }
  if (implementationNotes) updates.implementation_notes = implementationNotes
  return updateFeatureRequest(requestId, updates)
}

// ─── Phase 5: System ─────────────────────────────────────────────────────────

export async function updateSystemSetting(key, value) {
  return rpc('update_system_setting', {
    p_key: key,
    p_value: value,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createFeatureFlag(data) {
  return rpc('create_feature_flag', {
    p_key: data.flag_key,
    p_name: data.flag_name,
    p_description: data.description,
    p_applies_to: data.applies_to,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleFeatureFlag(flagId) {
  return rpc('toggle_feature_flag', {
    p_flag_id: flagId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteFeatureFlag(flagId) {
  return rpc('delete_feature_flag', {
    p_flag_id: flagId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createMaintenanceWindow(data) {
  return rpc('create_maintenance_window', {
    p_target: data.target_system,
    p_message: data.message,
    p_start: data.scheduled_start,
    p_end: data.scheduled_end,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function activateMaintenanceWindow(windowId) {
  return rpc('activate_maintenance_window', {
    p_window_id: windowId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function completeMaintenanceWindow(windowId) {
  return rpc('complete_maintenance_window', {
    p_window_id: windowId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelMaintenanceWindow(windowId) {
  return rpc('cancel_maintenance_window', {
    p_window_id: windowId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleMaintenanceMode(targetSystem, enabled, message) {
  return rpc('toggle_maintenance_mode', {
    p_target_system: targetSystem,
    p_enabled: enabled,
    p_message: message,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Phase 6: Errors ─────────────────────────────────────────────────────────

export async function updateErrorStatus(errorAggId, newStatus, notes) {
  return rpc('update_error_status', {
    p_error_agg_id: errorAggId,
    p_new_status: newStatus,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_notes: notes,
  })
}

export async function updateErrorSeverity(errorAggId, newSeverity) {
  return rpc('update_error_severity', {
    p_error_agg_id: errorAggId,
    p_new_severity: newSeverity,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createErrorAlertRule(data) {
  return rpc('create_error_alert_rule', {
    p_data: data,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateErrorAlertRule(ruleId, data) {
  return rpc('update_error_alert_rule', {
    p_rule_id: ruleId,
    p_data: data,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteErrorAlertRule(ruleId) {
  return rpc('delete_error_alert_rule', {
    p_rule_id: ruleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Phase 7: Simulator ──────────────────────────────────────────────────────

export async function updateSimScenario(scenarioId, data) {
  return rpc('update_sim_scenario', {
    p_scenario_id: scenarioId,
    p_updates: data,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function revokeSimCertificate(certId, reason) {
  return rpc('revoke_sim_certificate', {
    p_cert_id: certId,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export async function resetLeaderboardEntries(scenarioId) {
  return rpc('reset_leaderboard_entries', {
    p_scenario_id: scenarioId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Phase 8: Audit ──────────────────────────────────────────────────────────

export function exportAuditLog(rows, format = 'csv') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `audit-log-${Date.now()}.json`)
    return { data: true, error: null }
  }
  const headers = ['id', 'action', 'admin_role', 'target_type', 'target_id', 'created_at']
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  downloadBlob(blob, `audit-log-${Date.now()}.csv`)
  return { data: true, error: null }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Phase 9: Dashboard ────────────────────────────────────────────────────────

export async function fetchDashboardStats(role) {
  return rpc('get_dashboard_stats', { p_admin_role: role })
}

// ─── Currency & Country Management ───────────────────────────────────────────

export async function createCurrency(data) {
  return rpc('create_currency', {
    p_currency_code: data.currency_code,
    p_currency_name: data.currency_name,
    p_symbol: data.symbol,
    p_symbol_position: data.symbol_position || 'prefix',
    p_decimal_places: data.decimal_places ?? 2,
    p_is_active: data.is_active ?? true,
    p_is_base: data.is_base ?? false,
    p_sort_order: data.sort_order ?? 0,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateCurrency(currencyId, data) {
  return rpc('update_currency', {
    p_currency_id: currencyId,
    p_currency_name: data.currency_name,
    p_symbol: data.symbol,
    p_symbol_position: data.symbol_position,
    p_decimal_places: data.decimal_places,
    p_is_active: data.is_active,
    p_is_base: data.is_base,
    p_sort_order: data.sort_order,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteCurrency(currencyId, reason) {
  return rpc('delete_currency', {
    p_currency_id: currencyId,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createExchangeRate(data) {
  return rpc('create_exchange_rate', {
    p_from_currency: data.from_currency,
    p_to_currency: data.to_currency,
    p_rate: data.rate,
    p_effective_from: data.effective_from || new Date().toISOString(),
    p_source: data.source || 'manual',
    p_source_detail: data.source_detail || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateExchangeRate(rateId, data) {
  return rpc('update_exchange_rate', {
    p_rate_id: rateId,
    p_rate: data.rate,
    p_effective_from: data.effective_from,
    p_source: data.source,
    p_source_detail: data.source_detail,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createCountry(data) {
  return rpc('create_country', {
    p_country_code: data.country_code,
    p_country_name: data.country_name,
    p_iso3_code: data.iso3_code || null,
    p_phone_code: data.phone_code || null,
    p_default_currency: data.default_currency || null,
    p_region: data.region || null,
    p_platform_allowed: data.platform_allowed ?? true,
    p_simulator_allowed: data.simulator_allowed ?? true,
    p_platform_reason: data.platform_reason || null,
    p_simulator_reason: data.simulator_reason || null,
    p_sort_order: data.sort_order ?? 0,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateCountry(countryId, data) {
  return rpc('update_country', {
    p_country_id: countryId,
    p_country_name: data.country_name,
    p_iso3_code: data.iso3_code,
    p_phone_code: data.phone_code,
    p_default_currency: data.default_currency,
    p_region: data.region,
    p_platform_allowed: data.platform_allowed,
    p_simulator_allowed: data.simulator_allowed,
    p_platform_reason: data.platform_reason,
    p_simulator_reason: data.simulator_reason,
    p_sort_order: data.sort_order,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteCountry(countryId, reason) {
  return rpc('delete_country', {
    p_country_id: countryId,
    p_reason: reason,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleCountrySystem(countryId, system, allowed, reason) {
  return rpc('toggle_country_system', {
    p_country_id: countryId,
    p_system: system,
    p_allowed: allowed,
    p_reason: reason || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── ID Generation ───────────────────────────────────────────────────────────

export const DISPLAY_ID_KEYSPACE_EXHAUSTED_PREFIX = 'ID_KEYSPACE_EXHAUSTED:'
export const DISPLAY_ID_KEYSPACE_TOO_SMALL_PREFIX = 'ID_KEYSPACE_TOO_SMALL:'
export const ID_ABBREVIATION_IN_USE_PREFIX = 'ID_ABBREVIATION_IN_USE:'

export function isDisplayIdKeyspaceExhausted(error) {
  return String(error || '').includes(DISPLAY_ID_KEYSPACE_EXHAUSTED_PREFIX)
}

export function formatDisplayIdError(error) {
  const message = typeof error === 'string' ? error : error?.message || String(error || '')
  if (message.includes(DISPLAY_ID_KEYSPACE_EXHAUSTED_PREFIX)) {
    return 'This table\'s ID format has run out of unique codes. Contact a system admin to widen the format (more letters/digits, fewer excluded characters, or mixed letter case).'
  }
  if (message.includes(DISPLAY_ID_KEYSPACE_TOO_SMALL_PREFIX)) {
    return message.replace(DISPLAY_ID_KEYSPACE_TOO_SMALL_PREFIX, '').trim()
      || 'The configured format cannot cover the table\'s current row count. Widen the format before saving.'
  }
  if (message.includes(ID_ABBREVIATION_IN_USE_PREFIX)) {
    return message.replace(ID_ABBREVIATION_IN_USE_PREFIX, '').trim()
      || 'This abbreviation is already in use. Choose a unique abbreviation.'
  }
  return message
}

function idRuleParams(data, adminUserId) {
  return {
    p_target_table: data.target_table,
    p_table_abbreviation: data.table_abbreviation,
    p_table_description: data.table_description ?? null,
    p_separator: data.separator ?? '-',
    p_suffix: data.suffix ?? '',
    p_letter_case: data.letter_case ?? 'uppercase',
    p_segment_type: data.segment_type ?? 'alphanumeric',
    p_num_letters: data.num_letters ?? 3,
    p_num_digits: data.num_digits ?? 4,
    p_excluded_chars: data.excluded_chars ?? '',
    p_seed_value: data.seed_value ?? 1,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: adminUserId,
  }
}

export async function createIdGenerationRule(data) {
  const result = await rpc('create_id_generation_rule', idRuleParams(data, await getCurrentAdminUserId()))
  return { ...result, error: result.error ? formatDisplayIdError(result.error) : null }
}

export async function updateIdGenerationRule(ruleId, data) {
  const result = await rpc('update_id_generation_rule', {
    p_rule_id: ruleId,
    ...idRuleParams(data, await getCurrentAdminUserId()),
  })
  return { ...result, error: result.error ? formatDisplayIdError(result.error) : null }
}

export async function deleteIdGenerationRule(ruleId) {
  return rpc('delete_id_generation_rule', {
    p_rule_id: ruleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleIdGenerationRule(ruleId) {
  return rpc('toggle_id_generation_rule', {
    p_rule_id: ruleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function bulkSeedIdGenerationRules(opts = {}) {
  const result = await rpc('bulk_seed_id_generation_rules', {
    p_schema_filter: opts.schema ?? null,
    p_dry_run: opts.dryRun ?? false,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
  return { ...result, data: result.data ?? null }
}

export async function generateDisplayId(tableName, recordId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('generate_display_id', {
    p_table: tableName,
    p_record_id: recordId,
  })
  const rawError = error?.message || error || null
  return { data, error: rawError ? formatDisplayIdError(rawError) : null }
}

export async function resolveDisplayId(tableName, displayId) {
  return rpc('resolve_display_id', {
    p_table: tableName,
    p_display_id: displayId,
  })
}

export async function bulkResolveDisplayIds(tableName, recordIds) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('bulk_resolve_display_ids', {
    p_table: tableName,
    p_record_ids: recordIds,
  })
  return { data: data || [], error: error?.message || error || null }
}

// ─── Notifications & Alerts ────────────────────────────────────────────────────

export async function markNotificationRead(notificationId) {
  return rpc('mark_notification_read', {
    p_notification_id: notificationId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function markAllNotificationsRead() {
  return rpc('mark_all_read', { p_admin_user_id: await getCurrentAdminUserId() })
}

export async function dismissNotification(notificationId) {
  return rpc('dismiss_notification', {
    p_notification_id: notificationId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createNotificationTemplate(data) {
  return rpc('create_notification_template', {
    p_template_key: data.template_key,
    p_template_name: data.template_name,
    p_body_template: data.body_template,
    p_category: data.category,
    p_channel: data.channel || 'in_app',
    p_subject_template: data.subject_template || null,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateNotificationTemplate(templateId, data) {
  return rpc('update_notification_template', {
    p_template_id: templateId,
    p_template_name: data.template_name,
    p_body_template: data.body_template,
    p_category: data.category,
    p_channel: data.channel,
    p_subject_template: data.subject_template,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteNotificationTemplate(templateId) {
  return rpc('delete_notification_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleNotificationTemplate(templateId) {
  return rpc('toggle_notification_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createAlertRule(data) {
  return rpc('create_alert_rule', {
    p_rule_name: data.rule_name,
    p_rule_key: data.rule_key,
    p_description: data.description || null,
    p_condition_type: data.condition_type,
    p_condition_params: data.condition_params || {},
    p_notification_template_id: data.notification_template_id || null,
    p_target_roles: data.target_roles || [],
    p_target_system: data.target_system || 'all',
    p_is_active: data.is_active ?? true,
    p_check_interval_minutes: data.check_interval_minutes ?? 60,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateAlertRule(ruleId, data) {
  return rpc('update_alert_rule', {
    p_rule_id: ruleId,
    p_rule_name: data.rule_name,
    p_description: data.description,
    p_condition_type: data.condition_type,
    p_condition_params: data.condition_params,
    p_notification_template_id: data.notification_template_id,
    p_target_roles: data.target_roles,
    p_target_system: data.target_system,
    p_is_active: data.is_active,
    p_check_interval_minutes: data.check_interval_minutes,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteAlertRule(ruleId) {
  return rpc('delete_alert_rule', {
    p_rule_id: ruleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleAlertRule(ruleId) {
  return rpc('toggle_alert_rule', {
    p_rule_id: ruleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Email Templates ───────────────────────────────────────────────────────────

export async function createEmailTemplate(data) {
  return rpc('create_email_template', {
    p_template_key: data.template_key,
    p_template_name: data.template_name,
    p_subject: data.subject,
    p_body_html: data.body_html,
    p_category: data.category,
    p_body_text: data.body_text || null,
    p_target_system: data.target_system || 'all',
    p_variables: data.variables || [],
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateEmailTemplate(templateId, data) {
  return rpc('update_email_template', {
    p_template_id: templateId,
    p_template_name: data.template_name,
    p_subject: data.subject,
    p_body_html: data.body_html,
    p_category: data.category,
    p_body_text: data.body_text,
    p_target_system: data.target_system,
    p_variables: data.variables,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteEmailTemplate(templateId) {
  return rpc('delete_email_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleEmailTemplate(templateId) {
  return rpc('toggle_email_template', {
    p_template_id: templateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function sendTestEmail(templateId, recipientEmail) {
  return rpc('send_test_email', {
    p_template_id: templateId,
    p_recipient_email: recipientEmail,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── API Keys & Webhooks ───────────────────────────────────────────────────────

export async function createApiKey(data) {
  return rpc('create_api_key', {
    p_key_name: data.key_name,
    p_permissions: data.permissions || [],
    p_target_system: data.target_system || 'all',
    p_rate_limit_per_minute: data.rate_limit_per_minute ?? 60,
    p_expires_at: data.expires_at || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function revokeApiKey(keyId) {
  return rpc('revoke_api_key', {
    p_api_key_id: keyId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateApiKey(keyId, data) {
  return rpc('update_api_key', {
    p_api_key_id: keyId,
    p_key_name: data.key_name,
    p_permissions: data.permissions,
    p_rate_limit_per_minute: data.rate_limit_per_minute,
    p_expires_at: data.expires_at,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createWebhook(data) {
  return rpc('create_webhook', {
    p_webhook_name: data.webhook_name,
    p_endpoint_url: data.endpoint_url,
    p_events: data.events || [],
    p_target_system: data.target_system || 'all',
    p_retry_count: data.retry_count ?? 3,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateWebhook(webhookId, data) {
  return rpc('update_webhook', {
    p_webhook_id: webhookId,
    p_webhook_name: data.webhook_name,
    p_endpoint_url: data.endpoint_url,
    p_events: data.events,
    p_target_system: data.target_system,
    p_retry_count: data.retry_count,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteWebhook(webhookId) {
  return rpc('delete_webhook', {
    p_webhook_id: webhookId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function toggleWebhook(webhookId) {
  return rpc('toggle_webhook', {
    p_webhook_id: webhookId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function testWebhookDelivery(webhookId, eventType) {
  return rpc('test_webhook_delivery', {
    p_webhook_id: webhookId,
    p_event_type: eventType || 'test.event',
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Reports ───────────────────────────────────────────────────────────────────

export async function createReportDefinition(data) {
  return rpc('create_report_definition', {
    p_report_name: data.report_name,
    p_report_key: data.report_key,
    p_description: data.description || null,
    p_report_type: data.report_type || 'custom',
    p_query_config: data.query_config || {},
    p_chart_type: data.chart_type || 'table',
    p_target_system: data.target_system || 'all',
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateReportDefinition(reportId, data) {
  return rpc('update_report_definition', {
    p_report_id: reportId,
    p_report_name: data.report_name,
    p_description: data.description,
    p_report_type: data.report_type,
    p_query_config: data.query_config,
    p_chart_type: data.chart_type,
    p_target_system: data.target_system,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteReportDefinition(reportId) {
  return rpc('delete_report_definition', {
    p_report_id: reportId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createScheduledReport(data) {
  return rpc('create_scheduled_report', {
    p_report_id: data.report_id,
    p_schedule_type: data.schedule_type,
    p_schedule_config: data.schedule_config || {},
    p_recipients: data.recipients || [],
    p_format: data.format || 'csv',
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateScheduledReport(scheduleId, data) {
  return rpc('update_scheduled_report', {
    p_scheduled_report_id: scheduleId,
    p_schedule_type: data.schedule_type,
    p_schedule_config: data.schedule_config,
    p_recipients: data.recipients,
    p_format: data.format,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteScheduledReport(scheduleId) {
  return rpc('delete_scheduled_report', {
    p_scheduled_report_id: scheduleId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function runReport(reportId) {
  return rpc('run_report', {
    p_report_id: reportId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Billing ───────────────────────────────────────────────────────────────────

export async function createInvoice(data) {
  return rpc('create_invoice', {
    p_user_id: data.user_id,
    p_target_system: data.target_system,
    p_currency: data.currency,
    p_subtotal: data.subtotal,
    p_tax_amount: data.tax_amount ?? 0,
    p_total: data.total ?? null,
    p_tax_rate_applied: data.tax_rate_applied ?? null,
    p_subscription_id: data.subscription_id || null,
    p_due_at: data.due_at || null,
    p_line_items: data.line_items || [],
    p_notes: data.notes || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateInvoice(invoiceId, data) {
  return rpc('update_invoice', {
    p_invoice_id: invoiceId,
    p_subtotal: data.subtotal,
    p_tax_amount: data.tax_amount,
    p_total: data.total,
    p_tax_rate_applied: data.tax_rate_applied,
    p_due_at: data.due_at,
    p_line_items: data.line_items,
    p_notes: data.notes,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function issueInvoice(invoiceId) {
  return rpc('issue_invoice', {
    p_invoice_id: invoiceId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function markInvoicePaid(invoiceId, paymentTransactionId) {
  return rpc('mark_invoice_paid', {
    p_invoice_id: invoiceId,
    p_payment_transaction_id: paymentTransactionId || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelInvoice(invoiceId) {
  return rpc('cancel_invoice', {
    p_invoice_id: invoiceId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createTaxRate(data) {
  return rpc('create_tax_rate', {
    p_country_code: data.country_code,
    p_tax_name: data.tax_name,
    p_rate: data.rate,
    p_is_inclusive: data.is_inclusive ?? false,
    p_applies_to: data.applies_to || 'all',
    p_effective_from: data.effective_from,
    p_effective_to: data.effective_to || null,
    p_is_active: data.is_active ?? true,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateTaxRate(taxRateId, data) {
  return rpc('update_tax_rate', {
    p_tax_rate_id: taxRateId,
    p_tax_name: data.tax_name,
    p_rate: data.rate,
    p_is_inclusive: data.is_inclusive,
    p_applies_to: data.applies_to,
    p_effective_from: data.effective_from,
    p_effective_to: data.effective_to,
    p_is_active: data.is_active,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteTaxRate(taxRateId) {
  return rpc('delete_tax_rate', {
    p_tax_rate_id: taxRateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createRefund(data) {
  return rpc('admin_create_refund', {
    p_invoice_id: data.invoice_id,
    p_amount: data.amount,
    p_reason: data.reason,
    p_currency: data.currency,
    p_payment_transaction_id: data.payment_transaction_id || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateRefund(refundId, data) {
  return rpc('admin_update_refund', {
    p_refund_id: refundId,
    p_amount: data.amount ?? null,
    p_reason: data.reason ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelRefund(refundId) {
  return rpc('admin_cancel_refund', {
    p_refund_id: refundId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function approveRefund(refundId) {
  return rpc('admin_approve_refund', {
    p_refund_id: refundId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function rejectRefund(refundId) {
  return rpc('admin_reject_refund', {
    p_refund_id: refundId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function processRefund(refundId) {
  return rpc('admin_process_refund', {
    p_refund_id: refundId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Localization ──────────────────────────────────────────────────────────────

export async function createSupportedLanguage(data) {
  return rpc('create_supported_language', {
    p_language_code: data.language_code,
    p_language_name: data.language_name,
    p_native_name: data.native_name || null,
    p_is_default: data.is_default ?? false,
    p_is_active: data.is_active ?? true,
    p_target_system: data.target_system || 'all',
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateSupportedLanguage(languageId, data) {
  return rpc('update_supported_language', {
    p_language_id: languageId,
    p_language_name: data.language_name,
    p_native_name: data.native_name,
    p_is_default: data.is_default,
    p_is_active: data.is_active,
    p_target_system: data.target_system,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteSupportedLanguage(languageId) {
  return rpc('delete_supported_language', {
    p_language_id: languageId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createTranslationKey(data) {
  return rpc('create_translation_key', {
    p_translation_key: data.translation_key,
    p_default_value: data.default_value,
    p_context: data.context || null,
    p_category: data.category || null,
    p_target_system: data.target_system || 'all',
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateTranslationKey(keyId, data) {
  return rpc('update_translation_key', {
    p_translation_key_id: keyId,
    p_default_value: data.default_value,
    p_context: data.context,
    p_category: data.category,
    p_target_system: data.target_system,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteTranslationKey(keyId) {
  return rpc('delete_translation_key', {
    p_translation_key_id: keyId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function upsertTranslation(data) {
  return rpc('upsert_translation', {
    p_translation_key_id: data.translation_key_id,
    p_language_code: data.language_code,
    p_translated_value: data.translated_value,
    p_is_reviewed: data.is_reviewed ?? false,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteTranslation(translationId) {
  return rpc('delete_translation', {
    p_translation_id: translationId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

// ─── Cancellation reasons ────────────────────────────────────────────────────

export async function upsertCancellationCategory(data) {
  return rpc('admin_upsert_cancellation_category', {
    p_id: data.id || null,
    p_code: data.code,
    p_label: data.label,
    p_description: data.description || null,
    p_sort_order: data.sort_order ?? 0,
    p_is_active: data.is_active ?? true,
  })
}

export async function deleteCancellationRequest(requestId) {
  return rpc('admin_delete_cancellation_request', {
    p_request_id: requestId,
  })
}
