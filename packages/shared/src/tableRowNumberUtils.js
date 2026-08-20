/** Standard export column for list row numbers */
export const ROW_NUMBER_COLUMN = { key: '_rowNumber', label: '#' }

/**
 * Display row number for table/list views (1-based, viewport order).
 * @param {number} index - 0-based index in the current rendered slice
 * @param {{ page?: number, pageSize?: number }} [pagination]
 * @returns {number}
 */
export function getDisplayRowNumber(index, pagination = {}) {
  const i = Number(index)
  if (!Number.isFinite(i) || i < 0) return 1
  const page = Math.max(1, Number(pagination.page) || 1)
  const pageSize = Number(pagination.pageSize)
  if (Number.isFinite(pageSize) && pageSize > 0) {
    return (page - 1) * pageSize + i + 1
  }
  return i + 1
}

/**
 * Map rows to { row, displayNumber } pairs.
 * @param {Array} rows
 * @param {{ page?: number, pageSize?: number }} [pagination]
 */
export function withDisplayRowNumbers(rows, pagination = {}) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => ({
    row,
    displayNumber: getDisplayRowNumber(index, pagination),
  }))
}

/**
 * Prepend # column for list exports when not already present.
 * @param {Array<{ key: string, label: string }>} columns
 * @param {Array<Object>} rows
 * @param {{ page?: number, pageSize?: number, includeRowNumbers?: boolean }} [options]
 */
export function withExportRowNumbers(columns, rows, options = {}) {
  const { includeRowNumbers = true, page, pageSize } = options
  const safeColumns = columns || []
  const safeRows = rows || []
  if (!includeRowNumbers) {
    return { columns: safeColumns, rows: safeRows }
  }
  const hasRowCol = safeColumns.some(
    (c) => c.key === '_rowNumber' || c.key === 'row_number' || c.label === '#'
  )
  if (hasRowCol) {
    return { columns: safeColumns, rows: safeRows }
  }
  const pagination = { page, pageSize }
  const numberedRows = safeRows.map((row, index) => ({
    ...row,
    _rowNumber: getDisplayRowNumber(index, pagination),
  }))
  return {
    columns: [ROW_NUMBER_COLUMN, ...safeColumns],
    rows: numberedRows,
  }
}
