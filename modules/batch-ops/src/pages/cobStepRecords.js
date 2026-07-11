const PROCESS_META = {
  expire_subscriptions: {
    recordType: 'subscription',
    recordTypeLabel: 'Subscription',
    listPath: '/subscriptions/subscription-list',
  },
  close_resolved_tickets: {
    recordType: 'support_ticket',
    recordTypeLabel: 'Support Ticket',
    listPath: '/support/support-ticket-list',
  },
  archive_old_errors: {
    recordType: 'error_aggregation',
    recordTypeLabel: 'Error Aggregation',
    listPath: '/errors/error-dashboard',
  },
  generate_daily_summary: {
    recordType: 'daily_summary',
    recordTypeLabel: 'Daily Summary',
    listPath: '/audit/admin-activity',
  },
  reset_daily_counters: {
    recordType: 'system',
    recordTypeLabel: 'System Counter',
  },
  lock_business_day: {
    recordType: 'system',
    recordTypeLabel: 'System Setting',
  },
  advance_business_date: {
    recordType: 'business_date',
    recordTypeLabel: 'Business Date',
  },
  generate_cob_report: {
    recordType: 'cob_report',
    recordTypeLabel: 'COB Report',
  },
}

const PROCESS_KEY_ALIASES = {
  generate_report: 'generate_cob_report',
}

function normalizeSummary(raw) {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return raw
}

function resolveProcessKey(step) {
  const summary = normalizeSummary(step?.result_summary)
  const fromSummary = summary?.process
  if (fromSummary) return PROCESS_KEY_ALIASES[fromSummary] || fromSummary
  if (step?.process_key) return step.process_key
  const name = String(step?.process_name || '').toLowerCase()
  if (name.includes('subscription')) return 'expire_subscriptions'
  if (name.includes('ticket')) return 'close_resolved_tickets'
  if (name.includes('error')) return 'archive_old_errors'
  if (name.includes('summary')) return 'generate_daily_summary'
  if (name.includes('counter')) return 'reset_daily_counters'
  if (name.includes('lock')) return 'lock_business_day'
  if (name.includes('advance')) return 'advance_business_date'
  if (name.includes('report')) return 'generate_cob_report'
  return null
}

function buildDetailPath(record) {
  if (record.detail_path) return record.detail_path
  const id = record.id
  if (!id) return null
  switch (record.record_type) {
    case 'subscription':
      return `/subscriptions/subscription-detail?id=${encodeURIComponent(id)}&system=${record.system || 'platform'}`
    case 'support_ticket':
      return `/support/support-ticket-detail?id=${encodeURIComponent(id)}`
    case 'error_aggregation':
      return `/errors/error-detail?id=${encodeURIComponent(id)}`
    case 'audit_log':
      return '/audit/admin-activity'
    default:
      return null
  }
}

function normalizeRecord(record, fallbackType) {
  if (!record || typeof record !== 'object') return null
  const recordType = record.record_type || fallbackType?.recordType || 'record'
  return {
    id: record.id || record.record_id || null,
    label: record.label || record.name || record.subject || record.id || 'Record',
    record_type: recordType,
    record_type_label: record.record_type_label || fallbackType?.recordTypeLabel || recordType,
    system: record.system || null,
    detail_path: buildDetailPath({ ...record, record_type: recordType }),
    status: record.status || null,
  }
}

function summaryMetricRecords(summary, meta) {
  if (!summary || summary.process !== 'generate_daily_summary') return []
  const metrics = [
    { key: 'audit_events', label: 'Audit events', path: '/audit/admin-activity' },
    { key: 'open_support_tickets', label: 'Open support tickets', path: '/support/support-ticket-list' },
    { key: 'support_tickets_created', label: 'Tickets created today', path: '/support/support-ticket-list' },
    { key: 'platform_active_subscriptions', label: 'Platform active subscriptions', path: '/subscriptions/subscription-list' },
    { key: 'simulator_active_subscriptions', label: 'Simulator active subscriptions', path: '/subscriptions/subscription-list' },
  ]
  return metrics
    .filter((metric) => summary[metric.key] != null)
    .map((metric) => ({
      id: metric.key,
      label: `${metric.label}: ${summary[metric.key]}`,
      record_type: 'daily_summary',
      record_type_label: meta?.recordTypeLabel || 'Daily Summary',
      detail_path: metric.path,
    }))
}

export function getStepRecordContext(step) {
  const summary = normalizeSummary(step?.result_summary)
  const processKey = resolveProcessKey(step)
  const meta = PROCESS_META[processKey] || {
    recordType: 'record',
    recordTypeLabel: 'Record',
  }

  let records = []
  if (Array.isArray(summary?.processed_records)) {
    records = summary.processed_records
      .map((record) => normalizeRecord(record, meta))
      .filter(Boolean)
  } else if (processKey === 'generate_daily_summary') {
    records = summaryMetricRecords(summary, meta)
  } else if (processKey === 'advance_business_date' && summary?.next_date) {
    records = [{
      id: summary.next_date,
      label: `${summary.previous_date || 'n/a'} -> ${summary.next_date}`,
      record_type: 'business_date',
      record_type_label: meta.recordTypeLabel,
      detail_path: '/batch-ops/business-calendar',
    }]
  }

  const count = step?.records_processed ?? records.length ?? 0
  const recordTypeLabel = summary?.record_type_label || meta.recordTypeLabel
  const hasDrillDown = records.length > 0 || (count > 0 && Boolean(meta.listPath))

  return {
    processKey,
    recordTypeLabel,
    records,
    count,
    listPath: meta.listPath || null,
    hasDrillDown,
    summary,
  }
}
