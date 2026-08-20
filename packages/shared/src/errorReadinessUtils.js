export const OPEN_ERROR_STATUSES = ['new', 'acknowledged', 'investigating', 'recurring']

export const ERROR_SEVERITIES = ['critical', 'high', 'medium', 'low']

export function parseReleaseGateThreshold(value) {
  const raw = String(value || 'critical').trim().toLowerCase()
  if (!raw) return ['critical']
  return raw.split(',').map((part) => part.trim()).filter(Boolean)
}

export function countsToSeverityMap(rows) {
  const map = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const row of rows || []) {
    const severity = String(row.severity || '').toLowerCase()
    if (severity in map) {
      map[severity] = Number(row.open_count) || 0
    }
  }
  return map
}

export function evaluateErrorReleaseReadiness(countsMap, thresholdValue) {
  const thresholdSeverities = parseReleaseGateThreshold(thresholdValue)
  const blockingSeverities = thresholdSeverities.filter((severity) => (countsMap[severity] || 0) > 0)
  return {
    blocked: blockingSeverities.length > 0,
    thresholdSeverities,
    blockingSeverities,
    counts: countsMap,
  }
}

export function buildErrorDashboardFilterLink({ severity = 'critical' } = {}) {
  const params = new URLSearchParams()
  if (severity && severity !== 'all') params.set('severity', severity)
  const query = params.toString()
  return query ? `/errors/error-dashboard?${query}` : '/errors/error-dashboard'
}

export function formatReleaseReadinessMessage(readiness) {
  const { blocked, counts, thresholdSeverities } = readiness
  if (blocked) {
    const critical = counts.critical || 0
    const high = counts.high || 0
    const thresholdLabel = thresholdSeverities.join(', ')
    return `${critical} critical / ${high} high open — not release ready (blocking: ${thresholdLabel})`
  }
  const primary = thresholdSeverities.includes('critical')
    ? 'No open critical errors'
    : `No open ${thresholdSeverities.join(' or ')} errors`
  return `${primary} — release ready`
}
