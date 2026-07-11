export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function createEmptyLineItem() {
  return {
    description: '',
    quantity: 1,
    unit_price: 0,
    amount: 0,
  }
}

export function normalizeLineItemsFromApi(raw) {
  const list = Array.isArray(raw) ? raw : []
  if (!list.length) return [createEmptyLineItem()]
  return list.map((item) => {
    const quantity = Number(item.quantity) || 1
    const unitPrice = Number(item.unit_price) || 0
    const amount = Number.isFinite(Number(item.amount))
      ? roundMoney(Number(item.amount))
      : roundMoney(quantity * unitPrice)
    return {
      description: String(item.description ?? ''),
      quantity,
      unit_price: unitPrice,
      amount,
    }
  })
}

export function recalculateLineItem(item, field, value) {
  const next = { ...item, [field]: value }
  if (field === 'quantity' || field === 'unit_price') {
    const quantity = field === 'quantity' ? Number(value) || 0 : Number(item.quantity) || 0
    const unitPrice = field === 'unit_price' ? Number(value) || 0 : Number(item.unit_price) || 0
    next.amount = roundMoney(quantity * unitPrice)
  }
  return next
}

export function serializeLineItemsForApi(items) {
  return (items || [])
    .filter((item) => item.description.trim() || item.amount > 0)
    .map(({ description, quantity, unit_price, amount }) => ({
      description: description.trim() || 'Line item',
      quantity: Number(quantity) || 1,
      unit_price: roundMoney(unit_price),
      amount: roundMoney(amount),
    }))
}

export function sumLineItems(items) {
  return roundMoney((items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0))
}

export function validateLineItems(items) {
  const serialized = serializeLineItemsForApi(items)
  if (!serialized.length) return 'Add at least one line item.'
  for (const item of serialized) {
    if (!item.description.trim()) return 'Each line item needs a description.'
    if (item.quantity <= 0) return 'Quantity must be greater than zero.'
    if (item.unit_price < 0 || item.amount < 0) return 'Prices must be non-negative.'
  }
  return null
}
