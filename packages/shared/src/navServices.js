import { getAdminDb } from './supabase.js'
import { getCurrentAdminUserId } from './adminContext.jsx'
import { DEFAULT_NAV_SECTIONS, DEFAULT_STANDALONE } from './defaultAdminNav.js'

async function rpc(fn, params = {}) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data: data ?? null, error: error?.message || error || null }
}

/**
 * Flat nav_nodes row → nested { standalone, sections } for AdminSidebar.
 */
export function buildAdminNavTree(nodes) {
  if (!nodes?.length) {
    return { standalone: DEFAULT_STANDALONE, sections: DEFAULT_NAV_SECTIONS }
  }

  const sorted = [...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const standalone = sorted
    .filter((n) => n.node_type === 'standalone')
    .map((n) => ({
      label: n.label,
      path: n.path,
      roles: n.roles || [],
      badge: n.badge || undefined,
    }))

  const sections = sorted
    .filter((n) => n.node_type === 'section')
    .map((section) => {
      const groups = sorted
        .filter((n) => n.node_type === 'group' && n.parent_key === section.node_key)
        .map((group) => ({
          label: group.label,
          items: sorted
            .filter((n) => n.node_type === 'item' && n.parent_key === group.node_key)
            .map((item) => ({
              label: item.label,
              path: item.path,
              roles: item.roles || [],
              activePaths: item.active_paths?.length ? item.active_paths : undefined,
              badge: item.badge || undefined,
            })),
        }))
        .filter((g) => g.items.length > 0)

      return {
        id: section.node_key,
        label: section.label,
        roles: section.roles || [],
        groups,
      }
    })
    .filter((s) => s.groups.length > 0)

  if (!standalone.length && !sections.length) {
    return { standalone: DEFAULT_STANDALONE, sections: DEFAULT_NAV_SECTIONS }
  }

  return {
    standalone: standalone.length ? standalone : DEFAULT_STANDALONE,
    sections: sections.length ? sections : DEFAULT_NAV_SECTIONS,
  }
}

export async function fetchAdminNavTree() {
  const result = await rpc('list_admin_nav_nodes', {
    p_admin_user_id: await getCurrentAdminUserId(),
  })

  if (result.error || !result.data) {
    return {
      data: { standalone: DEFAULT_STANDALONE, sections: DEFAULT_NAV_SECTIONS },
      error: result.error,
      source: 'fallback',
    }
  }

  const rows = Array.isArray(result.data) ? result.data : []
  return {
    data: buildAdminNavTree(rows),
    error: null,
    source: rows.length ? 'database' : 'fallback',
  }
}

export function getDefaultAdminNav() {
  return { standalone: DEFAULT_STANDALONE, sections: DEFAULT_NAV_SECTIONS }
}

export async function fetchAllNavNodesForManagement() {
  return rpc('list_all_nav_nodes_for_management', {
    p_admin_user_id: await getCurrentAdminUserId(),
  })
}

export async function renameNavNode(nodeKey, label, reason = null) {
  return rpc('rename_nav_node', {
    p_node_key: nodeKey,
    p_label: label,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export async function setNavNodeRoles(nodeKey, roles, reason = null) {
  return rpc('set_nav_node_roles', {
    p_node_key: nodeKey,
    p_roles: roles,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

export async function setNavNodeActive(nodeKey, isActive, reason = null) {
  return rpc('set_nav_node_active', {
    p_node_key: nodeKey,
    p_is_active: isActive,
    p_admin_user_id: await getCurrentAdminUserId(),
    p_reason: reason,
  })
}

/** Dispatched after nav mutations so AdminSidebar reloads from the database. */
export function notifyAdminNavChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nidus-admin-nav-refresh'))
  }
}

/** @deprecated use getDefaultAdminNav — kept for imports */
export { DEFAULT_STANDALONE, DEFAULT_NAV_SECTIONS }
