import { normalizeTargetTable } from './idGenerationRuleUtils.js'

/** @typedef {'view' | 'list'} GeneratedIdRecordActionType */

/**
 * @typedef {object} GeneratedIdRecordViewResult
 * @property {boolean} available
 * @property {string | null} href
 * @property {string | null} label
 * @property {string | null} reason
 * @property {GeneratedIdRecordActionType | null} actionType
 */

/**
 * @typedef {object} GeneratedIdRecordRouteConfig
 * @property {string} path
 * @property {string} label
 * @property {Record<string, string>} [extraQuery]
 */

/** Admin detail/read routes keyed by normalized target_table. */
const DETAIL_ROUTES = /** @type {Record<string, GeneratedIdRecordRouteConfig>} */ ({
  'public.users': { path: '/users/user-detail', label: 'View user' },
  'public.accounts': { path: '/users/org-detail', label: 'View organisation' },
  'public.platform_subscriptions': {
    path: '/subscriptions/subscription-detail',
    label: 'View subscription',
  },
  'sim.scenarios': { path: '/simulator/sim-scenario-detail', label: 'View scenario' },
  'admin.admin_users': { path: '/admin-mgmt/admin-user-edit', label: 'View admin user' },
  'admin.support_tickets': { path: '/support/support-ticket-detail', label: 'View ticket' },
  'admin.id_generation_rules': { path: '/system/id-generation-rule-form', label: 'View ID rule' },
})

/** List-only admin screens — open with ?search= display ID or UUID. */
const LIST_FALLBACK_ROUTES = /** @type {Record<string, GeneratedIdRecordRouteConfig>} */ ({
  'sim.certificates': { path: '/simulator/sim-certificate-admin', label: 'Open in list' },
  'sim.learning_paths': { path: '/simulator/sim-learning-path-admin', label: 'Open in list' },
  'sim.npcs': { path: '/simulator/sim-n-p-c-admin', label: 'Open in list' },
  'sim.leaderboard_entries': { path: '/simulator/sim-leaderboard-admin', label: 'Open in list' },
  'public.projects': { path: '/platform/platform-projects-overview', label: 'Open in list' },
})

function buildDetailHref(path, idValue, extraQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(extraQuery)) {
    if (value != null && value !== '') params.set(key, value)
  }
  params.set('id', idValue)
  return `${path}?${params.toString()}`
}

function buildListHref(path, searchValue) {
  if (!searchValue) return path
  const params = new URLSearchParams({ search: searchValue })
  return `${path}?${params.toString()}`
}

/**
 * Resolve a Generated IDs row to an admin View or list-fallback link.
 *
 * @param {{ target_table?: string, record_id?: string, display_id?: string }} params
 * @returns {GeneratedIdRecordViewResult}
 */
export function resolveGeneratedIdRecordView({ target_table, record_id, display_id } = {}) {
  const table = normalizeTargetTable(target_table)
  if (!table) {
    return {
      available: false,
      href: null,
      label: null,
      reason: 'Missing target table',
      actionType: null,
    }
  }

  const idValue = String(display_id || record_id || '').trim()
  if (!idValue) {
    return {
      available: false,
      href: null,
      label: null,
      reason: 'Missing record identifier',
      actionType: null,
    }
  }

  const detail = DETAIL_ROUTES[table]
  if (detail) {
    return {
      available: true,
      href: buildDetailHref(detail.path, idValue, detail.extraQuery),
      label: detail.label,
      reason: null,
      actionType: 'view',
    }
  }

  const listFallback = LIST_FALLBACK_ROUTES[table]
  if (listFallback) {
    const searchValue = String(display_id || record_id || '').trim()
    return {
      available: true,
      href: buildListHref(listFallback.path, searchValue),
      label: listFallback.label,
      reason: null,
      actionType: 'list',
    }
  }

  return {
    available: false,
    href: null,
    label: null,
    reason: `No admin detail page for ${table}`,
    actionType: null,
  }
}

export function buildGeneratedIdAdminLink(href) {
  if (!href) return ''
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${href}`
  }
  return href
}
