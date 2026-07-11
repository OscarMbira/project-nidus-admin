import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { ROLE_LABELS, fetchAdminNavTree, getDefaultAdminNav } from '@nidus-admin/shared'
import { AdminBadge } from '@nidus-admin/ui'
import { resolveModuleFromPath } from '../../config/moduleRegistry.js'
import { prefetchRemoteModule } from '../../utils/prefetchRemote.js'

const STORAGE_KEY = 'nidus-admin-nav-sections'

const FALLBACK_NAV = getDefaultAdminNav()

/** One drill-down tier: guide line + horizontal inset. Nesting tiers compounds indentation. */
const NAV_TIER = 'mt-1 space-y-0.5 border-l border-gray-700 ml-3 pl-3'

function NavTier({ children, className = '' }) {
  return <div className={`${NAV_TIER}${className ? ` ${className}` : ''}`}>{children}</div>
}

/** Sidebar label sizes — section > group > leaf hierarchy. */
const NAV_SECTION_LABEL = 'text-xs font-medium uppercase tracking-wide text-gray-300'
const NAV_GROUP_LABEL = 'text-xs font-semibold uppercase tracking-wide text-gray-400'

function navLeafRowClass(isActive, { muted = false } = {}) {
  const tone = muted
    ? 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
    : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
  return `flex w-full items-center rounded py-2 pr-3 text-xs ${isActive ? 'bg-gray-800 text-white' : tone}`
}

function prefetchModuleForPath(path) {
  const moduleKey = resolveModuleFromPath(path)
  if (moduleKey) prefetchRemoteModule(moduleKey)
}

function getGroupId(sectionId, groupLabel) {
  return `${sectionId}::${groupLabel}`
}

function getSectionItems(section) {
  return section.groups.flatMap((group) => group.items)
}

function canSee(item, role) {
  if (!item.roles) return true
  return item.roles.includes(role)
}

function navItemMatchScore(pathname, item) {
  const { path, activePaths = [] } = item
  if (pathname === path) return 1000 + path.length
  if (pathname.startsWith(`${path}/`)) return 500 + path.length
  for (const prefix of activePaths) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return 100 + prefix.length
    }
  }
  return 0
}

function getActiveSectionItem(pathname, items, role) {
  let best = null
  let bestScore = 0
  for (const item of items) {
    if (!canSee(item, role)) continue
    const score = navItemMatchScore(pathname, item)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return bestScore > 0 ? best : null
}

function isNavItemActive(pathname, item, sectionItems = null, role = null) {
  if (sectionItems && role) {
    const active = getActiveSectionItem(pathname, sectionItems, role)
    return active?.path === item.path
  }
  return navItemMatchScore(pathname, item) > 0
}

function groupHasActiveItem(pathname, group, role) {
  return getActiveSectionItem(pathname, group.items, role) !== null
}

function sectionHasActiveItem(section, role, pathname) {
  return getActiveSectionItem(pathname, getSectionItems(section), role) !== null
}

function getActiveGroupId(pathname, section, role) {
  for (const group of section.groups) {
    if (groupHasActiveItem(pathname, group, role)) {
      return getGroupId(section.id, group.label)
    }
  }
  return null
}

/** Keep only the top-level section and sub-group that match the current route. */
function buildFocusedNavState(pathname, role, visibleSections) {
  const activeSection = visibleSections.find((section) => sectionHasActiveItem(section, role, pathname))
  if (!activeSection) {
    return { openSectionId: null, groupOpenState: {} }
  }

  const activeGroupId = getActiveGroupId(pathname, activeSection, role)
  const groupOpenState = {}

  for (const group of activeSection.groups) {
    const groupId = getGroupId(activeSection.id, group.label)
    groupOpenState[groupId] = groupId === activeGroupId
  }

  return { openSectionId: activeSection.id, groupOpenState }
}

function loadNavState(role) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      let openSectionId = null
      if (typeof parsed === 'string') {
        openSectionId = parsed
      } else if (parsed?.openSectionId) {
        openSectionId = parsed.openSectionId
      } else if (typeof parsed === 'object' && parsed !== null) {
        const legacyOpen = Object.keys(parsed).find(
          (id) => parsed[id] && NAV_SECTIONS.some((section) => section.id === id && canSee(section, role)),
        )
        if (legacyOpen) openSectionId = legacyOpen
      }
      return {
        openSectionId,
        groupOpenState: parsed?.groupOpenState ?? {},
      }
    }
  } catch {
    // ignore invalid storage
  }
  return { openSectionId: null, groupOpenState: {} }
}

function isGroupOpen(sectionId, group, pathname, role, groupOpenState) {
  const groupId = getGroupId(sectionId, group.label)
  if (groupId in groupOpenState) return groupOpenState[groupId]
  return groupHasActiveItem(pathname, group, role)
}

function Chevron({ open, size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`${sizeClass} shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
    </svg>
  )
}

function NavGroup({ sectionId, group, sectionItems, pathname, role, groupOpenState, onToggleGroup }) {
  const groupIsOpen = isGroupOpen(sectionId, group, pathname, role, groupOpenState)

  return (
    <div>
      {group.label && (
        <button
          type="button"
          onClick={() => onToggleGroup(sectionId, group)}
          aria-expanded={groupIsOpen}
          className="flex w-full items-center justify-between rounded py-2 pr-3 text-left hover:bg-gray-800/30"
        >
          <span className={NAV_GROUP_LABEL}>
            {group.label}
          </span>
          <Chevron open={groupIsOpen} size="sm" />
        </button>
      )}
      {groupIsOpen && (
        <NavTier>
          {group.items.map((item) => {
            const isHistoryItem = item.path?.endsWith('-history')
            const isActive = isNavItemActive(pathname, item, sectionItems, role)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                onMouseEnter={() => prefetchModuleForPath(item.path)}
                onFocus={() => prefetchModuleForPath(item.path)}
                className={() => navLeafRowClass(isActive, { muted: isHistoryItem })}
              >
                {item.label}
              </NavLink>
            )
          })}
        </NavTier>
      )}
    </div>
  )
}

function NavSection({ section, isOpen, pathname, role, groupOpenState, onToggleSection, onToggleGroup }) {
  const sectionItems = getSectionItems(section)

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => onToggleSection(section.id)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded px-3 py-2 text-left hover:bg-gray-800/40"
      >
        <span className={NAV_SECTION_LABEL}>{section.label}</span>
        <Chevron open={isOpen} />
      </button>

      {isOpen && (
        <NavTier>
          {section.groups.map((group) => (
            <NavGroup
              key={group.label}
              sectionId={section.id}
              group={group}
              sectionItems={sectionItems}
              pathname={pathname}
              role={role}
              groupOpenState={groupOpenState}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </NavTier>
      )}
    </div>
  )
}

export default function AdminSidebar({ collapsed }) {
  const { role, logout, adminUser } = useAdminAuth()
  const location = useLocation()
  const [navState, setNavState] = useState(() => loadNavState(role))
  const { openSectionId, groupOpenState } = navState
  const [navConfig, setNavConfig] = useState(FALLBACK_NAV)

  useEffect(() => {
    let cancelled = false
    const loadNav = async () => {
      const { data } = await fetchAdminNavTree()
      if (!cancelled && data) setNavConfig(data)
    }
    loadNav()
    window.addEventListener('nidus-admin-nav-refresh', loadNav)
    return () => {
      cancelled = true
      window.removeEventListener('nidus-admin-nav-refresh', loadNav)
    }
  }, [])

  const { standalone: STANDALONE, sections: NAV_SECTIONS } = navConfig

  const visibleSections = useMemo(
    () => NAV_SECTIONS
      .filter((section) => canSee(section, role))
      .map((section) => ({
        ...section,
        groups: section.groups
          .map((group) => ({
            ...group,
            items: group.items.filter((item) => canSee(item, role)),
          }))
          .filter((group) => group.items.length > 0),
      }))
      .filter((section) => section.groups.length > 0),
    [role],
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ openSectionId, groupOpenState }))
  }, [openSectionId, groupOpenState])

  useEffect(() => {
    setNavState((current) => {
      const focused = buildFocusedNavState(location.pathname, role, visibleSections)
      if (
        current.openSectionId === focused.openSectionId
        && JSON.stringify(current.groupOpenState) === JSON.stringify(focused.groupOpenState)
      ) {
        return current
      }
      return focused
    })
  }, [location.pathname, role, visibleSections])

  const toggleSection = (sectionId) => {
    setNavState((current) => {
      if (current.openSectionId === sectionId) {
        return { ...current, openSectionId: null }
      }
      const section = visibleSections.find((s) => s.id === sectionId)
      if (!section) {
        return { ...current, openSectionId: sectionId }
      }
      const activeGroupId = getActiveGroupId(location.pathname, section, role)
      const groupOpenState = {}
      for (const group of section.groups) {
        const groupId = getGroupId(sectionId, group.label)
        groupOpenState[groupId] = activeGroupId ? groupId === activeGroupId : false
      }
      return { openSectionId: sectionId, groupOpenState }
    })
  }

  const toggleGroup = (sectionId, group) => {
    const groupId = getGroupId(sectionId, group.label)
    const currentlyOpen = isGroupOpen(sectionId, group, location.pathname, role, groupOpenState)
    setNavState((current) => {
      const section = visibleSections.find((s) => s.id === sectionId)
      const nextGroupState = { ...current.groupOpenState }
      if (section) {
        for (const sibling of section.groups) {
          const siblingId = getGroupId(sectionId, sibling.label)
          nextGroupState[siblingId] = siblingId === groupId ? !currentlyOpen : false
        }
      } else {
        nextGroupState[groupId] = !currentlyOpen
      }
      return { ...current, groupOpenState: nextGroupState }
    })
  }

  return (
    <aside
      className={`grid h-full shrink-0 grid-rows-[minmax(0,1fr)_auto] border-r border-gray-800 bg-gray-900 transition-all ${collapsed ? 'w-16' : 'w-64'}`}
    >
      <nav className="min-h-0 overflow-y-auto overflow-x-hidden p-2 pt-3 text-xs">
        {STANDALONE.filter((item) => canSee(item, role)).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            title={item.label}
            className={({ isActive }) =>
              `mb-1 flex items-center rounded px-3 py-2 ${
                isActive || isNavItemActive(location.pathname, item)
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
              }`
            }
          >
            {!collapsed && item.label}
          </NavLink>
        ))}

        {visibleSections.map((section) => {
          const isOpen = openSectionId === section.id
          const sectionItems = getSectionItems(section)

          if (collapsed) {
            return sectionItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                title={item.label}
                className={() =>
                  `mb-1 flex items-center rounded px-3 py-2 ${
                    isNavItemActive(location.pathname, item, sectionItems, role)
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
                  }`
                }
              >
                <span className="mx-auto h-1.5 w-1.5 rounded-full bg-current" />
              </NavLink>
            ))
          }

          return (
            <NavSection
              key={section.id}
              section={section}
              isOpen={isOpen}
              pathname={location.pathname}
              role={role}
              groupOpenState={groupOpenState}
              onToggleSection={toggleSection}
              onToggleGroup={toggleGroup}
            />
          )
        })}
      </nav>

      <div className="border-t border-gray-800 bg-gray-900 p-4">
        {!collapsed && (
          <>
            <p className="truncate text-sm text-gray-200">{adminUser?.full_name}</p>
            <AdminBadge label={ROLE_LABELS[role] || role} variant={role} />
          </>
        )}
        <button
          type="button"
          onClick={logout}
          className={`w-full rounded-lg bg-gray-800 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-gray-700 ${collapsed ? '' : 'mt-3'}`}
        >
          {collapsed ? '⎋' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
