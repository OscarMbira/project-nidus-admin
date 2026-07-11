/**
 * Generates SQL/v52_admin_navigation_seed_data.sql from defaultAdminNav.js
 * Run: node scripts/generate-admin-nav-seed.js
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { DEFAULT_NAV_SECTIONS, DEFAULT_STANDALONE } from '../packages/shared/src/defaultAdminNav.js'

/** Nodes added after initial v52 sequential ids — keep fixed hex ids (see v62/v91 pattern). */
const NODE_UUID_OVERRIDES = {
  'subscription-billing:subscriptions-catalog:subscriptions:plan-catalog': 'b7593002-0001-4002-8093-000000000001',
  'admin-mgmt:access-control:admin-mgmt:navigation-management': 'b8120001-0001-4001-8122-000000000001',
}

/** Stable id per node_key — avoids PK clashes when new items are inserted mid-tree. */
function nodeUuid(nodeKey) {
  const override = NODE_UUID_OVERRIDES[nodeKey]
  if (override) return `'${override}'::uuid`

  const hash = createHash('sha256').update(`nidus-admin:nav:${nodeKey}`).digest('hex')
  return `'${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}'::uuid`
}

function sqlString(value) {
  if (value == null) return 'NULL'
  return `'${String(value).replace(/'/g, "''")}'`
}

function sqlArray(arr) {
  if (!arr?.length) return 'ARRAY[]::text[]'
  return `ARRAY[${arr.map((v) => sqlString(v)).join(', ')}]::text[]`
}

const rows = []
let sortOrder = 0

function addNode(node) {
  rows.push({ ...node, sortOrder: sortOrder++ })
}

for (const item of DEFAULT_STANDALONE) {
  addNode({
    node_key: `standalone:${item.path.replace(/\//g, ':').replace(/^:/, '')}`,
    parent_key: null,
    node_type: 'standalone',
    label: item.label,
    path: item.path,
    active_paths: [],
    roles: item.roles,
    badge: item.badge || null,
  })
}

for (const section of DEFAULT_NAV_SECTIONS) {
  addNode({
    node_key: section.id,
    parent_key: null,
    node_type: 'section',
    label: section.label,
    path: null,
    active_paths: [],
    roles: section.roles,
    badge: null,
  })

  for (const group of section.groups) {
    const groupKey = `${section.id}:${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    addNode({
      node_key: groupKey,
      parent_key: section.id,
      node_type: 'group',
      label: group.label,
      path: null,
      active_paths: [],
      roles: section.roles,
      badge: null,
    })

    for (const item of group.items) {
      addNode({
        node_key: `${groupKey}:${item.path.replace(/\//g, ':').replace(/^:/, '')}`,
        parent_key: groupKey,
        node_type: 'item',
        label: item.label,
        path: item.path,
        active_paths: item.activePaths || [],
        roles: item.roles,
        badge: item.badge || null,
      })
    }
  }
}

const valuesSql = rows.map((r) => `(
    ${nodeUuid(r.node_key)},
    ${sqlString(r.node_key)},
    ${r.parent_key ? sqlString(r.parent_key) : 'NULL'},
    ${sqlString(r.node_type)},
    ${sqlString(r.label)},
    ${r.path ? sqlString(r.path) : 'NULL'},
    ${sqlArray(r.active_paths)},
    ${sqlArray(r.roles)},
    ${r.sortOrder},
    TRUE,
    ${r.badge ? sqlString(r.badge) : 'NULL'}
)`).join(',\n')

const sql = `-- ============================================================================
-- v52: Admin navigation seed data (generated from defaultAdminNav.js)
-- PostgreSQL 15+ / Supabase
-- Prerequisites: v51_admin_navigation.sql
-- Regenerate: node scripts/generate-admin-nav-seed.js
-- Idempotent: stable UUIDs per node_key + ON CONFLICT on node_key
-- ============================================================================

INSERT INTO admin.nav_nodes (
    id, node_key, parent_key, node_type, label, path,
    active_paths, roles, sort_order, is_active, badge
) VALUES
${valuesSql}
ON CONFLICT (node_key) DO UPDATE SET
    parent_key = EXCLUDED.parent_key,
    node_type = EXCLUDED.node_type,
    label = EXCLUDED.label,
    path = EXCLUDED.path,
    active_paths = EXCLUDED.active_paths,
    roles = EXCLUDED.roles,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    badge = EXCLUDED.badge,
    updated_at = NOW();

DO $$
BEGIN
    RAISE NOTICE 'v52: Admin navigation seed applied (${rows.length} nodes).';
END $$;
`

const outPath = new URL('../SQL/v52_admin_navigation_seed_data.sql', import.meta.url)
writeFileSync(outPath, sql.replace('${rows.length}', String(rows.length)))
console.log(`Wrote ${rows.length} nav nodes to SQL/v52_admin_navigation_seed_data.sql`)
