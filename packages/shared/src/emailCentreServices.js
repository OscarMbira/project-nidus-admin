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
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
      else if (f.op === 'in') query = query.in(f.col, f.val)
      else if (f.op === 'not') query = query.not(f.col, f.op2 || 'is', f.val)
    }
  }
  return query
}

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: new Error('Database not configured') }
  const { data, error } = await db.rpc(fn, params)
  return { data, error }
}

export function renderEmailTemplate(text, variables = {}) {
  let out = text || ''
  for (const [key, value] of Object.entries(variables)) {
    out = out.split(`{{${key}}}`).join(String(value ?? ''))
  }
  return out
}

export function extractTemplateVariables(template) {
  const text = `${template?.subject || ''} ${template?.body_html || ''}`
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)]
  return [...new Set(matches.map((m) => m[1]))]
}

export async function dispatchEmail({ to, subject, html, text }) {
  const db = getAdminDb()
  if (!db) return { data: null, error: new Error('Database not configured') }

  const url = import.meta.env.VITE_ADMIN_SUPABASE_URL
  const anonKey = import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY
  if (!url || !anonKey) return { data: null, error: new Error('Supabase not configured') }

  const { data: { session } } = await db.auth.getSession()
  const token = session?.access_token || anonKey

  const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, '') || '',
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.success === false) {
    return { data: json, error: new Error(json.error || `Send failed (${res.status})`) }
  }
  return { data: json, error: null }
}

export async function queueEmail({
  recipientEmail,
  templateKey,
  subject,
  bodyHtml,
  provider,
  targetSystem,
  metadata,
}) {
  return rpc('queue_email', {
    p_recipient_email: recipientEmail,
    p_template_key: templateKey || null,
    p_subject: subject,
    p_body_html: bodyHtml,
    p_provider: provider || null,
    p_target_system: targetSystem || null,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_metadata: metadata || null,
  })
}

export async function updateEmailSendStatus(logId, status, { messageId, errorMessage, provider } = {}) {
  return rpc('update_email_send_status', {
    p_log_id: logId,
    p_status: status,
    p_message_id: messageId || null,
    p_error_message: errorMessage || null,
    p_provider: provider || null,
  })
}

export async function sendComposedEmail({
  recipientEmail,
  templateKey,
  subject,
  bodyHtml,
  targetSystem,
  metadata,
}) {
  const { data: logId, error: queueError } = await queueEmail({
    recipientEmail,
    templateKey,
    subject,
    bodyHtml,
    targetSystem,
    metadata,
  })
  if (queueError) return { data: null, error: queueError }

  const { data: sendResult, error: sendError } = await dispatchEmail({
    to: recipientEmail,
    subject,
    html: bodyHtml,
  })

  if (sendError) {
    await updateEmailSendStatus(logId, 'failed', { errorMessage: sendError.message })
    return { data: { logId }, error: sendError }
  }

  await updateEmailSendStatus(logId, 'sent', {
    messageId: sendResult?.message_id || null,
    provider: sendResult?.provider || null,
  })

  return { data: { logId, messageId: sendResult?.message_id }, error: null }
}

export async function fireEmailEvent(eventType, recipientEmail, contextData = {}) {
  const { data: logId, error: triggerError } = await rpc('trigger_email_event', {
    p_event_type: eventType,
    p_recipient_email: recipientEmail,
    p_context_data: contextData,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
  if (triggerError) return { data: null, error: triggerError }
  if (!logId) return { data: { skipped: true }, error: null }

  const db = getAdminDb()
  const { data: logRow } = await db.from('email_send_log').select('subject, metadata').eq('id', logId).maybeSingle()
  const bodyHtml = logRow?.metadata?.body_html || ''
  const subject = logRow?.subject || 'Notification'

  const { error: sendError } = await dispatchEmail({
    to: recipientEmail,
    subject,
    html: bodyHtml,
  })

  if (sendError) {
    await updateEmailSendStatus(logId, 'failed', { errorMessage: sendError.message })
    return { data: { logId }, error: sendError }
  }

  await updateEmailSendStatus(logId, 'sent', {})
  return { data: { logId }, error: null }
}

export async function notifyEmailEvent(eventType, recipientEmail, contextData = {}) {
  if (!recipientEmail) return { skipped: true }
  try {
    const result = await fireEmailEvent(eventType, recipientEmail, contextData)
    if (result.error) console.warn('[email] notifyEmailEvent failed', eventType, result.error)
    return result
  } catch (err) {
    console.warn('[email] notifyEmailEvent failed', eventType, err)
    return { error: err }
  }
}

export async function getEmailProviderConfig() {
  return rpc('get_email_provider_config')
}

export async function getEmailSenderProfiles() {
  return rpc('get_email_sender_profiles')
}

export async function getEmailAnalytics(days = 30) {
  return rpc('get_email_analytics', { p_days: days })
}

export async function fetchEmailCampaigns() {
  return q(getAdminDb(), 'email_campaigns', '*', {
    order: { column: 'created_at', asc: false },
  })
}

export async function fetchEmailCampaign(id) {
  return q(getAdminDb(), 'email_campaigns', '*', {
    filters: [{ op: 'eq', col: 'id', val: id }],
    limit: 1,
  }).then(({ data, error }) => ({ data: data?.[0] || null, error }))
}

export async function createEmailCampaign(payload) {
  return rpc('create_email_campaign', {
    p_campaign_name: payload.campaign_name,
    p_description: payload.description || null,
    p_template_id: payload.template_id || null,
    p_subject_override: payload.subject_override || null,
    p_audience_filter: payload.audience_filter || {},
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function updateEmailCampaign(campaignId, updates) {
  return rpc('update_email_campaign', {
    p_campaign_id: campaignId,
    p_updates: updates,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function deleteEmailCampaign(campaignId) {
  return rpc('delete_email_campaign', {
    p_campaign_id: campaignId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function scheduleEmailCampaign(campaignId, scheduledAt) {
  return rpc('schedule_email_campaign', {
    p_campaign_id: campaignId,
    p_scheduled_at: scheduledAt,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function cancelEmailCampaign(campaignId) {
  return rpc('cancel_email_campaign', {
    p_campaign_id: campaignId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function buildCampaignAudience(audienceFilter) {
  const { data, error } = await rpc('build_campaign_audience', {
    p_audience_filter: audienceFilter || {},
    p_admin_user_id: await getCurrentAdminUserId(),
  })
  return { data: data || [], error }
}

export async function enqueueCampaign(campaignId) {
  return rpc('enqueue_campaign', {
    p_campaign_id: campaignId,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function fetchEmailQueue(campaignId, status = 'pending') {
  return q(getAdminDb(), 'email_queue', '*', {
    filters: [
      { op: 'eq', col: 'campaign_id', val: campaignId },
      { op: 'eq', col: 'status', val: status },
    ],
    order: { column: 'created_at' },
    limit: 500,
  })
}

export async function fetchEmailEventTriggers() {
  return q(getAdminDb(), 'email_event_triggers', '*', {
    order: { column: 'event_type' },
  })
}

export async function updateEmailEventTrigger(eventType, updates) {
  return rpc('update_email_event_trigger', {
    p_event_type: eventType,
    p_is_active: updates.is_active,
    p_delay_hours: updates.delay_hours,
    p_template_key: updates.template_key,
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function fetchEnhancedEmailSendLog(opts = {}) {
  const db = getAdminDb()
  if (!db) return { data: [], error: null }
  let query = db.from('email_send_log').select('*').order('sent_at', { ascending: false }).limit(opts.limit || 500)
  if (opts.status) query = query.eq('status', opts.status)
  if (opts.templateKey) query = query.eq('template_key', opts.templateKey)
  const { data, error } = await query
  if (error || !data?.length) return { data: data || [], error }

  const adminIds = [...new Set(data.map((r) => r.initiated_by).filter(Boolean))]
  let adminMap = {}
  if (adminIds.length) {
    const { data: admins } = await db.from('admin_users').select('id, email, full_name').in('id', adminIds)
    adminMap = Object.fromEntries((admins || []).map((a) => [a.id, a]))
  }
  return {
    data: data.map((row) => ({
      ...row,
      initiated_by_admin: row.initiated_by ? adminMap[row.initiated_by] : null,
    })),
    error: null,
  }
}

export async function searchUsersForEmail(term) {
  const t = (term || '').trim()
  if (!t) return { data: [], error: null }
  const pub = getPublicDb()
  if (!pub) return { data: [], error: null }
  return pub
    .from('users')
    .select('id, email, full_name')
    .or(`email.ilike.%${t}%,full_name.ilike.%${t}%`)
    .limit(20)
}

export async function dispatchCampaignBatch(campaignId, template, batchSize = 50) {
  const { data: queueRows, error } = await fetchEmailQueue(campaignId, 'pending')
  if (error) return { data: null, error }

  const batch = (queueRows || []).slice(0, batchSize)
  let sent = 0
  let failed = 0

  for (const row of batch) {
    const vars = row.variables || {}
    const subject = renderEmailTemplate(template.subject_override || template.subject, vars)
    const bodyHtml = renderEmailTemplate(template.body_html, vars)

    const { data: sendData, error: sendError } = await sendComposedEmail({
      recipientEmail: row.recipient_email,
      templateKey: template.template_key,
      subject,
      bodyHtml,
      metadata: { campaign_id: campaignId, queue_id: row.id },
    })

    const db = getAdminDb()
    if (sendError) {
      failed += 1
      await db.from('email_queue').update({ status: 'failed', error_message: sendError.message }).eq('id', row.id)
    } else {
      sent += 1
      await db.from('email_queue').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        send_log_id: sendData?.logId || null,
      }).eq('id', row.id)
    }
  }

  const db = getAdminDb()
  const { data: campaign } = await db.from('email_campaigns').select('sent_count, failed_count, total_recipients').eq('id', campaignId).maybeSingle()
  const newSent = (campaign?.sent_count || 0) + sent
  const newFailed = (campaign?.failed_count || 0) + failed
  const done = newSent + newFailed >= (campaign?.total_recipients || 0)

  await db.from('email_campaigns').update({
    sent_count: newSent,
    failed_count: newFailed,
    status: done ? 'sent' : 'sending',
    sent_at: done ? new Date().toISOString() : null,
  }).eq('id', campaignId)

  return { data: { sent, failed, done }, error: null }
}