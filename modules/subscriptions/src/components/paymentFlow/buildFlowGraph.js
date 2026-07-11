import { REGION_FLOW_LABELS } from '@nidus-admin/shared'

const REGION_ORDER = ['local', 'africa', 'global']
const GATEWAY_COLORS = { paynow: '#22c55e', flutterwave: '#3b82f6', paddle: '#a855f7' }

export function buildFlowGraph(rules, gateways, gatewaysById, options = {}) {
  const { showInactive = true, showFallback = true, countryCode = '', highlightRegion = null } = options
  const nodes = []
  const edges = []
  const gatewaySet = new Set()
  const methodSet = new Set()
  const regionSet = new Set()

  const filteredRules = rules.filter((rule) => {
    if (!showInactive && !rule.is_enabled) return false
    if (countryCode) {
      if (rule.supported_countries?.length && !rule.supported_countries.includes(countryCode)) return false
    }
    return true
  })

  filteredRules.forEach((rule) => {
    regionSet.add(rule.region_scope)
    methodSet.add(rule.payment_method_id)
    gatewaySet.add(rule.primary_gateway_id)
    if (rule.fallback_gateway_id) gatewaySet.add(rule.fallback_gateway_id)
  })

  let regionY = 0
  REGION_ORDER.filter((r) => regionSet.has(r)).forEach((region) => {
    const meta = REGION_FLOW_LABELS[region] || { label: region, emoji: '📍' }
    const dimmed = highlightRegion && highlightRegion !== region
    nodes.push({
      id: `region-${region}`,
      type: 'region',
      position: { x: 0, y: regionY },
      data: { label: `${meta.emoji} ${meta.label}`, region, dimmed },
    })
    regionY += 180
  })

  const methodsByRegion = {}
  filteredRules.forEach((rule) => {
    if (!methodsByRegion[rule.region_scope]) methodsByRegion[rule.region_scope] = []
    if (!methodsByRegion[rule.region_scope].find((m) => m.id === rule.payment_method_id)) {
      methodsByRegion[rule.region_scope].push({
        id: rule.payment_method_id,
        label: rule.method_display_name || rule.display_label,
        enabled: rule.is_enabled,
        rule,
      })
    }
  })

  let methodY = 0
  Object.entries(methodsByRegion).forEach(([region, methods]) => {
    methods.forEach((method, idx) => {
      const dimmed = highlightRegion && highlightRegion !== region
      nodes.push({
        id: `method-${method.id}-${region}`,
        type: 'method',
        position: { x: 280, y: methodY + idx * 70 },
        data: {
          label: method.label,
          enabled: method.enabled,
          rule: method.rule,
          region,
          dimmed,
        },
      })
      edges.push({
        id: `e-region-${region}-method-${method.id}`,
        source: `region-${region}`,
        target: `method-${method.id}-${region}`,
        type: 'primary',
        data: { active: method.enabled, dimmed },
      })
    })
    methodY += methods.length * 70 + 40
  })

  const gatewayList = [...gatewaySet].map((id) => gatewaysById.get(id)).filter(Boolean)
  gatewayList.forEach((gw, idx) => {
    nodes.push({
      id: `gateway-${gw.id}`,
      type: 'gateway',
      position: { x: 560, y: idx * 100 },
      data: {
        label: gw.display_name || gw.name,
        provider: gw.provider_key,
        active: gw.is_active,
        gateway: gw,
        color: GATEWAY_COLORS[gw.provider_key] || '#6b7280',
      },
    })
  })

  filteredRules.forEach((rule) => {
    const methodNodeId = `method-${rule.payment_method_id}-${rule.region_scope}`
    const primaryId = `gateway-${rule.primary_gateway_id}`
    const dimmed = highlightRegion && highlightRegion !== rule.region_scope

    edges.push({
      id: `e-${rule.id}-primary`,
      source: methodNodeId,
      target: primaryId,
      type: 'primary',
      data: { active: rule.is_enabled, fallback: false, dimmed },
    })

    if (showFallback && rule.fallback_gateway_id) {
      edges.push({
        id: `e-${rule.id}-fallback`,
        source: methodNodeId,
        target: `gateway-${rule.fallback_gateway_id}`,
        type: 'fallback',
        data: { active: rule.is_enabled, fallback: true, dimmed },
      })
    }
  })

  return { nodes, edges }
}
