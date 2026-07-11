export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function formatCurrency(amount, currency = 'USD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}
