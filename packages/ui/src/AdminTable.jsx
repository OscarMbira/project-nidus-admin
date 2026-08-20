import { useEffect, useState } from 'react'

export function AdminTable({
  columns = [],
  rows = [],
  sortKey,
  sortDir,
  onSort,
  page: controlledPage,
  pageSize = 20,
  onPageChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  selectableFilter,
  idKey = 'id',
  summaryRow = null,
  summaryLabel = 'Total',
  showPagination = true,
  defaultSortKey = null,
  defaultSortDir = null,
}) {
  const [internalSort, setInternalSort] = useState({
    key: defaultSortKey,
    dir: defaultSortDir,
  })
  const [internalPage, setInternalPage] = useState(1)
  const activeSort = sortKey !== undefined ? { key: sortKey, dir: sortDir } : internalSort
  const page = controlledPage !== undefined ? controlledPage : internalPage

  const handleSort = (key) => {
    const cycle = { null: 'asc', asc: 'desc', desc: null }
    const next = activeSort.key === key ? cycle[activeSort.dir || 'null'] : 'asc'
    if (onSort) onSort(key, next)
    else setInternalSort({ key: next ? key : null, dir: next })
  }

  const setPage = (next) => {
    if (onPageChange) onPageChange(next)
    else setInternalPage(next)
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize) || 1)
  const safePage = Math.min(Math.max(1, page), totalPages)

  useEffect(() => {
    if (controlledPage === undefined && internalPage !== safePage) {
      setInternalPage(safePage)
    }
  }, [controlledPage, internalPage, safePage])

  // Reset to page 1 when filter/sort changes row set size meaningfully
  useEffect(() => {
    if (controlledPage === undefined) setInternalPage(1)
  }, [rows.length, activeSort.key, activeSort.dir, controlledPage])

  const start = (safePage - 1) * pageSize
  const visibleRows = sorted.slice(start, start + pageSize)
  const end = start + visibleRows.length

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
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900">
        <table className="min-w-full text-sm text-gray-200">
          <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
            <tr>
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible rows"
                    className="rounded border-gray-600 bg-gray-900"
                  />
                </th>
              )}
              <th className="w-12 px-4 py-3">#</th>
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

      {showPagination && sorted.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-400">
          <p>
            Showing <span className="text-gray-200">{sorted.length === 0 ? 0 : start + 1}</span>
            –
            <span className="text-gray-200">{end}</span>
            {' '}of <span className="text-gray-200">{sorted.length}</span>
            {totalPages > 1 ? ` · Page ${safePage} of ${totalPages}` : null}
          </p>
          {totalPages > 1 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                className="rounded border border-gray-600 px-3 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                className="rounded border border-gray-600 px-3 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
