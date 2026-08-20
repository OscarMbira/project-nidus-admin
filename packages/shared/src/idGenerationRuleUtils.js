/** Canonical qualified name: schema.table (bare names default to public). */
export function normalizeTargetTable(targetTable) {
  const raw = String(targetTable || '').trim()
  if (!raw) return ''
  if (raw.includes('.')) {
    const [schema, ...rest] = raw.split('.')
    const name = rest.join('.').trim()
    return name ? `${schema}.${name}` : raw
  }
  return `public.${raw}`
}

export function getTargetTableSchema(targetTable) {
  const normalized = normalizeTargetTable(targetTable)
  if (!normalized.includes('.')) return 'public'
  return normalized.split('.')[0]
}

export function getTargetTableName(targetTable) {
  const normalized = normalizeTargetTable(targetTable)
  const parts = normalized.split('.')
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0]
}

export function targetTablesMatch(a, b) {
  if (!a || !b) return false
  return normalizeTargetTable(a) === normalizeTargetTable(b)
}

/** Lookup candidates for DB rows that may store qualified or legacy bare public names. */
export function targetTableLookupCandidates(targetTable) {
  const normalized = normalizeTargetTable(targetTable)
  if (!normalized) return []

  const candidates = new Set([String(targetTable).trim(), normalized])
  const schema = getTargetTableSchema(normalized)
  const name = getTargetTableName(normalized)

  if (schema === 'public' && name) {
    candidates.add(name)
  }

  return [...candidates].filter(Boolean)
}

export function findIdGenerationRuleForTable(rules, targetTable) {
  const normalized = normalizeTargetTable(targetTable)
  if (!normalized) return null

  return (rules || []).find((rule) => targetTablesMatch(rule.target_table, normalized)) ?? null
}

export function buildRulesByTargetTable(rules) {
  const map = {}
  for (const rule of rules || []) {
    const key = normalizeTargetTable(rule.target_table)
    if (!key || map[key]) continue
    map[key] = rule
  }
  return map
}

export function idGenerationRuleFormPath({ rule, targetTable, view = false } = {}) {
  if (rule?.id) {
    const base = `/system/id-generation-rule-form?id=${encodeURIComponent(rule.id)}`
    return view ? `${base}&view=1` : base
  }
  const table = normalizeTargetTable(targetTable)
  if (table) {
    return `/system/id-generation-rule-form?table=${encodeURIComponent(table)}`
  }
  return '/system/id-generation-rule-form'
}

/** Extract target_table from create RPC "already exists for table …" errors. */
export function parseIdGenerationRuleTableFromExistsError(error) {
  const message = typeof error === 'string' ? error : error?.message || String(error || '')
  const match = message.match(/already exists for table\s+(.+)$/i)
  return match?.[1]?.trim().replace(/\.$/, '') || null
}

export function isIdGenerationRuleAlreadyExistsError(error) {
  const message = typeof error === 'string' ? error : error?.message || String(error || '')
  return /already exists for table/i.test(message)
}
