import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { ROLE_LABELS, fetchAdminNavTree, getDefaultAdminNav } from '@nidus-admin/shared'
import { AdminBadge, AdminSidebarNavTier, AdminSidebarNavTreeRow } from '@nidus-admin/ui'
import { resolveModuleFromPath } from '../../config/moduleRegistry.js'
import { prefetchRemoteModule } from '../../utils/prefetchRemote.js'

const STORAGE_KEY = 'nidus-admin-nav-sections'

const FALLBACK_NAV = getDefaultAdminNav()

/** Sidebar label sizes — section > subsection > group > leaf hierarchy. */
const NAV_SECTION_LABEL = 'text-xs font-medium uppercase tracking-wide text-gray-300'
const NAV_SUBSECTION_LABEL = 'text-xs font-semibold uppercase tracking-wide text-gray-300'
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

function getSubsectionId(sectionId, subsectionLabel) {
  return `${sectionId}::sub::${subsectionLabel}`
}

function getSectionItems(section) {
  const flat = section.groups.flatMap((group) => group.items)
  const nested = (section.subsections || []).flatMap((sub) => sub.groups.flatMap((group) => group.items))
  return [...flat, ...nested]
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

/** Returns which group (flat or nested inside a subsection) matches the route, plus its subsection scope if any. */
function getActiveGroupId(pathname, section, role) {
  for (const group of section.groups) {
    if (groupHasActiveItem(pathname, group, role)) {
      return { groupId: getGroupId(section.id, group.label), subsectionId: null }
    }
  }
  for (const subsection of section.subsections || []) {
    const subScopeId = getSubsectionId(section.id, subsection.label)
    for (const group of subsection.groups) {
      if (groupHasActiveItem(pathname, group, role)) {
        return { groupId: getGroupId(subScopeId, group.label), subsectionId: subScopeId }
      }
    }
  }
  return { groupId: null, subsectionId: null }
}

/** Keep only the top-level section, subsection, and sub-group that match the current route. */
function buildFocusedNavState(pathname, role, visibleSections) {
  const activeSection = visibleSections.find((section) => sectionHasActiveItem(section, role, pathname))
  if (!activeSection) {
    return { openSectionId: null, groupOpenState: {}, subsectionOpenState: {} }
  }

  const { groupId: activeGroupId, subsectionId: activeSubsectionId } = getActiveGroupId(pathname, activeSection, role)
  const groupOpenState = {}
  const subsectionOpenState = {}

  for (const group of activeSection.groups) {
    const groupId = getGroupId(activeSection.id, group.label)
    groupOpenState[groupId] = groupId === activeGroupId
  }

  for (const subsection of activeSection.subsections || []) {
    const subScopeId = getSubsectionId(activeSection.id, subsection.label)
    const isActiveSub = subScopeId === activeSubsectionId
    subsectionOpenState[subScopeId] = isActiveSub
    for (const group of subsection.groups) {
      const groupId = getGroupId(subScopeId, group.label)
      groupOpenState[groupId] = isActiveSub && groupId === activeGroupId
    }
  }

  return { openSectionId: activeSection.id, groupOpenState, subsectionOpenState }
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
        subsectionOpenState: parsed?.subsectionOpenState ?? {},
      }
    }
  } catch {
    // ignore invalid storage
  }
  return { openSectionId: null, groupOpenState: {}, subsectionOpenState: {} }
}

function isGroupOpen(sectionId, group, pathname, role, groupOpenState) {
  const groupId = getGroupId(sectionId, group.label)
  if (groupId in groupOpenState) return groupOpenState[groupId]
  return groupHasActiveItem(pathname, group, role)
}

/** Subsections toggle independently of each other (not an accordion) — only their internal groups accordion. */
function isSubsectionOpen(sectionId, subsection, pathname, role, subsectionOpenState) {
  const subScopeId = getSubsectionId(sectionId, subsection.label)
  if (subScopeId in subsectionOpenState) return subsectionOpenState[subScopeId]
  return subsection.groups.some((group) => groupHasActiveItem(pathname, group, role))
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

function NavGroup({ sectionId, group, siblingGroups, sectionItems, pathname, role, groupOpenState, onToggleGroup }) {
  const groupIsOpen = isGroupOpen(sectionId, group, pathname, role, groupOpenState)

  return (
    <div>
      {group.label && (
        <button
          type="button"
          onClick={() => onToggleGroup(sectionId, group, siblingGroups)}
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
        <AdminSidebarNavTier>
          {group.items.map((item) => {
            const isHistoryItem = item.path?.endsWith('-history')
            const isActive = isNavItemActive(pathname, item, sectionItems, role)
            return (
              <AdminSidebarNavTreeRow key={item.path}>
                <NavLink
                  to={item.path}
                  title={item.label}
                  onMouseEnter={() => prefetchModuleForPath(item.path)}
                  onFocus={() => prefetchModuleForPath(item.path)}
                  className={() => navLeafRowClass(isActive, { muted: isHistoryItem })}
                >
                  {item.label}
                </NavLink>
              </AdminSidebarNavTreeRow>
            )
          })}
        </AdminSidebarNavTier>
      )}
    </div>
  )
}

/** Wraps a cluster of related groups (e.g. Templates, Forms) under one collapsible header. Independent per subsection — opening one doesn't close its siblings. */
function NavSubsection({ sectionId, subsection, sectionItems, pathname, role, groupOpenState, subsectionOpenState, onToggleGroup, onToggleSubsection }) {
  const subScopeId = getSubsectionId(sectionId, subsection.label)
  const isOpen = isSubsectionOpen(sectionId, subsection, pathname, role, subsectionOpenState)

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleSubsection(sectionId, subsection)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between rounded py-2 pr-3 text-left hover:bg-gray-800/30"
      >
        <span className={NAV_SUBSECTION_LABEL}>{subsection.label}</span>
        <Chevron open={isOpen} size="sm" />
      </button>
      {isOpen && (
        <AdminSidebarNavTier>
          {subsection.groups.map((group) => (
            <NavGroup
              key={group.label}
              sectionId={subScopeId}
              group={group}
              siblingGroups={subsection.groups}
              sectionItems={sectionItems}
              pathname={pathname}
              role={role}
              groupOpenState={groupOpenState}
              onToggleGroup={onToggleGroup}
            />
          ))}
        </AdminSidebarNavTier>
      )}
    </div>
  )
}

function NavSection({ section, isOpen, pathname, role, groupOpenState, subsectionOpenState, onToggleSection, onToggleGroup, onToggleSubsection }) {
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
        <AdminSidebarNavTier>
          {section.groups.map((group) => (
            <NavGroup
              key={group.label}
              sectionId={section.id}
              group={group}
              siblingGroups={section.groups}
              sectionItems={sectionItems}
              pathname={pathname}
              role={role}
              groupOpenState={groupOpenState}
              onToggleGroup={onToggleGroup}
            />
          ))}
          {(section.subsections || []).map((subsection) => (
            <NavSubsection
              key={subsection.label}
              sectionId={section.id}
              subsection={subsection}
              sectionItems={sectionItems}
              pathname={pathname}
              role={role}
              groupOpenState={groupOpenState}
              subsectionOpenState={subsectionOpenState}
              onToggleGroup={onToggleGroup}
              onToggleSubsection={onToggleSubsection}
            />
          ))}
        </AdminSidebarNavTier>
      )}
    </div>
  )
}

export default function AdminSidebar({ collapsed }) {
  const { role, logout, adminUser } = useAdminAuth()
  const location = useLocation()
  const [navState, setNavState] = useState(() => loadNavState(role))
  const { openSectionId, groupOpenState, subsectionOpenState } = navState
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
        subsections: (section.subsections || [])
          .map((subsection) => ({
            ...subsection,
            groups: subsection.groups
              .map((group) => ({
                ...group,
                items: group.items.filter((item) => canSee(item, role)),
              }))
              .filter((group) => group.items.length > 0),
          }))
          .filter((subsection) => subsection.groups.length > 0),
      }))
      .filter((section) => section.groups.length > 0 || section.subsections.length > 0),
    [role],
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ openSectionId, groupOpenState, subsectionOpenState }))
  }, [openSectionId, groupOpenState, subsectionOpenState])

  useEffect(() => {
    setNavState((current) => {
      const focused = buildFocusedNavState(location.pathname, role, visibleSections)
      if (
        current.openSectionId === focused.openSectionId
        && JSON.stringify(current.groupOpenState) === JSON.stringify(focused.groupOpenState)
        && JSON.stringify(current.subsectionOpenState) === JSON.stringify(focused.subsectionOpenState)
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
      const { groupId: activeGroupId, subsectionId: activeSubsectionId } = getActiveGroupId(location.pathname, section, role)
      const groupOpenState = {}
      const subsectionOpenState = {}
      for (const group of section.groups) {
        const groupId = getGroupId(sectionId, group.label)
        groupOpenState[groupId] = activeGroupId ? groupId === activeGroupId : false
      }
      for (const subsection of section.subsections || []) {
        const subScopeId = getSubsectionId(sectionId, subsection.label)
        const isActiveSub = subScopeId === activeSubsectionId
        subsectionOpenState[subScopeId] = isActiveSub
        for (const group of subsection.groups) {
          const groupId = getGroupId(subScopeId, group.label)
          groupOpenState[groupId] = isActiveSub && groupId === activeGroupId
        }
      }
      return { openSectionId: sectionId, groupOpenState, subsectionOpenState }
    })
  }

  const toggleGroup = (scopeId, group, siblingGroups = []) => {
    const groupId = getGroupId(scopeId, group.label)
    const currentlyOpen = isGroupOpen(scopeId, group, location.pathname, role, groupOpenState)
    setNavState((current) => {
      const nextGroupState = { ...current.groupOpenState }
      if (siblingGroups.length) {
        for (const sibling of siblingGroups) {
          const siblingId = getGroupId(scopeId, sibling.label)
          nextGroupState[siblingId] = siblingId === groupId ? !currentlyOpen : false
        }
      } else {
        nextGroupState[groupId] = !currentlyOpen
      }
      return { ...current, groupOpenState: nextGroupState }
    })
  }

  const toggleSubsection = (sectionId, subsection) => {
    const subScopeId = getSubsectionId(sectionId, subsection.label)
    setNavState((current) => ({
      ...current,
      subsectionOpenState: {
        ...current.subsectionOpenState,
        [subScopeId]: !isSubsectionOpen(sectionId, subsection, location.pathname, role, current.subsectionOpenState),
      },
    }))
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
              subsectionOpenState={subsectionOpenState}
              onToggleSection={toggleSection}
              onToggleGroup={toggleGroup}
              onToggleSubsection={toggleSubsection}
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
