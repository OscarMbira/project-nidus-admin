export const RULE_TABS = [
  {
    key: 'all',
    label: 'All',
    description: 'All database tables across Admin, Platform, and Simulator schemas.',
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Admin panel tables (admin_users, support_tickets, etc.)',
  },
  {
    key: 'public',
    label: 'Platform',
    description: 'Platform data tables (users, accounts, projects, etc.)',
  },
  {
    key: 'sim',
    label: 'Simulator',
    description: 'Simulator data tables (scenarios, certificates, etc.)',
  },
]

export const RULE_TAB_LABELS = Object.fromEntries(
  RULE_TABS.filter((tab) => tab.key !== 'all').map((tab) => [tab.key, tab.label]),
)

export const SCHEMA_FILTERS = [
  { key: 'all', label: 'All Tables' },
  { key: 'admin', label: 'Admin Tables' },
  { key: 'public', label: 'Platform DB Tables' },
  { key: 'sim', label: 'Simulator DB Tables' },
]

export const SCHEMA_GROUP_META = {
  admin: {
    key: 'admin',
    label: 'Admin Tables',
    description: 'Admin panel tables (admin_users, support_tickets, etc.)',
    badge: 'Admin',
    badgeVariant: 'pending_activation',
  },
  public: {
    key: 'public',
    label: 'Platform DB Tables',
    description: 'Platform data tables in the public schema (users, accounts, projects, etc.)',
    badge: 'Platform',
    badgeVariant: 'active',
  },
  sim: {
    key: 'sim',
    label: 'Simulator DB Tables',
    description: 'Simulator data tables in the sim schema (scenarios, certificates, etc.)',
    badge: 'Simulator',
    badgeVariant: 'suspended',
  },
}

export const SCHEMA_GROUP_ORDER = ['admin', 'public', 'sim']

export function getTableSchema(targetTable) {
  if (!targetTable || !String(targetTable).includes('.')) return 'public'
  return String(targetTable).split('.')[0]
}

export function getTableName(targetTable) {
  if (!targetTable) return ''
  const parts = String(targetTable).split('.')
  return parts.length > 1 ? parts.slice(1).join('.') : parts[0]
}

export function getSystemMeta(targetTable) {
  const schema = getTableSchema(targetTable)
  return SCHEMA_GROUP_META[schema] || SCHEMA_GROUP_META.public
}

export function qualifiedTableName(row) {
  if (!row) return ''
  if (row.target_table) return row.target_table
  const schema = row.table_schema || 'public'
  return `${schema}.${row.table_name}`
}

export function matchesRuleTab(tabKey, schema) {
  if (tabKey === 'all') return true
  return tabKey === schema
}
