/** Dev start commands and federation prefetch loaders per remote module. */
export const MODULE_REGISTRY = {
  users: {
    label: 'Users',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/users',
    load: () => import('admin_users/routes'),
  },
  subscriptions: {
    label: 'Subscriptions',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/subscriptions',
    load: () => import('admin_subscriptions/routes'),
  },
  system: {
    label: 'System',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/system',
    load: () => import('admin_system/routes'),
  },
  support: {
    label: 'Support',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/support',
    load: () => import('admin_support/routes'),
  },
  errors: {
    label: 'Errors',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/errors',
    load: () => import('admin_errors/routes'),
  },
  mirrors: {
    label: 'Mirrors',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/mirrors',
    load: () => import('admin_mirrors/routes'),
  },
  platform: {
    label: 'Platform',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/platform',
    load: () => import('admin_platform/routes'),
  },
  simulator: {
    label: 'Simulator',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/simulator',
    load: () => import('admin_simulator/routes'),
  },
  security: {
    label: 'Security',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/security',
    load: () => import('admin_security/routes'),
  },
  content: {
    label: 'Content',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/content',
    load: () => import('admin_content/routes'),
  },
  feedback: {
    label: 'Feedback',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/feedback',
    load: () => import('admin_feedback/routes'),
  },
  audit: {
    label: 'Audit',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/audit',
    load: () => import('admin_audit/routes'),
  },
  'admin-mgmt': {
    label: 'Admin Management',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/admin-mgmt',
    load: () => import('admin_admin_mgmt/routes'),
  },
  'batch-ops': {
    label: 'Batch Operations',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/batch-ops',
    load: () => import('admin_batch_ops/routes'),
  },
  affiliates: {
    label: 'Affiliates',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/affiliates',
    load: () => import('admin_affiliates/routes'),
  },
  'system-testers': {
    label: 'System Testers',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/system-testers',
    load: () => import('admin_system_testers/routes'),
  },
  'docs-centre': {
    label: 'Documentation Centre',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/docs-centre',
    load: () => import('admin_docs_centre/routes'),
  },
  'testing-centre': {
    label: 'Testing Centre',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/testing-centre',
    load: () => import('admin_testing_centre/routes'),
  },
  'email-centre': {
    label: 'Email Centre',
    devCommand: 'pnpm exec turbo dev --filter=@nidus-admin/shell --filter=@nidus-admin/email-centre',
    load: () => import('admin_email_centre/routes'),
  },
}

const ROUTE_PREFIXES = Object.keys(MODULE_REGISTRY)
  .map((module) => ({ module, prefix: `/${module}` }))
  .sort((a, b) => b.prefix.length - a.prefix.length)

export function resolveModuleFromPath(pathname = '') {
  const match = ROUTE_PREFIXES.find(({ prefix }) => pathname.startsWith(prefix))
  return match?.module ?? null
}

export function getModuleDevCommand(module) {
  return MODULE_REGISTRY[module]?.devCommand ?? null
}

export function getModuleLabel(module) {
  return MODULE_REGISTRY[module]?.label ?? module
}
