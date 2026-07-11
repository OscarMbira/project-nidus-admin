/** Admin panel routes derived from sidebar + module route definitions. */

export const ADMIN_ALL_ROUTES = [
  { path: '/dashboard', module: 'core', label: 'Dashboard' },
  // Users & Orgs
  { path: '/users/user-list', module: 'users', label: 'Users' },
  { path: '/users/user-detail', module: 'users', label: 'User Detail' },
  { path: '/users/user-suspend', module: 'users', label: 'User Suspend' },
  { path: '/users/org-list', module: 'users', label: 'Organisations' },
  { path: '/users/org-detail', module: 'users', label: 'Org Detail' },
  { path: '/users/user-activity', module: 'users', label: 'User Activity' },
  // Subscriptions
  { path: '/subscriptions/subscription-list', module: 'subscriptions', label: 'Paying Subscriptions' },
  { path: '/subscriptions/subscription-change-history', module: 'subscriptions', label: 'Subscription Change History' },
  { path: '/subscriptions/subscription-preview', module: 'subscriptions', label: 'Pricing Preview' },
  { path: '/subscriptions/pricing-preview-history', module: 'subscriptions', label: 'Pricing Change History' },
  { path: '/subscriptions/revenue-dashboard', module: 'subscriptions', label: 'Revenue' },
  { path: '/subscriptions/revenue-history', module: 'subscriptions', label: 'Revenue History' },
  { path: '/subscriptions/invoices', module: 'subscriptions', label: 'Invoices' },
  { path: '/subscriptions/tax-rates', module: 'subscriptions', label: 'Tax Rates' },
  { path: '/subscriptions/refunds', module: 'subscriptions', label: 'Refunds' },
  { path: '/subscriptions/pricing-plans', module: 'subscriptions', label: 'Pricing Plans' },
  { path: '/subscriptions/plan-catalog', module: 'subscriptions', label: 'Subscriptions Catalog' },
  { path: '/subscriptions/plan-catalog-history', module: 'subscriptions', label: 'Catalog Change History' },
  { path: '/subscriptions/plan-catalog-form', module: 'subscriptions', label: 'Subscriptions Catalog Form' },
  { path: '/subscriptions/payment-transactions', module: 'subscriptions', label: 'Payments' },
  // System
  { path: '/system/system-settings', module: 'system', label: 'System Settings' },
  { path: '/system/feature-flags', module: 'system', label: 'Feature Flags' },
  { path: '/system/maintenance-mode', module: 'system', label: 'Maintenance' },
  { path: '/system/system-health', module: 'system', label: 'System Health' },
  { path: '/system/currencies', module: 'system', label: 'Currencies' },
  { path: '/system/exchange-rates', module: 'system', label: 'Exchange Rates' },
  { path: '/system/countries', module: 'system', label: 'Countries' },
  { path: '/system/id-generation-rules', module: 'system', label: 'ID Rules' },
  { path: '/system/id-generated-list', module: 'system', label: 'Generated IDs' },
  { path: '/system/notification-templates', module: 'system', label: 'Notification Templates' },
  { path: '/system/alert-rules', module: 'system', label: 'Alert Rules' },
  { path: '/system/test-dashboard', module: 'system', label: 'Test Dashboard' },
  { path: '/system/test-fix-patterns', module: 'system', label: 'Fix Patterns' },
  // Support
  { path: '/support/support-ticket-list', module: 'support', label: 'Support Tickets' },
  { path: '/support/announcements', module: 'support', label: 'Announcements' },
  // Errors
  { path: '/errors/error-dashboard', module: 'errors', label: 'Error Dashboard' },
  { path: '/errors/error-alert-rules', module: 'errors', label: 'Error Alert Rules' },
  // Feedback
  { path: '/feedback/bug-tracking', module: 'feedback', label: 'Bug Tracking' },
  { path: '/feedback/feature-requests', module: 'feedback', label: 'Feature Requests' },
  { path: '/feedback/feedback-analysis', module: 'feedback', label: 'Feedback Analysis' },
  { path: '/feedback/improvement-backlog', module: 'feedback', label: 'Improvement Backlog' },
  // Platform admin
  { path: '/platform/platform-projects-overview', module: 'platform', label: 'Platform Projects' },
  { path: '/platform/platform-settings', module: 'platform', label: 'Platform Settings' },
  { path: '/platform/platform-health', module: 'platform', label: 'Platform Health' },
  { path: '/platform/user-impersonation', module: 'platform', label: 'Platform Impersonation' },
  // Mirrors
  { path: '/mirrors/platform-mirror', module: 'mirrors', label: 'Platform Mirror' },
  { path: '/mirrors/simulator-mirror', module: 'mirrors', label: 'Simulator Mirror' },
  // Simulator admin
  { path: '/simulator/sim-scenario-admin', module: 'simulator', label: 'Scenarios' },
  { path: '/simulator/sim-certificate-admin', module: 'simulator', label: 'Certificates' },
  { path: '/simulator/sim-leaderboard-admin', module: 'simulator', label: 'Leaderboard' },
  { path: '/simulator/sim-learning-path-admin', module: 'simulator', label: 'Learning Paths' },
  { path: '/simulator/sim-n-p-c-admin', module: 'simulator', label: 'NPC Admin' },
  { path: '/simulator/user-impersonation', module: 'simulator', label: 'Sim Impersonation' },
  // Content
  { path: '/content/documentation-c-m-s', module: 'content', label: 'Documentation CMS' },
  { path: '/content/help-management', module: 'content', label: 'Help Management' },
  { path: '/content/p-w-a-settings', module: 'content', label: 'PWA Settings' },
  { path: '/content/role-menu-config', module: 'content', label: 'Role Menu Config' },
  { path: '/content/email-templates', module: 'content', label: 'Email Templates' },
  { path: '/content/email-send-log', module: 'content', label: 'Email Send Log' },
  { path: '/content/languages', module: 'content', label: 'Languages' },
  { path: '/content/translations', module: 'content', label: 'Translations' },
  // Security
  { path: '/security/security-settings', module: 'security', label: 'Security Settings' },
  { path: '/security/s-s-o-management', module: 'security', label: 'SSO Management' },
  { path: '/security/security-monitoring', module: 'security', label: 'Security Monitoring' },
  { path: '/security/g-d-p-r-compliance', module: 'security', label: 'GDPR Compliance' },
  { path: '/security/performance-metrics', module: 'security', label: 'Performance Metrics' },
  { path: '/security/api-keys', module: 'security', label: 'API Keys' },
  { path: '/security/webhooks', module: 'security', label: 'Webhooks' },
  { path: '/security/webhook-log', module: 'security', label: 'Webhook Log' },
  // Audit
  { path: '/audit/audit-trail', module: 'audit', label: 'Audit Trail' },
  { path: '/audit/admin-activity', module: 'audit', label: 'Admin Activity' },
  { path: '/audit/session-history', module: 'audit', label: 'Session History' },
  { path: '/audit/export-logs', module: 'audit', label: 'Export Logs' },
  { path: '/audit/reports', module: 'audit', label: 'Reports' },
  { path: '/audit/report-builder', module: 'audit', label: 'Report Builder' },
  { path: '/audit/scheduled-reports', module: 'audit', label: 'Scheduled Reports' },
  // Batch ops
  { path: '/batch-ops/batch-jobs', module: 'batch-ops', label: 'Batch Jobs' },
  { path: '/batch-ops/batch-import', module: 'batch-ops', label: 'Data Import' },
  { path: '/batch-ops/cob-dashboard', module: 'batch-ops', label: 'COB Dashboard' },
  { path: '/batch-ops/business-calendar', module: 'batch-ops', label: 'Business Calendar' },
  { path: '/batch-ops/cob-processes', module: 'batch-ops', label: 'COB Processes' },
  // Admin mgmt
  { path: '/admin-mgmt/admin-user-list', module: 'admin-mgmt', label: 'Admin Users' },
  { path: '/admin-mgmt/admin-user-invite', module: 'admin-mgmt', label: 'Invite Admin' },
  { path: '/admin-mgmt/pending-activations', module: 'admin-mgmt', label: 'Pending Activations' },
  { path: '/admin-mgmt/role-permissions', module: 'admin-mgmt', label: 'Role Permissions' },
  { path: '/admin-mgmt/navigation-management', module: 'admin-mgmt', label: 'Navigation Management' },
  { path: '/admin-mgmt/active-sessions', module: 'admin-mgmt', label: 'Active Sessions' },
  { path: '/admin-mgmt/record-governance/lifecycle-configuration', module: 'admin-mgmt', label: 'Lifecycle Configuration' },
  { path: '/admin-mgmt/record-governance/authorisers', module: 'admin-mgmt', label: 'Authorisers' },
  { path: '/admin-mgmt/record-governance/archive-retention-rules', module: 'admin-mgmt', label: 'Archive Retention Rules' },
  { path: '/admin-mgmt/record-governance/my-approvals', module: 'admin-mgmt', label: 'My Approvals' },
]

const DENY_SYSTEM_ADMIN = [
  /^\/admin-mgmt\//,
  /^\/subscriptions\/revenue-dashboard$/,
  /^\/content\/role-menu-config$/,
  /^\/system\/maintenance-mode$/,
]

const ALLOW_SUPPORT_ADMIN = [
  /^\/dashboard$/,
  /^\/support\//,
  /^\/errors\//,
  /^\/feedback\//,
  /^\/platform\//,
  /^\/simulator\/user-impersonation$/,
]

const ALLOW_CONTENT_ADMIN = [
  /^\/dashboard$/,
  /^\/simulator\//,
  /^\/content\//,
]

export function routesForRole(role) {
  if (role === 'super_admin') {
    return ADMIN_ALL_ROUTES.map((r) => ({ ...r, shouldDeny: false }))
  }
  if (role === 'system_admin') {
    return ADMIN_ALL_ROUTES.map((r) => ({
      ...r,
      shouldDeny: DENY_SYSTEM_ADMIN.some((re) => re.test(r.path)),
    }))
  }
  if (role === 'support_admin') {
    return ADMIN_ALL_ROUTES.map((r) => ({
      ...r,
      shouldDeny: !ALLOW_SUPPORT_ADMIN.some((re) => re.test(r.path)),
    }))
  }
  if (role === 'content_admin') {
    return ADMIN_ALL_ROUTES.map((r) => ({
      ...r,
      shouldDeny: !ALLOW_CONTENT_ADMIN.some((re) => re.test(r.path)) || r.path === '/content/role-menu-config',
    }))
  }
  return ADMIN_ALL_ROUTES.map((r) => ({ ...r, shouldDeny: true }))
}

export const ADMIN_FEATURE_TESTS = {
  'admin-mgmt': [
    { name: 'List admin users', path: '/admin-mgmt/admin-user-list', operation: 'read' },
    { name: 'Open invite admin form', path: '/admin-mgmt/admin-user-invite', operation: 'read' },
    { name: 'View pending activations', path: '/admin-mgmt/pending-activations', operation: 'read' },
    { name: 'View role permissions', path: '/admin-mgmt/role-permissions', operation: 'read' },
    { name: 'Manage sidebar navigation', path: '/admin-mgmt/navigation-management', operation: 'read' },
    { name: 'View active sessions', path: '/admin-mgmt/active-sessions', operation: 'read' },
    { name: 'Lifecycle configuration', path: '/admin-mgmt/record-governance/lifecycle-configuration', operation: 'read' },
    { name: 'Record authorisers', path: '/admin-mgmt/record-governance/authorisers', operation: 'read' },
    { name: 'Archive retention rules', path: '/admin-mgmt/record-governance/archive-retention-rules', operation: 'read' },
    { name: 'My approvals queue', path: '/admin-mgmt/record-governance/my-approvals', operation: 'read' },
  ],
  users: [
    { name: 'List users', path: '/users/user-list', operation: 'read' },
    { name: 'Search users', path: '/users/user-list', operation: 'read' },
    { name: 'List organisations', path: '/users/org-list', operation: 'read' },
    { name: 'View user activity', path: '/users/user-activity', operation: 'read' },
  ],
  subscriptions: [
    { name: 'List subscriptions', path: '/subscriptions/subscription-list', operation: 'read' },
    { name: 'Pricing preview', path: '/subscriptions/subscription-preview', operation: 'read' },
    { name: 'List invoices', path: '/subscriptions/invoices', operation: 'read' },
    { name: 'List tax rates', path: '/subscriptions/tax-rates', operation: 'read' },
    { name: 'List refunds', path: '/subscriptions/refunds', operation: 'read' },
    { name: 'Pricing plans', path: '/subscriptions/pricing-plans', operation: 'read' },
    { name: 'Plan catalog', path: '/subscriptions/plan-catalog', operation: 'read' },
    { name: 'Payment transactions', path: '/subscriptions/payment-transactions', operation: 'read' },
  ],
  system: [
    { name: 'System settings', path: '/system/system-settings', operation: 'read' },
    { name: 'Feature flags', path: '/system/feature-flags', operation: 'read' },
    { name: 'Currencies list', path: '/system/currencies', operation: 'read' },
    { name: 'Exchange rates', path: '/system/exchange-rates', operation: 'read' },
    { name: 'Countries list', path: '/system/countries', operation: 'read' },
    { name: 'ID generation rules', path: '/system/id-generation-rules', operation: 'read' },
    { name: 'Generated IDs', path: '/system/id-generated-list', operation: 'read' },
    { name: 'Notification templates', path: '/system/notification-templates', operation: 'read' },
    { name: 'Alert rules', path: '/system/alert-rules', operation: 'read' },
  ],
  support: [
    { name: 'Support tickets', path: '/support/support-ticket-list', operation: 'read' },
    { name: 'Announcements', path: '/support/announcements', operation: 'read' },
  ],
  errors: [
    { name: 'Error dashboard', path: '/errors/error-dashboard', operation: 'read' },
    { name: 'Error alert rules', path: '/errors/error-alert-rules', operation: 'read' },
  ],
  feedback: [
    { name: 'Bug tracking', path: '/feedback/bug-tracking', operation: 'read' },
    { name: 'Feature requests', path: '/feedback/feature-requests', operation: 'read' },
    { name: 'Feedback analysis', path: '/feedback/feedback-analysis', operation: 'read' },
    { name: 'Improvement backlog', path: '/feedback/improvement-backlog', operation: 'read' },
  ],
  platform: [
    { name: 'Platform projects', path: '/platform/platform-projects-overview', operation: 'read' },
    { name: 'Platform settings', path: '/platform/platform-settings', operation: 'read' },
    { name: 'Platform health', path: '/platform/platform-health', operation: 'read' },
    { name: 'Platform impersonation', path: '/platform/user-impersonation', operation: 'read' },
  ],
  simulator: [
    { name: 'Scenario admin', path: '/simulator/sim-scenario-admin', operation: 'read' },
    { name: 'Certificate admin', path: '/simulator/sim-certificate-admin', operation: 'read' },
    { name: 'Leaderboard admin', path: '/simulator/sim-leaderboard-admin', operation: 'read' },
    { name: 'Learning paths admin', path: '/simulator/sim-learning-path-admin', operation: 'read' },
    { name: 'NPC admin', path: '/simulator/sim-n-p-c-admin', operation: 'read' },
  ],
  security: [
    { name: 'Security settings', path: '/security/security-settings', operation: 'read' },
    { name: 'SSO management', path: '/security/s-s-o-management', operation: 'read' },
    { name: 'API keys', path: '/security/api-keys', operation: 'read' },
    { name: 'Webhooks', path: '/security/webhooks', operation: 'read' },
  ],
  content: [
    { name: 'Documentation CMS', path: '/content/documentation-c-m-s', operation: 'read' },
    { name: 'Help management', path: '/content/help-management', operation: 'read' },
    { name: 'Email templates', path: '/content/email-templates', operation: 'read' },
    { name: 'Languages', path: '/content/languages', operation: 'read' },
    { name: 'Translations', path: '/content/translations', operation: 'read' },
  ],
  audit: [
    { name: 'Audit trail', path: '/audit/audit-trail', operation: 'read' },
    { name: 'Admin activity', path: '/audit/admin-activity', operation: 'read' },
    { name: 'Reports', path: '/audit/reports', operation: 'read' },
    { name: 'Report builder', path: '/audit/report-builder', operation: 'read' },
  ],
}

export const MODULE_ROLES = {
  'admin-mgmt': ['super_admin'],
  users: ['super_admin', 'system_admin'],
  subscriptions: ['super_admin', 'system_admin'],
  system: ['super_admin', 'system_admin'],
  support: ['super_admin', 'system_admin', 'support_admin'],
  errors: ['super_admin', 'system_admin', 'support_admin'],
  feedback: ['super_admin', 'system_admin', 'support_admin'],
  platform: ['super_admin', 'system_admin', 'support_admin'],
  simulator: ['super_admin', 'system_admin', 'content_admin'],
  security: ['super_admin', 'system_admin'],
  content: ['super_admin', 'system_admin', 'content_admin'],
  audit: ['super_admin', 'system_admin'],
}
