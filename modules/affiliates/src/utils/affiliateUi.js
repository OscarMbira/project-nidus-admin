const toError = (error, fallback) => (typeof error === 'string' ? error : error?.message || fallback)

export const statusVariant = (status) => {
  if (status === 'active' || status === 'paid') return 'active'
  if (status === 'pending') return 'pending_activation'
  if (status === 'approved') return 'system_admin'
  if (status === 'suspended' || status === 'terminated' || status === 'cancelled') return 'suspended'
  return 'content_admin'
}

export { toError }
