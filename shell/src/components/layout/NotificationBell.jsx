import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dismissNotification,
  fetchNotificationCount,
  fetchUnreadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@nidus-admin/shared'
import { useToast } from '@nidus-admin/ui'

function BellIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  )
}

function severityClass(severity) {
  if (severity === 'critical') return 'border-red-700 bg-red-900/30 text-red-200'
  if (severity === 'warning') return 'border-amber-700 bg-amber-900/30 text-amber-200'
  return 'border-blue-700 bg-blue-900/30 text-blue-200'
}

function formatWhen(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)

  const refresh = useCallback(async () => {
    const [countRes, listRes] = await Promise.all([
      fetchNotificationCount(),
      fetchUnreadNotifications(15),
    ])
    if (!countRes.error) setCount(Number(countRes.data) || 0)
    if (!listRes.error) setItems(listRes.data || [])
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 60000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (open && panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleToggle = async () => {
    if (!open) {
      setLoading(true)
      await refresh()
      setLoading(false)
    }
    setOpen((value) => !value)
  }

  const handleItemClick = async (item) => {
    const { error } = await markNotificationRead(item.id)
    if (error) {
      showError(error.message || String(error))
      return
    }
    setOpen(false)
    await refresh()
    if (item.action_url) {
      if (item.action_url.startsWith('http')) {
        window.location.href = item.action_url
      } else {
        navigate(item.action_url)
      }
    }
  }

  const handleDismiss = async (event, item) => {
    event.stopPropagation()
    const { error } = await dismissNotification(item.id)
    if (error) {
      showError(error.message || String(error))
      return
    }
    await refresh()
  }

  const handleMarkAllRead = async () => {
    const { error } = await markAllNotificationsRead()
    if (error) {
      showError(error.message || String(error))
      return
    }
    showSuccess('All notifications marked read.')
    await refresh()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        aria-expanded={open}
      >
        <BellIcon />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-80 overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
            <p className="text-sm font-medium text-gray-100">Notifications</p>
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-blue-300 hover:text-blue-200"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Loading...</p>
            ) : !items.length ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">No unread notifications</p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleItemClick(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') handleItemClick(item)
                  }}
                  className="flex w-full cursor-pointer gap-3 border-b border-gray-800 px-4 py-3 text-left transition-colors hover:bg-gray-800/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] uppercase ${severityClass(item.severity)}`}>
                        {item.severity || 'info'}
                      </span>
                      {item.category && (
                        <span className="text-[10px] uppercase text-gray-500">{item.category}</span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-gray-100">{item.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{item.message}</p>
                    <p className="mt-1 text-[10px] text-gray-600">{formatWhen(item.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => handleDismiss(event, item)}
                    className="shrink-0 self-start rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                    title="Dismiss"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
