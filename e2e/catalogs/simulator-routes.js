/** Simulator app routes for role-access and feature tests. */

export const SIMULATOR_ROUTES = {
  portfolio: [
    '/dashboard', '/portfolio/dashboard', '/portfolio/practice', '/learning-paths', '/certificates', '/leaderboard',
  ],
  programme: [
    '/dashboard', '/programme/dashboard', '/programme/practice', '/learning-paths', '/certificates', '/leaderboard',
  ],
  coordinator: [
    '/dashboard', '/coordinator/dashboard', '/coordinator/practice', '/learning-paths', '/certificates',
  ],
  pmo: [
    '/dashboard', '/pmo/dashboard', '/pmo/practice', '/learning-paths', '/certificates', '/leaderboard', '/analytics',
  ],
}

export const SIMULATOR_FEATURE_TESTS = {
  'role-selection': [
    { name: 'Role selection page', path: '/role-selection', roles: ['portfolio', 'programme', 'coordinator', 'pmo'] },
  ],
  portfolio: [
    { name: 'Portfolio dashboard', path: '/portfolio/dashboard', roles: ['portfolio'] },
    { name: 'Portfolio practice', path: '/portfolio/practice', roles: ['portfolio'] },
  ],
  programme: [
    { name: 'Programme dashboard', path: '/programme/dashboard', roles: ['programme'] },
    { name: 'Programme practice', path: '/programme/practice', roles: ['programme'] },
  ],
  coordinator: [
    { name: 'Coordinator dashboard', path: '/coordinator/dashboard', roles: ['coordinator'] },
    { name: 'Coordinator practice', path: '/coordinator/practice', roles: ['coordinator'] },
  ],
  pmo: [
    { name: 'PMO dashboard', path: '/pmo/dashboard', roles: ['pmo'] },
    { name: 'PMO practice', path: '/pmo/practice', roles: ['pmo'] },
  ],
  'turn-engine': [
    { name: 'Start simulation turn', path: '/simulation/turn', roles: ['portfolio', 'programme', 'coordinator', 'pmo'] },
  ],
  'learning-paths': [
    { name: 'Learning paths', path: '/learning-paths', roles: ['portfolio', 'programme', 'coordinator', 'pmo'] },
  ],
  certificates: [
    { name: 'Certificates', path: '/certificates', roles: ['portfolio', 'programme', 'coordinator', 'pmo'] },
  ],
  leaderboard: [
    { name: 'Leaderboard', path: '/leaderboard', roles: ['portfolio', 'programme', 'pmo'] },
  ],
  subscriptions: [
    { name: 'Simulator subscriptions', path: '/subscriptions', roles: ['portfolio', 'programme', 'coordinator', 'pmo'] },
  ],
  analytics: [
    { name: 'Analytics dashboard', path: '/analytics', roles: ['pmo'] },
  ],
}

export function simulatorRoutesForRole(role) {
  return SIMULATOR_ROUTES[role] || ['/dashboard']
}
