export const REFUND_WINDOW_DAYS = 30

export function daysSincePaid(paidAt) {
  if (!paidAt) return null
  return Math.floor((Date.now() - new Date(paidAt).getTime()) / (1000 * 60 * 60 * 24))
}

export function daysRemainingForRefund(paidAt) {
  if (!paidAt) return null
  return Math.max(0, REFUND_WINDOW_DAYS - daysSincePaid(paidAt))
}

export function isRefundableInvoice(invoice) {
  if (!invoice || invoice.status !== 'paid' || !invoice.paid_at) return false
  return daysRemainingForRefund(invoice.paid_at) > 0
}

export function refundWindowBadgeClass(daysLeft) {
  if (daysLeft == null) return 'text-gray-400'
  if (daysLeft === 0) return 'text-red-400'
  if (daysLeft < 5) return 'text-orange-400'
  return 'text-green-400'
}
