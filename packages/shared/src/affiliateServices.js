import { getAdminDb, getPublicDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'

const q = (client, table, select, opts = {}) => {
  if (!client) return Promise.resolve({ data: [], error: null })
  let query = client.from(table).select(select)
  if (opts.order?.column) {
    query = opts.order.asc === false
      ? query.order(opts.order.column, { ascending: false })
      : query.order(opts.order.column)
  }
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.filters) {
    for (const f of opts.filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'gte') query = query.gte(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
    }
  }
  return query
}

async function adminRpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

const thirtyDaysAgo = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

export const fetchAffiliates = (opts = {}) =>
  q(getAdminDb(), 'affiliates', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 500,
    filters: opts.status ? [{ op: 'eq', col: 'status', val: opts.status }] : opts.filters,
  })

export const fetchAffiliateById = (id) =>
  q(getAdminDb(), 'affiliates', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchAffiliateByCode = (code) =>
  q(getAdminDb(), 'affiliates', '*', { filters: [{ op: 'eq', col: 'code', val: code }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchPendingAffiliateApplications = () =>
  fetchAffiliates({ status: 'pending' })

export const fetchAffiliatePayouts = (affiliateId) =>
  q(getAdminDb(), 'affiliate_payouts', '*', {
    filters: affiliateId ? [{ op: 'eq', col: 'affiliate_id', val: affiliateId }] : undefined,
    order: { column: 'period_start', asc: false },
    limit: 500,
  })

export const fetchAllAffiliatePayouts = () => fetchAffiliatePayouts(null)

export async function fetchAffiliateStatsBatch(affiliateCodes = []) {
  const codes = [...new Set(affiliateCodes.filter(Boolean))]
  const empty = Object.fromEntries(codes.map((code) => [code, {
    clicks30d: 0,
    clicksAll: 0,
    conversions30d: 0,
    conversionsAll: 0,
  }]))

  if (!codes.length) return { data: empty, error: null }

  const db = getPublicDb()
  if (!db) return { data: empty, error: null }

  const since = thirtyDaysAgo()
  const [clicksRes, conversionsRes] = await Promise.all([
    q(db, 'affiliate_clicks', 'affiliate_code, created_at', {
      filters: [{ op: 'in', col: 'affiliate_code', val: codes }],
      order: { column: 'created_at', asc: false },
      limit: 2000,
    }),
    q(db, 'affiliate_conversions', 'affiliate_code, created_at', {
      filters: [{ op: 'in', col: 'affiliate_code', val: codes }],
      order: { column: 'created_at', asc: false },
      limit: 2000,
    }),
  ])

  if (clicksRes.error?.message?.includes('affiliate_clicks') || clicksRes.error?.code === '42P01') {
    return { data: empty, error: null }
  }

  const stats = { ...empty }
  for (const row of clicksRes.data || []) {
    const bucket = stats[row.affiliate_code]
    if (!bucket) continue
    bucket.clicksAll += 1
    if (row.created_at >= since) bucket.clicks30d += 1
  }
  for (const row of conversionsRes.data || []) {
    const bucket = stats[row.affiliate_code]
    if (!bucket) continue
    bucket.conversionsAll += 1
    if (row.created_at >= since) bucket.conversions30d += 1
  }

  return { data: stats, error: clicksRes.error || conversionsRes.error }
}

export async function fetchAffiliateStats(affiliateCode) {
  const db = getPublicDb()
  if (!db || !affiliateCode) {
    return {
      data: { clicks30d: 0, clicksAll: 0, conversions30d: 0, conversionsAll: 0, recentClicks: [], recentConversions: [] },
      error: null,
    }
  }

  const since = thirtyDaysAgo()
  const [clicksRes, conversionsRes] = await Promise.all([
    q(db, 'affiliate_clicks', '*', {
      filters: [{ op: 'eq', col: 'affiliate_code', val: affiliateCode }],
      order: { column: 'created_at', asc: false },
      limit: 200,
    }),
    q(db, 'affiliate_conversions', '*', {
      filters: [{ op: 'eq', col: 'affiliate_code', val: affiliateCode }],
      order: { column: 'created_at', asc: false },
      limit: 200,
    }),
  ])

  if (clicksRes.error?.message?.includes('affiliate_clicks') || clicksRes.error?.code === '42P01') {
    return {
      data: { clicks30d: 0, clicksAll: 0, conversions30d: 0, conversionsAll: 0, recentClicks: [], recentConversions: [] },
      error: null,
    }
  }

  const clicks = clicksRes.data || []
  const conversions = conversionsRes.data || []
  const isRecent = (row) => row.created_at >= since

  return {
    data: {
      clicks30d: clicks.filter(isRecent).length,
      clicksAll: clicks.length,
      conversions30d: conversions.filter(isRecent).length,
      conversionsAll: conversions.length,
      recentClicks: clicks.slice(0, 20),
      recentConversions: conversions.slice(0, 20),
    },
    error: clicksRes.error || conversionsRes.error,
  }
}

export async function fetchAffiliateDashboardSummary() {
  const [affiliatesRes, payoutsRes] = await Promise.all([
    fetchAffiliates(),
    fetchAllAffiliatePayouts(),
  ])

  const affiliates = affiliatesRes.data || []
  const payouts = payoutsRes.data || []
  const activeCount = affiliates.filter((a) => a.status === 'active').length
  const pendingApps = affiliates.filter((a) => a.status === 'pending').length
  const paidTotal = payouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.commission_amount || 0), 0)
  const pendingTotal = payouts
    .filter((p) => p.status === 'pending')
    .reduce((sum, p) => sum + Number(p.commission_amount || 0), 0)

  return {
    data: {
      activeCount,
      pendingApps,
      totalAffiliates: affiliates.length,
      paidTotal,
      pendingTotal,
      affiliates,
      payouts,
    },
    error: affiliatesRes.error || payoutsRes.error,
  }
}

export async function createAffiliate(data) {
  return adminRpc('create_affiliate', {
    p_name: data.name,
    p_email: data.email,
    p_code: data.code || null,
    p_commission_rate_pct: data.commission_rate_pct ?? 10,
    p_target_system: data.target_system || 'both',
    p_phone: data.phone || null,
    p_website: data.website || null,
    p_application_notes: data.application_notes || null,
    p_payout_method: data.payout_method || 'bank_transfer',
    p_payout_details: data.payout_details || {},
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function applyAsAffiliate(data) {
  return adminRpc('apply_as_affiliate', {
    p_name: data.name,
    p_email: data.email,
    p_phone: data.phone || null,
    p_website: data.website || null,
    p_target_system: data.target_system || 'platform',
    p_notes: data.notes || null,
  })
}

export async function updateAffiliate(affiliateId, data) {
  return adminRpc('update_affiliate', {
    p_affiliate_id: affiliateId,
    p_name: data.name ?? null,
    p_email: data.email ?? null,
    p_phone: data.phone ?? null,
    p_website: data.website ?? null,
    p_target_system: data.target_system ?? null,
    p_commission_rate_pct: data.commission_rate_pct ?? null,
    p_application_notes: data.application_notes ?? null,
    p_payout_method: data.payout_method ?? null,
    p_payout_details: data.payout_details ?? null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function approveAffiliate(affiliateId) {
  return adminRpc('approve_affiliate', {
    p_affiliate_id: affiliateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function suspendAffiliate(affiliateId, reason) {
  return adminRpc('suspend_affiliate', {
    p_affiliate_id: affiliateId,
    p_reason: reason || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function terminateAffiliate(affiliateId) {
  return adminRpc('terminate_affiliate', {
    p_affiliate_id: affiliateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function regenerateAffiliateCode(affiliateId) {
  return adminRpc('regenerate_affiliate_code', {
    p_affiliate_id: affiliateId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function createAffiliatePayout(data) {
  return adminRpc('create_affiliate_payout', {
    p_affiliate_id: data.affiliate_id,
    p_period_start: data.period_start,
    p_period_end: data.period_end,
    p_commission_amount: data.commission_amount,
    p_gross_revenue: data.gross_revenue ?? 0,
    p_total_clicks: data.total_clicks ?? 0,
    p_total_conversions: data.total_conversions ?? 0,
    p_currency: data.currency || 'USD',
    p_notes: data.notes || null,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function approveAffiliatePayout(payoutId) {
  return adminRpc('approve_affiliate_payout', {
    p_payout_id: payoutId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function markAffiliatePayoutPaid(payoutId) {
  return adminRpc('mark_affiliate_payout_paid', {
    p_payout_id: payoutId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export function generateAffiliateCodeFromName(name) {
  const base = String(name || 'AFFILIATE')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10)
  const year = new Date().getFullYear().toString().slice(-2)
  return (base || 'AFFILIATE') + year
}
