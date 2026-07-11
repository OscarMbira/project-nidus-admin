export const SUBSCRIPTION_HISTORY_SECTIONS = {
  'subscription-change-history': {
    title: 'Subscription Change History',
    description: 'Admin audit trail for paying subscription create, update, and status changes.',
    parentPath: '/subscriptions/subscription-list',
    parentLabel: 'Paying Subscriptions',
    permission: 'subscriptions.view',
    panels: ['audit'],
    auditTargetTypes: ['subscription'],
  },
  'pricing-preview-history': {
    title: 'Pricing Preview Change History',
    description: 'Catalog price updates and plan changes that affect the user pricing preview.',
    parentPath: '/subscriptions/subscription-preview',
    parentLabel: 'Subscription Preview',
    permission: 'subscriptions.view',
    panels: ['pricing', 'audit'],
    auditTargetTypes: ['subscription_plan'],
    auditActionPrefixes: ['subscription_plan.', 'publish_subscription_plan', 'sync_subscription_plan'],
  },
  'plan-catalog-history': {
    title: 'Catalog Change History',
    description: 'Lifecycle transitions and admin actions on subscription plan catalog rows.',
    parentPath: '/subscriptions/plan-catalog',
    parentLabel: 'Subscriptions Catalog',
    permission: 'subscriptions.view',
    panels: ['lifecycle', 'audit'],
    lifecycleTable: 'subscription_plans',
    auditTargetTypes: ['subscription_plan'],
  },
  'revenue-history': {
    title: 'Revenue Change History',
    description: 'Payment transactions and refund-related admin actions affecting revenue.',
    parentPath: '/subscriptions/revenue-dashboard',
    parentLabel: 'Revenue',
    permission: 'subscriptions.view',
    panels: ['payments', 'audit'],
    auditTargetTypes: ['refund'],
  },
}

export function subscriptionHistoryPath(sectionKey) {
  return `/subscriptions/${sectionKey}`
}

export function subscriptionAuditRecordPath(sectionKey, auditId) {
  return `/subscriptions/${sectionKey}/record/${auditId}`
}

export function subscriptionPricingRecordPath(sectionKey, pricingId) {
  return `/subscriptions/${sectionKey}/pricing/${pricingId}`
}
