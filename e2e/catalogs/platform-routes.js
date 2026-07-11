/** Platform app routes for role-access and feature tests. */

export const PLATFORM_ROUTES = {
  pmo_admin: [
    '/dashboard', '/projects', '/projects/new', '/tasks', '/resources', '/resources/capacity',
    '/quality', '/quality/inspections', '/risks', '/issues', '/reports', '/reports/builder',
    '/settings', '/subscriptions', '/integrations', '/automation', '/cms', '/strategic/portfolio',
  ],
  project_manager: [
    '/dashboard', '/projects', '/tasks', '/tasks/board', '/resources', '/quality', '/risks',
    '/issues', '/daily-log', '/lessons', '/stakeholders', '/reports', '/dependencies', '/settings',
  ],
  programme_manager: [
    '/dashboard', '/programmes', '/benefits', '/stakeholders/strategic', '/dependencies/cross-project',
    '/reports/programme', '/settings',
  ],
  portfolio_manager: [
    '/dashboard', '/strategic/portfolio', '/strategic/objectives', '/benefits/realization', '/reports/strategic',
  ],
  team_lead: [
    '/dashboard', '/tasks', '/tasks/board', '/issues', '/daily-log/my-entries', '/settings',
  ],
  team_member: [
    '/dashboard', '/tasks', '/tasks/board', '/daily-log', '/daily-log/my-entries', '/settings',
  ],
  stakeholder: [
    '/dashboard', '/stakeholders/views', '/reports/shared', '/settings',
  ],
  viewer: [
    '/dashboard', '/projects/view', '/reports/shared', '/settings',
  ],
}

export const PLATFORM_FEATURE_TESTS = {
  projects: [
    { name: 'List projects', path: '/projects', roles: ['pmo_admin', 'project_manager'] },
    { name: 'New project form', path: '/projects/new', roles: ['pmo_admin', 'project_manager'] },
  ],
  tasks: [
    { name: 'Task list', path: '/tasks', roles: ['project_manager', 'team_lead', 'team_member'] },
    { name: 'Task board', path: '/tasks/board', roles: ['project_manager', 'team_lead', 'team_member'] },
  ],
  resources: [
    { name: 'Resource list', path: '/resources', roles: ['pmo_admin', 'project_manager'] },
    { name: 'Capacity view', path: '/resources/capacity', roles: ['pmo_admin', 'project_manager'] },
  ],
  quality: [
    { name: 'QMS dashboard', path: '/quality', roles: ['project_manager'] },
    { name: 'Inspections', path: '/quality/inspections', roles: ['project_manager'] },
  ],
  risks: [
    { name: 'Risk register', path: '/risks', roles: ['project_manager', 'pmo_admin'] },
  ],
  issues: [
    { name: 'Issue list', path: '/issues', roles: ['project_manager', 'team_lead'] },
  ],
  'daily-log': [
    { name: 'Daily log', path: '/daily-log', roles: ['project_manager', 'team_member'] },
  ],
  lessons: [
    { name: 'Lessons learned', path: '/lessons', roles: ['project_manager', 'pmo_admin'] },
  ],
  stakeholders: [
    { name: 'Stakeholders', path: '/stakeholders', roles: ['project_manager', 'programme_manager'] },
  ],
  cms: [
    { name: 'CMS pages', path: '/cms', roles: ['project_manager', 'pmo_admin'] },
  ],
  reports: [
    { name: 'Report builder', path: '/reports/builder', roles: ['pmo_admin', 'project_manager'] },
  ],
  subscriptions: [
    { name: 'Subscription dashboard', path: '/subscriptions', roles: ['pmo_admin', 'project_manager', 'team_member', 'viewer'] },
  ],
  settings: [
    { name: 'User settings', path: '/settings', roles: ['pmo_admin', 'project_manager', 'team_member', 'viewer'] },
  ],
}

export function platformRoutesForRole(role) {
  return PLATFORM_ROUTES[role] || ['/dashboard']
}
