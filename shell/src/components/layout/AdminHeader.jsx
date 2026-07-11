import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext.jsx'
import { ROLE_LABELS, fetchCurrentBusinessDate } from '@nidus-admin/shared'
import { AdminBadge } from '@nidus-admin/ui'
import NotificationBell from './NotificationBell.jsx'

function MenuIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function ChevronDownIcon({ className = 'h-4 w-4', open = false }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`${className} transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
    </svg>
  )
}

function LogOutIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
  )
}

function ShieldIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function userInitials(adminUser) {
  const name = adminUser?.full_name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const email = adminUser?.email || ''
  return email.slice(0, 2).toUpperCase() || 'AD'
}

function titleCase(value) {
  return value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pageLabelFromPath(pathname) {
  if (pathname === '/dashboard' || pathname === '/') return 'Dashboard'
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length >= 2) return titleCase(segments[1])
  if (segments.length === 1) return titleCase(segments[0])
  return 'Dashboard'
}

export default function AdminHeader({ sidebarCollapsed, onToggleSidebar }) {
  const { adminUser, role, logout } = useAdminAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [businessDate, setBusinessDate] = useState('')

  const pageLabel = useMemo(() => pageLabelFromPath(location.pathname), [location.pathname])
  const initials = useMemo(() => userInitials(adminUser), [adminUser])
  const showBusinessDate = role === 'super_admin' || role === 'system_admin'

  useEffect(() => {
    if (!showBusinessDate) return
    let cancelled = false
    fetchCurrentBusinessDate().then(({ data }) => {
      if (cancelled || !data) return
      const value = typeof data === 'string' ? data : String(data)
      const date = new Date(`${value}T12:00:00`)
      const weekday = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { weekday: 'short' })
      setBusinessDate(weekday ? `${value} (${weekday})` : value)
    })
    return () => { cancelled = true }
  }, [showBusinessDate, location.pathname])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuOpen && !event.target.closest('.admin-user-menu')) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-900/90">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <MenuIcon />
          </button>

          <Link
            to="/dashboard"
            className="group flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 transition-opacity hover:opacity-90"
            title="Go to Admin Console dashboard"
          >
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Project
                </span>
                <span className="ml-0.5 bg-gradient-to-r from-orange-400 via-red-500 to-red-600 bg-clip-text text-transparent sm:ml-1">
                  Nidus
                </span>
              </h1>
              <p className="hidden text-[10px] font-medium text-gray-500 sm:block sm:text-xs">
                Admin Console
              </p>
            </div>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center px-4 md:flex">
          <div className="flex max-w-md flex-wrap items-center justify-center gap-2 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-1.5 text-sm text-gray-400">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="truncate">Session active</span>
            <span className="text-gray-600">·</span>
            <span className="truncate font-medium text-gray-300">{pageLabel}</span>
            {showBusinessDate && businessDate && (
              <>
                <span className="text-gray-600">·</span>
                <span className="truncate text-gray-400">Business Date: <span className="font-medium text-gray-300">{businessDate}</span></span>
              </>
            )}
          </div>
        </div>

        <div className="admin-user-menu relative flex shrink-0 items-center gap-2 sm:gap-3">
          <NotificationBell />
          <div className="hidden text-right sm:block">
            <p className="max-w-[180px] truncate text-sm font-medium text-gray-200 md:max-w-[240px]">
              {adminUser?.full_name || adminUser?.email || 'Admin user'}
            </p>
            <p className="max-w-[180px] truncate text-xs text-gray-500 md:max-w-[240px]">
              {adminUser?.email}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg p-1 text-gray-300 transition-colors hover:bg-gray-800 sm:gap-2 sm:p-1.5"
            aria-label="Admin account menu"
            aria-expanded={menuOpen}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-violet-600 text-sm font-semibold text-white shadow-md">
              {initials}
            </div>
            <ChevronDownIcon className="hidden h-4 w-4 text-gray-400 sm:block" open={menuOpen} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+0.5rem)] w-64 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
              <div className="border-b border-gray-800 px-4 py-3">
                <p className="truncate text-sm font-medium text-gray-100">
                  {adminUser?.full_name || 'Admin user'}
                </p>
                <p className="truncate text-xs text-gray-500">{adminUser?.email}</p>
                <div className="mt-2">
                  <AdminBadge label={ROLE_LABELS[role] || role} variant={role} />
                </div>
              </div>

              <Link
                to="/dashboard"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-800"
              >
                <ShieldIcon />
                <span>Admin Console</span>
              </Link>

              <div className="my-1 border-t border-gray-800" />

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  logout()
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-300 transition-colors hover:bg-red-950/40 hover:text-red-200"
              >
                <LogOutIcon />
                <span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-800 px-3 py-2 text-xs text-gray-500 md:hidden">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>Session active</span>
        <span className="text-gray-600">·</span>
        <span className="truncate font-medium text-gray-300">{pageLabel}</span>
      </div>
    </header>
  )
}
