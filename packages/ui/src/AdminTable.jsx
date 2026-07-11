import { useState } from 'react'

export function AdminTable({
  columns = [],
  rows = [],
  sortKey,
  sortDir,
  onSort,
  page = 1,
  pageSize = 20,
  selectable = false,
  selectedIds,
  onSelectionChange,
  selectableFilter,
  idKey = 'id',
  summaryRow = null,
  summaryLabel = 'Total',
}) {
  const [internalSort, setInternalSort] = useState({ key: null, dir: null })
  const activeSort = sortKey !== undefined ? { key: sortKey, dir: sortDir } : internalSort

  const handleSort = (key) => {
    const cycle = { null: 'asc', asc: 'desc', desc: null }
    const next = activeSort.key === key ? cycle[activeSort.dir || 'null'] : 'asc'
    if (onSort) onSort(key, next)
    else setInternalSort({ key: next ? key : null, dir: next })
  }

  const sorted = [...rows]
  if (activeSort.key && activeSort.dir) {
    sorted.sort((a, b) => {
      const av = a[activeSort.key]
      const bv = b[activeSort.key]
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
      return activeSort.dir === 'asc' ? cmp : -cmp
    })
  }

  const start = (page - 1) * pageSize
  const visibleRows = sorted.slice(start, start + pageSize)

  const selectableRows = visibleRows.filter((row) => !selectableFilter || selectableFilter(row))
  const allVisibleSelected = selectableRows.length > 0
    && selectableRows.every((row) => selectedIds?.has(row[idKey]))

  const toggleRow = (row) => {
    if (!onSelectionChange || !selectedIds) return
    const id = row[idKey]
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  const toggleAllVisible = () => {
    if (!onSelectionChange || !selectedIds) return
    const next = new Set(selectedIds)
    if (allVisibleSelected) {
      selectableRows.forEach((row) => next.delete(row[idKey]))
    } else {
      selectableRows.forEach((row) => next.add(row[idKey]))
    }
    onSelectionChange(next)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
      <table className="min-w-full text-sm text-gray-200">
        <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
          <tr>
            {selectable && (
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible rows"
                  className="rounded border-gray-600 bg-gray-900"
                />
              </th>
            )}
            <th className="px-4 py-3 w-12">#</th>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3">
                {col.sortable !== false ? (
                  <button type="button" className="flex items-center gap-1 hover:text-gray-200" onClick={() => handleSort(col.key)}>
                    {col.label}
                    <span className="text-gray-500">
                      {activeSort.key === col.key ? (activeSort.dir === 'asc' ? '↑' : activeSort.dir === 'desc' ? '↓' : '⇅') : '⇅'}
                    </span>
                  </button>
                ) : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => {
            const isSelected = selectable && selectedIds?.has(row[idKey])
            const canSelect = !selectableFilter || selectableFilter(row)
            return (
              <tr
                key={row[idKey] || i}
                className={`border-t border-gray-800 hover:bg-gray-800/50 ${isSelected ? 'border-l-2 border-l-blue-500 bg-blue-950/30' : ''}`}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(isSelected)}
                      disabled={!canSelect}
                      onChange={() => toggleRow(row)}
                      aria-label="Select row"
                      className="rounded border-gray-600 bg-gray-900 disabled:opacity-40"
                    />
                  </td>
                )}
                <td className="px-4 py-3 text-gray-500">{start + i + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {summaryRow && (
          <tfoot className="border-t-2 border-gray-600 bg-gray-800/80 font-semibold text-gray-100">
            <tr>
              {selectable && <td className="px-4 py-3" />}
              <td className="px-4 py-3 text-gray-400">{summaryLabel}</td>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3">
                  {summaryRow[col.key] ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}
