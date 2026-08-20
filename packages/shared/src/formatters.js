export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function formatDateShort(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Compact table cell: short date with full timestamp in tooltip. */
export function formatDateCell(value) {
  const short = formatDateShort(value)
  if (short === '—') return short
  return { short, title: formatDate(value) }
}

export function formatCurrency(amount, currency = 'USD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}
