export function toError(error, fallback = 'Something went wrong.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || String(error) || fallback
}

export function statusVariant(status) {
  if (status === 'approved' || status === 'active' || status === 'converted') return 'green'
  if (status === 'pending') return 'yellow'
  if (status === 'rejected' || status === 'revoked' || status === 'expired') return 'red'
  return 'gray'
}

export const ORG_ROLES = [
  'org_admin', 'pmo_admin', 'project_manager', 'programme_manager',
  'portfolio_manager', 'team_lead', 'team_member', 'executive', 'stakeholder', 'viewer',
]

export const PROJECT_ROLES = [
  'project_manager', 'team_lead', 'team_member', 'executive', 'stakeholder', 'viewer',
]
