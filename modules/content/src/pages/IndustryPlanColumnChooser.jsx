import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  availableColumns,
  getColumnLabel,
  shownOptionalColumns,
  isCustomColumnKey,
  CUSTOM_COLUMN_TYPES,
  MAX_CUSTOM_COLUMNS,
} from '@nidus-admin/shared'
import {
  AdminIconActionButton,
  inputClass,
} from '@nidus-admin/ui'

const TYPE_LABELS = {
  text: 'Text',
  number: 'Number',
  yes_no: 'Yes / No',
}

/**
 * MS Project–style Columns ▾ popover: Shown / Available + custom column define (v184).
 * Uses fixed positioning + flip so Custom columns stays visible when near viewport bottom.
 */
export function IndustryPlanColumnChooser({
  layout,
  opts,
  onShow,
  onHide,
  onMove,
  onReset,
  customDefs = [],
  onAddCustom,
  onUpdateCustom,
  onDeleteCustom,
}) {
  const [open, setOpen] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  const [newLabel, setNewLabel] = useState('')
  const [newType, setNewType] = useState('text')
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editType, setEditType] = useState('text')
  const [panelStyle, setPanelStyle] = useState(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const panelRef = useRef(null)
  const customSectionRef = useRef(null)

  const shown = shownOptionalColumns(layout, opts)
  const available = availableColumns(layout, opts.optionalPool)
  const labels = opts.labels || {}
  const defs = Array.isArray(customDefs) ? customDefs : []
  const atCap = defs.length >= MAX_CUSTOM_COLUMNS

  const reposition = () => {
    const btn = buttonRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const margin = 8
    const maxH = Math.min(window.innerHeight * 0.8, 576)
    const spaceBelow = window.innerHeight - r.bottom - margin
    const spaceAbove = r.top - margin
    const openUp = spaceBelow < Math.min(360, maxH) && spaceAbove > spaceBelow
    const availableH = Math.max(240, openUp ? spaceAbove : spaceBelow)

    setPanelStyle({
      position: 'fixed',
      zIndex: 80,
      right: Math.max(margin, window.innerWidth - r.right),
      width: Math.min(window.innerWidth - margin * 2, 480),
      maxHeight: Math.min(maxH, availableH),
      overflowY: 'auto',
      ...(openUp
        ? { bottom: window.innerHeight - r.top + 4, top: 'auto' }
        : { top: r.bottom + 4, bottom: 'auto' }),
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null)
      return undefined
    }
    reposition()
    // Keep Custom columns reachable after open
    const t = window.setTimeout(() => {
      customSectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 50)
    const onScrollOrResize = () => reposition()
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('scroll', onScrollOrResize, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', onScrollOrResize)
      window.removeEventListener('scroll', onScrollOrResize, true)
    }
  }, [open, defs.length, shown.length, available.length])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const labelFor = (key) => {
    const base = getColumnLabel(key, labels)
    return isCustomColumnKey(key) ? `${base}` : base
  }

  const handleCreate = () => {
    setFormError('')
    const result = onAddCustom?.({ label: newLabel, type: newType })
    if (!result?.ok) {
      setFormError(result?.error || 'Could not create column.')
      return
    }
    setNewLabel('')
    setNewType('text')
    if (result.id) onShow?.(result.id)
    window.requestAnimationFrame(() => {
      customSectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }

  const startEdit = (def) => {
    setEditingId(def.id)
    setEditLabel(def.label)
    setEditType(def.type)
    setFormError('')
  }

  const saveEdit = () => {
    const result = onUpdateCustom?.(editingId, { label: editLabel, type: editType })
    if (!result?.ok) {
      setFormError(result?.error || 'Could not update column.')
      return
    }
    setEditingId(null)
  }

  const handleDelete = (id) => {
    if (!window.confirm('Delete this custom column and clear its values on all rows?')) return
    const result = onDeleteCustom?.(id)
    if (!result?.ok) {
      setFormError(result?.error || 'Could not delete column.')
      return
    }
    onHide?.(id)
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Columns ▾
      </button>
      {open && panelStyle && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose columns"
          style={panelStyle}
          className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2 sticky top-0 z-10 bg-white dark:bg-gray-900 pb-1">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">Column layout</p>
            <button
              type="button"
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => onReset?.()}
            >
              Reset to default
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Shown
              </p>
              <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 p-1">
                {shown.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-gray-400">No optional columns</li>
                )}
                {shown.map((key) => (
                  <li
                    key={key}
                    draggable
                    onDragStart={() => setDragKey(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragKey) onMove?.(dragKey, key)
                      setDragKey(null)
                    }}
                    onDragEnd={() => setDragKey(null)}
                    className={`flex items-center justify-between gap-1 rounded px-1.5 py-1 text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      dragKey === key ? 'opacity-40' : ''
                    }`}
                  >
                    <span className="cursor-grab select-none truncate" title="Drag to reorder">
                      ⠿ {labelFor(key)}
                      {isCustomColumnKey(key) && (
                        <span className="ml-1 text-[10px] text-violet-600 dark:text-violet-400">Custom</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-gray-400 hover:text-red-500"
                      aria-label={`Hide ${labelFor(key)}`}
                      onClick={() => onHide?.(key)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Available
              </p>
              <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 p-1">
                {available.length === 0 && (
                  <li className="px-2 py-1.5 text-xs text-gray-400">All columns shown</li>
                )}
                {available.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="w-full rounded px-1.5 py-1 text-left text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() => onShow?.(key)}
                    >
                      □ {labelFor(key)}
                      {isCustomColumnKey(key) && (
                        <span className="ml-1 text-[10px] text-violet-600 dark:text-violet-400">Custom</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div
            ref={customSectionRef}
            className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3"
          >
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Custom columns
            </p>
            {defs.length > 0 && (
              <ul className="mb-2 max-h-28 space-y-1 overflow-y-auto">
                {defs.map((def) => (
                  <li
                    key={def.id}
                    className="rounded border border-gray-200 dark:border-gray-700 px-2 py-1.5 text-xs text-gray-800 dark:text-gray-200"
                  >
                    {editingId === def.id ? (
                      <div className="space-y-1.5">
                        <input
                          className={inputClass}
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Label"
                        />
                        <select
                          className={inputClass}
                          value={editType}
                          onChange={(e) => setEditType(e.target.value)}
                        >
                          {CUSTOM_COLUMN_TYPES.map((t) => (
                            <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={saveEdit}>
                            Save
                          </button>
                          <button type="button" className="text-gray-500 hover:underline" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          {def.label}
                          <span className="ml-1 text-gray-400">({TYPE_LABELS[def.type] || def.type})</span>
                        </span>
                        <span className="shrink-0 flex gap-2">
                          <AdminIconActionButton variant="edit" label="Edit" onClick={() => startEdit(def)} />
                          <AdminIconActionButton variant="delete" label="Delete" onClick={() => handleDelete(def.id)} />
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!atCap ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-500 dark:text-gray-400">+ Add custom column</p>
                <div className="flex flex-wrap gap-1.5">
                  <input
                    className={`${inputClass} min-w-[8rem] flex-1`}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Label"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCreate()
                      }
                    }}
                  />
                  <select
                    className={inputClass}
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                  >
                    {CUSTOM_COLUMN_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                    onClick={handleCreate}
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">Maximum of {MAX_CUSTOM_COLUMNS} custom columns reached.</p>
            )}
            {formError && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{formError}</p>
            )}
          </div>

          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
            Locked columns (WBS / # / Name / Actions) stay fixed. Custom columns are saved with the template.
          </p>
        </div>
      )}
    </div>
  )
}
