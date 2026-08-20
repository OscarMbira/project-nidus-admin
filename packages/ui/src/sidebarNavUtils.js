/**
 * Admin sidebar tree navigation helpers (mirrors @nidus/shared/utils/sidebarNavUtils).
 */

export const ADMIN_SIDEBAR_NAV_TIER_BASE = 'relative mt-1 space-y-0.5 ml-3 pl-4 border-l border-gray-700'

export const ADMIN_SIDEBAR_NAV_TREE_ROW_BASE = 'relative'

export function getAdminSidebarNavTierClassName(borderClassName = 'border-gray-700') {
  return [ADMIN_SIDEBAR_NAV_TIER_BASE, borderClassName].filter(Boolean).join(' ')
}

export function getAdminSidebarNavTreeDotClassName(dotClassName = 'bg-gray-500') {
  return [
    'pointer-events-none absolute -left-4 top-1/2 z-[1] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
    dotClassName,
  ]
    .filter(Boolean)
    .join(' ')
}

export function getAdminSidebarNavTreeRowClassName() {
  return ADMIN_SIDEBAR_NAV_TREE_ROW_BASE
}
