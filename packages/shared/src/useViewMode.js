import { useState, useEffect, useCallback } from 'react'

/**
 * View mode (card grid vs table list) with localStorage persistence.
 * Mirrors monorepo @nidus/shared useViewMode for Admin parity (v1061).
 * Storage key: `nidus-admin-view-mode-{pageId}`
 *
 * @param {string} pageId — stable id for the field/page
 * @param {'grid'|'list'} [defaultMode='grid']
 * @returns {[('grid'|'list'), function]}
 */
export function useViewMode(pageId, defaultMode = 'grid') {
  const storageKey = `nidus-admin-view-mode-${pageId}`

  const [viewMode, setViewModeState] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw === 'list' || raw === 'grid') return raw
    } catch {
      /* ignore */
    }
    return defaultMode === 'list' ? 'list' : 'grid'
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, viewMode)
    } catch {
      /* ignore */
    }
  }, [storageKey, viewMode])

  const setViewMode = useCallback((next) => {
    setViewModeState(typeof next === 'function' ? (prev) => next(prev) : next)
  }, [])

  return [viewMode, setViewMode]
}
