function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function generateExportFilename(table, filters = {}, format = 'csv') {
  const date = new Date().toISOString().slice(0, 10)
  const filterKey = Object.entries(filters)
    .filter(([, value]) => value && value !== 'all')
    .map(([key, value]) => `${key}-${value}`)
    .join('_')
  const suffix = filterKey ? `_${filterKey}` : ''
  return `${table}_${date}${suffix}.${format}`
}

export function exportToFile(rows, columns, filename, format = 'csv') {
  if (!rows?.length) {
    return { data: false, error: 'No rows to export' }
  }

  if (format === 'json') {
    const payload = rows.map((row) => {
      const entry = {}
      for (const col of columns) {
        const key = col.key || col
        const label = col.label || col
        entry[typeof col === 'string' ? col : label] = row[key]
      }
      return entry
    })
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename)
    return { data: true, error: null }
  }

  const normalized = columns.map((col) => (
    typeof col === 'string' ? { key: col, label: col } : col
  ))
  const headers = normalized.map((col) => col.label)
  const csv = [
    headers.join(','),
    ...rows.map((row) => normalized.map((col) => {
      const raw = col.exportValue ? col.exportValue(row) : row[col.key]
      return JSON.stringify(raw ?? '')
    }).join(',')),
  ].join('\n')

  downloadBlob(new Blob([csv], { type: 'text/csv' }), filename)
  return { data: true, error: null }
}
