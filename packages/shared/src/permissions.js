const ROLE_INHERITANCE = {
  super_admin: () => true,
  system_admin: (key) => !key.startsWith('admins.') && key !== 'system.deploy.view' && !key.startsWith('cob.'),
  support_admin: (key) => [
    'users.view', 'users.password_reset', 'users.impersonate', 'orgs.view',
    'subscriptions.view', 'subscriptions.edit', 'support.', 'errors.', 'audit.logs.view',
    'feedback.', 'security.incidents.view', 'platform.', 'simulator.', 'system.settings.view',
    'system.feature_flags.view', 'batch.export.',
  ].some((p) => key.startsWith(p.replace('.', '.')) || key === p || key.startsWith(p)),
  content_admin: (key) => key.startsWith('simulator.') || key.startsWith('content.') || key.startsWith('batch.export.'),
}

export function hasPermission(role, permissions, key) {
  if (!role || !key) return false
  if (permissions?.includes(key)) return true
  if (role === 'super_admin') return true
  const checker = ROLE_INHERITANCE[role]
  return checker ? checker(key) : false
}
