import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { inputClass } from './AdminForm.jsx'
import { shouldShowCreateOption } from './searchableSelectUtils.js'

const VIEWPORT_PADDING = 12
const PANEL_GAP = 6
const SEARCH_HEADER_HEIGHT = 52
const MIN_LIST_HEIGHT = 140
const MAX_LIST_HEIGHT = 300

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`}
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  )
}

function groupOptionsByCategory(options = []) {
  const groups = new Map()
  for (const option of options) {
    const category = option.category || 'General'
    if (!groups.has(category)) groups.set(category, [])
    groups.get(category).push(option)
  }
  return groups
}

function computePanelLayout(rect) {
  const width = Math.min(
    Math.max(rect.width, 320),
    window.innerWidth - VIEWPORT_PADDING * 2,
  )

  let left = rect.left
  if (left + width > window.innerWidth - VIEWPORT_PADDING) {
    left = Math.max(VIEWPORT_PADDING, window.innerWidth - width - VIEWPORT_PADDING)
  }

  const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING
  const spaceAbove = rect.top - PANEL_GAP - VIEWPORT_PADDING
  const preferredTotal = SEARCH_HEADER_HEIGHT + MAX_LIST_HEIGHT

  const openUp = spaceBelow < MIN_LIST_HEIGHT + SEARCH_HEADER_HEIGHT
    || (spaceBelow < preferredTotal && spaceAbove >= spaceBelow)

  let top
  let totalHeight
  let listHeight

  if (openUp) {
    totalHeight = Math.min(preferredTotal, spaceAbove)
    listHeight = Math.max(MIN_LIST_HEIGHT, totalHeight - SEARCH_HEADER_HEIGHT)
    totalHeight = SEARCH_HEADER_HEIGHT + listHeight
    top = rect.top - PANEL_GAP - totalHeight

    if (top < VIEWPORT_PADDING) {
      top = VIEWPORT_PADDING
      totalHeight = Math.min(preferredTotal, rect.top - PANEL_GAP - VIEWPORT_PADDING)
      listHeight = Math.max(MIN_LIST_HEIGHT, totalHeight - SEARCH_HEADER_HEIGHT)
      totalHeight = SEARCH_HEADER_HEIGHT + listHeight
    }
  } else {
    top = rect.bottom + PANEL_GAP
    totalHeight = Math.min(preferredTotal, spaceBelow)
    listHeight = Math.max(MIN_LIST_HEIGHT, totalHeight - SEARCH_HEADER_HEIGHT)
    totalHeight = SEARCH_HEADER_HEIGHT + listHeight

    if (top + totalHeight > window.innerHeight - VIEWPORT_PADDING) {
      totalHeight = window.innerHeight - VIEWPORT_PADDING - top
      listHeight = Math.max(MIN_LIST_HEIGHT, totalHeight - SEARCH_HEADER_HEIGHT)
      totalHeight = SEARCH_HEADER_HEIGHT + listHeight
    }
  }

  return { top, left, width, totalHeight, listHeight, openUp }
}

export function SearchableSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Search and select...',
  disabled = false,
  excludeValues = [],
  emptyMessage = 'No matching options.',
  searchPlaceholder = 'Search...',
  groupByCategory = false,
  allowCreate = false,
  createLabel = (query) => `Use '${query}'`,
}) {
  const containerRef = useRef(null)
  const searchRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [panelLayout, setPanelLayout] = useState(null)

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) || (value ? { value, label: value } : null),
    [options, value],
  )

  const availableOptions = useMemo(
    () => options.filter((option) => !excludeValues.includes(option.value) || option.value === value),
    [options, excludeValues, value],
  )

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return availableOptions
    return availableOptions.filter((option) => {
      const haystack = [
        option.label,
        option.description,
        option.category,
        option.value,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [availableOptions, search])

  const canCreate = useMemo(
    () => shouldShowCreateOption(allowCreate, search, availableOptions),
    [allowCreate, search, availableOptions],
  )

  const groupedOptions = useMemo(() => {
    if (!groupByCategory || search.trim()) return null
    return groupOptionsByCategory(filteredOptions)
  }, [filteredOptions, groupByCategory, search])

  const updatePanelPosition = useCallback(() => {
    const anchor = containerRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPanelLayout(computePanelLayout(rect))
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null)
      return undefined
    }

    updatePanelPosition()
    const syncTimer = window.setTimeout(updatePanelPosition, 350)

    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)
    return () => {
      window.clearTimeout(syncTimer)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open, filteredOptions.length, updatePanelPosition])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (containerRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-searchable-select-panel]')) return
      setOpen(false)
      setSearch('')
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  useEffect(() => {
    if (open) {
      searchRef.current?.focus()
    } else {
      setSearch('')
    }
  }, [open])

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev
      if (next && containerRef.current) {
        containerRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
        requestAnimationFrame(updatePanelPosition)
      }
      return next
    })
  }

  const handleSelect = (nextValue) => {
    onChange(nextValue)
    setOpen(false)
    setSearch('')
  }

  const renderOption = (option) => (
    <li key={option.value}>
      <button
        type="button"
        role="option"
        aria-selected={option.value === value}
        onClick={() => handleSelect(option.value)}
        className={`w-full px-3 py-2 text-left text-sm transition hover:bg-gray-800 ${
          option.value === value ? 'bg-blue-950/40 text-blue-100' : 'text-gray-200'
        }`}
      >
        <span className="block font-medium">{option.label}</span>
        {(option.category || option.description) && (
          <span className="mt-0.5 block text-xs text-gray-500">
            {[option.category, option.description].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>
    </li>
  )

  const panel = open && panelLayout
    ? createPortal(
      <div
        data-searchable-select-panel
        style={{
          position: 'fixed',
          top: panelLayout.top,
          left: panelLayout.left,
          width: panelLayout.width,
          height: panelLayout.totalHeight,
          zIndex: 9999,
        }}
        className="flex flex-col overflow-hidden rounded border border-gray-600 bg-gray-900 shadow-2xl"
      >
        <div className="shrink-0 border-b border-gray-800 p-2">
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <ul
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
          style={{ maxHeight: panelLayout.listHeight }}
          role="listbox"
        >
          {filteredOptions.length === 0 && !canCreate ? (
            <li className="px-3 py-2 text-sm text-gray-500">{emptyMessage}</li>
          ) : groupedOptions ? (
            Array.from(groupedOptions.entries()).map(([category, categoryOptions]) => (
              <Fragment key={category}>
                <li role="presentation" className="border-t border-gray-800/80 first:border-t-0">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {category}
                  </div>
                </li>
                {categoryOptions.map((option) => renderOption(option))}
              </Fragment>
            ))
          ) : (
            filteredOptions.map((option) => renderOption(option))
          )}
          {canCreate && (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(search.trim())}
                className="w-full px-3 py-2 text-left text-sm text-emerald-300 transition hover:bg-gray-800"
              >
                {createLabel(search.trim())}
              </button>
            </li>
          )}
        </ul>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div ref={containerRef} className="relative min-w-0 flex-1">
        <button
          type="button"
          disabled={disabled}
          onClick={handleToggle}
          className={`${inputClass} flex w-full items-center justify-between gap-2 text-left disabled:opacity-40`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={`truncate ${selectedOption ? 'text-gray-100' : 'text-gray-500'}`}>
            {selectedOption?.label || placeholder}
          </span>
          <ChevronIcon open={open} />
        </button>
      </div>
      {panel}
    </>
  )
}
