/**
 * AdminMultiLineListInput — Admin parity of monorepo MultiLineListInput (v1061 / rule).
 * Value is a newline-joined string. Requires stable `viewModeId`.
 */

import { useState, useEffect } from 'react'
import { Plus, X, Check, Grid, List } from 'lucide-react'
import { useViewMode, getDisplayRowNumber } from '@nidus-admin/shared'
import { AdminIconActionButton } from './AdminIconActionButton.jsx'
import { AdminModal } from './AdminModal.jsx'

export function parseMultiLineValue(value) {
  if (!value || typeof value !== 'string') return []
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export function joinMultiLineValue(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => String(l).trim()).filter(Boolean).join('\n')
}

function AdminFieldViewToggle({ value, onChange, ariaLabel = 'List layout' }) {
  return (
    <div
      className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        aria-label="Card grid view"
        aria-pressed={value === 'grid'}
        title="Card view"
        onClick={() => onChange('grid')}
        className={`min-h-[44px] min-w-[44px] p-2 rounded transition-colors flex items-center justify-center ${
          value === 'grid'
            ? 'bg-sky-600 text-white'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        <Grid className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Table list view"
        aria-pressed={value === 'list'}
        title="Table view"
        onClick={() => onChange('list')}
        className={`min-h-[44px] min-w-[44px] p-2 rounded transition-colors flex items-center justify-center ${
          value === 'list'
            ? 'bg-sky-600 text-white'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`}
      >
        <List className="h-5 w-5" />
      </button>
    </div>
  )
}

export function AdminMultiLineListInput({
  viewModeId,
  id,
  value,
  onChange,
  placeholder = '',
  ariaLabelPrefix = 'item',
  itemColumnLabel = 'Item',
  disabled = false,
}) {
  if (!viewModeId && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('AdminMultiLineListInput: viewModeId is required for view persistence.')
  }

  const [viewMode, setViewMode] = useViewMode(viewModeId || `multiline-missing-${id || 'field'}`, 'list')
  const [draft, setDraft] = useState('')
  const [editingIndex, setEditingIndex] = useState(null)
  const [editDraft, setEditDraft] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const lines = parseMultiLineValue(value)

  useEffect(() => {
    setEditingIndex(null)
    setEditDraft('')
  }, [viewMode])

  const setLines = (next) => onChange(joinMultiLineValue(next))

  const addDraft = () => {
    const t = draft.trim()
    if (!t) return
    setLines([...lines, t])
    setDraft('')
  }

  const startEdit = (index) => {
    setEditingIndex(index)
    setEditDraft(lines[index] || '')
  }

  const saveEdit = () => {
    if (editingIndex == null) return
    const t = editDraft.trim()
    if (!t) return
    const next = [...lines]
    next[editingIndex] = t
    setLines(next)
    setEditingIndex(null)
    setEditDraft('')
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditDraft('')
  }

  const confirmDelete = () => {
    if (pendingDelete === 'all') {
      setLines([])
      setDraft('')
      setEditingIndex(null)
    } else if (typeof pendingDelete === 'number') {
      setLines(lines.filter((_, i) => i !== pendingDelete))
      if (editingIndex === pendingDelete) {
        setEditingIndex(null)
        setEditDraft('')
      } else if (editingIndex != null && pendingDelete < editingIndex) {
        setEditingIndex(editingIndex - 1)
      }
    }
    setPendingDelete(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">View</span>
        <AdminFieldViewToggle
          value={viewMode}
          onChange={setViewMode}
          ariaLabel={`${ariaLabelPrefix} layout`}
        />
      </div>

      {viewMode === 'list' ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th
                  scope="col"
                  aria-label="Row number"
                  className="w-12 min-w-[3rem] px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  #
                </th>
                <th
                  scope="col"
                  className="px-3 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                >
                  {itemColumnLabel}
                </th>
                {!disabled && (
                  <th
                    scope="col"
                    className="px-3 py-3 text-right text-xs font-medium text-gray-600 dark:text-gray-300 uppercase tracking-wider w-28"
                  >
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={disabled ? 2 : 3}
                    className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400"
                  >
                    None recorded.
                  </td>
                </tr>
              ) : (
                lines.map((line, index) => (
                  <tr key={`${index}-${line.slice(0, 24)}`}>
                    <td className="w-12 min-w-[3rem] px-3 py-4 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                      {getDisplayRowNumber(index)}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {editingIndex === index ? (
                        <input
                          type="text"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelEdit()
                            }
                          }}
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          aria-label={`Edit ${ariaLabelPrefix} ${index + 1}`}
                          autoFocus
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{line}</span>
                      )}
                    </td>
                    {!disabled && (
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          {editingIndex === index ? (
                            <>
                              <button
                                type="button"
                                onClick={saveEdit}
                                disabled={!editDraft.trim()}
                                className="p-2 rounded text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-50"
                                aria-label={`Save ${ariaLabelPrefix} ${index + 1}`}
                                title="Save"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="p-2 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                                aria-label={`Cancel editing ${ariaLabelPrefix} ${index + 1}`}
                                title="Cancel"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <AdminIconActionButton
                                variant="edit"
                                label={`Edit ${ariaLabelPrefix} ${index + 1}`}
                                onClick={() => startEdit(index)}
                              />
                              <AdminIconActionButton
                                variant="delete"
                                label={`Remove ${ariaLabelPrefix} ${index + 1}`}
                                onClick={() => setPendingDelete(index)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map((line, index) => (
                <li
                  key={`${index}-${line.slice(0, 24)}`}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                >
                  <span className="flex-1 text-gray-900 dark:text-white whitespace-pre-wrap">{line}</span>
                  {!disabled && (
                    <AdminIconActionButton
                      variant="delete"
                      label={`Remove ${ariaLabelPrefix} ${index + 1}`}
                      onClick={() => setPendingDelete(index)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          {lines.length === 0 && disabled && (
            <p className="text-sm text-gray-500 dark:text-gray-400">None recorded.</p>
          )}
        </div>
      )}

      {!disabled && lines.length > 0 && (
        <button
          type="button"
          onClick={() => setPendingDelete('all')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <X className="h-4 w-4" /> Clear all
        </button>
      )}

      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addDraft()
              }
            }}
            placeholder={placeholder}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            aria-label={`New ${ariaLabelPrefix}`}
          />
          <button
            type="button"
            onClick={addDraft}
            disabled={!draft.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      )}

      <AdminModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={pendingDelete === 'all' ? 'Clear all items?' : `Remove ${ariaLabelPrefix}?`}
        confirmLabel="Remove"
        danger
      >
        <p>
          {pendingDelete === 'all'
            ? 'This removes every line from this field. You can still discard the parent form later if you have not saved.'
            : `Remove this ${ariaLabelPrefix}? You can still discard the parent form later if you have not saved.`}
        </p>
      </AdminModal>
    </div>
  )
}

export default AdminMultiLineListInput
