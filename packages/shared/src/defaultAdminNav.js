/**
 * Fallback admin navigation — used only when DB config is unavailable.
 * Primary source of truth: admin.nav_nodes (see SQL/v51, v52).
 */

export const DEFAULT_STANDALONE = [
  { label: 'Dashboard', path: '/dashboard', roles: ['super_admin', 'system_admin', 'support_admin', 'content_admin'] },
]

export const DEFAULT_NAV_SECTIONS = [
  {
    id: 'users-orgs',
    label: 'Users & Organisations',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'Directory',
        items: [
          { label: 'Users', path: '/users/user-list', roles: ['super_admin', 'system_admin'], activePaths: ['/users/user-detail', '/users/user-suspend', '/users/user-activity'] },
          { label: 'Organisations', path: '/users/org-list', roles: ['super_admin', 'system_admin'], activePaths: ['/users/org-detail'] },
        ],
      },
    ],
  },
  {
    id: 'subscription-billing',
    label: 'Subscription & Billing',
    roles: ['super_admin', 'system_admin', 'support_admin'],
    groups: [
      {
        label: 'Paying Subscriptions',
        items: [
          { label: 'Subscription List', path: '/subscriptions/subscription-list', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/subscription-detail', '/subscriptions/subscription-form'] },
          { label: 'Change History', path: '/subscriptions/subscription-change-history', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/subscription-change-history/record'] },
        ],
      },
      {
        label: 'Subscription Preview',
        items: [
          { label: 'Subscription Preview', path: '/subscriptions/subscription-preview', roles: ['super_admin', 'system_admin'] },
          { label: 'Change History', path: '/subscriptions/pricing-preview-history', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/pricing-preview-history/record', '/subscriptions/pricing-preview-history/pricing'] },
        ],
      },
      {
        label: 'Subscriptions Catalog',
        items: [
          { label: 'Subscription Catalog', path: '/subscriptions/plan-catalog', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/plan-catalog-form'] },
          { label: 'Change History', path: '/subscriptions/plan-catalog-history', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/plan-catalog-history/record'] },
        ],
      },
      {
        label: 'Revenue',
        items: [
          { label: 'Dashboard', path: '/subscriptions/revenue-dashboard', roles: ['super_admin'] },
          { label: 'Change History', path: '/subscriptions/revenue-history', roles: ['super_admin'], activePaths: ['/subscriptions/revenue-history/record'] },
        ],
      },
      {
        label: 'Billing',
        items: [
          { label: 'Invoices', path: '/subscriptions/invoices', roles: ['super_admin', 'system_admin'] },
          { label: 'Tax Rates', path: '/subscriptions/tax-rates', roles: ['super_admin', 'system_admin'] },
          { label: 'Refunds', path: '/subscriptions/refunds', roles: ['super_admin', 'system_admin', 'support_admin'], activePaths: ['/subscriptions/refund-detail'] },
          { label: 'Cancellation Reasons', path: '/subscriptions/cancellation-reasons', roles: ['super_admin', 'system_admin', 'support_admin'] },
        ],
      },
      {
        label: 'Payment Configuration',
        items: [
          { label: 'Payment Gateways', path: '/subscriptions/payment-gateways', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/payment-gateway-form'] },
          { label: 'Payment Methods', path: '/subscriptions/payment-methods', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/payment-method-form'] },
          { label: 'Method Routing', path: '/subscriptions/payment-method-routing', roles: ['super_admin', 'system_admin'] },
          { label: 'Payment Flow', path: '/subscriptions/payment-flow', roles: ['super_admin', 'system_admin'] },
          { label: 'Retry Rules', path: '/subscriptions/payment-retry-rules', roles: ['super_admin', 'system_admin'] },
          { label: 'Settlement Accounts', path: '/subscriptions/settlement-accounts', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/settlement-account-form'] },
          { label: 'Promo Codes', path: '/subscriptions/promo-codes', roles: ['super_admin', 'system_admin'], activePaths: ['/subscriptions/promo-code-form'] },
        ],
      },
      {
        label: 'Payment Operations',
        items: [
          { label: 'Transaction Monitor', path: '/subscriptions/payment-monitor', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Payment Dashboard', path: '/subscriptions/payment-dashboard', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Payment Reports', path: '/subscriptions/payment-reports', roles: ['super_admin', 'system_admin', 'support_admin'] },
        ],
      },
      {
        label: 'Currency & Region',
        items: [
          { label: 'Currencies', path: '/system/currencies', roles: ['super_admin', 'system_admin'] },
          { label: 'Exchange Rates', path: '/system/exchange-rates', roles: ['super_admin', 'system_admin'] },
          { label: 'Countries', path: '/system/countries', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Affiliate Program',
        items: [
          { label: 'Dashboard', path: '/affiliates/dashboard', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Affiliates', path: '/affiliates/affiliate-list', roles: ['super_admin', 'system_admin', 'support_admin'], activePaths: ['/affiliates/affiliate-detail', '/affiliates/affiliate-form'] },
          { label: 'Commissions', path: '/affiliates/commissions', roles: ['super_admin', 'system_admin'] },
          { label: 'Applications', path: '/affiliates/applications', roles: ['super_admin', 'system_admin'], badge: 'pending' },
          { label: 'Apply Page Preview', path: '/affiliates/apply-preview', roles: ['super_admin', 'system_admin', 'support_admin'], activePaths: [] },
        ],
      },
    ],
  },
  {
    id: 'system-testers',
    label: 'System Testers',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'Program',
        items: [
          { label: 'Applications', path: '/system-testers/applications', roles: ['super_admin', 'system_admin'], badge: 'pending' },
          { label: 'Active Testers', path: '/system-testers/active', roles: ['super_admin', 'system_admin'] },
          { label: 'Grant Access', path: '/system-testers/grant', roles: ['super_admin', 'system_admin'] },
          { label: 'Project Assignments', path: '/system-testers/assignments', roles: ['super_admin', 'system_admin'] },
          { label: 'Sandbox Orgs', path: '/system-testers/sandboxes', roles: ['super_admin', 'system_admin'] },
          { label: 'Expiry Dashboard', path: '/system-testers/expiry', roles: ['super_admin', 'system_admin'] },
          { label: 'Tester Activity', path: '/system-testers/activity', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    roles: ['super_admin', 'system_admin', 'support_admin', 'content_admin'],
    groups: [
      {
        label: 'Guides',
        items: [
          { label: 'Documentation Home', path: '/docs-centre', roles: ['super_admin', 'system_admin', 'support_admin', 'content_admin'], activePaths: ['/docs-centre/search'] },
          { label: 'Edit Documentation', path: '/docs-centre/editor', roles: ['super_admin', 'system_admin', 'content_admin'] },
        ],
      },
    ],
  },
  {
    id: 'testing-centre',
    label: 'Testing Centre',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'Test Management',
        items: [
          { label: 'Dashboard', path: '/testing-centre', roles: ['super_admin', 'system_admin'] },
          { label: 'Test Cases', path: '/testing-centre/cases', roles: ['super_admin', 'system_admin'] },
          { label: 'Test Suites', path: '/testing-centre/suites', roles: ['super_admin', 'system_admin'] },
          { label: 'Test Runs', path: '/testing-centre/runs', roles: ['super_admin', 'system_admin'], activePaths: ['/testing-centre/runs/'] },
          { label: 'Evidence', path: '/testing-centre/evidence', roles: ['super_admin', 'system_admin'] },
          { label: 'Diagnostics', path: '/testing-centre/diagnostics', roles: ['super_admin', 'system_admin'] },
          { label: 'Defects', path: '/testing-centre/defects', roles: ['super_admin', 'system_admin'] },
          { label: 'Reports', path: '/testing-centre/reports', roles: ['super_admin', 'system_admin'] },
          { label: 'Settings', path: '/testing-centre/settings', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'email-centre',
    label: 'Email Centre',
    roles: ['super_admin', 'system_admin', 'content_admin'],
    groups: [
      {
        label: 'Email',
        items: [
          { label: 'Dashboard', path: '/email-centre/dashboard', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Compose Email', path: '/email-centre/compose', roles: ['super_admin', 'system_admin'] },
          { label: 'Campaigns', path: '/email-centre/campaigns', roles: ['super_admin', 'system_admin'], activePaths: ['/email-centre/campaign-editor'] },
          { label: 'Event Triggers', path: '/email-centre/event-triggers', roles: ['super_admin', 'system_admin'] },
          { label: 'Send Log', path: '/email-centre/send-log', roles: ['super_admin', 'system_admin', 'content_admin'] },
        ],
      },
    ],
  },
  {
    id: 'support-feedback',
    label: 'Support & Feedback',
    roles: ['super_admin', 'system_admin', 'support_admin'],
    groups: [
      {
        label: 'Support',
        items: [
          { label: 'Support Tickets', path: '/support/support-ticket-list', roles: ['super_admin', 'system_admin', 'support_admin'], activePaths: ['/support/support-ticket-detail'] },
          { label: 'Announcements', path: '/support/announcements', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Error Dashboard', path: '/errors/error-dashboard', roles: ['super_admin', 'system_admin', 'support_admin'] },
        ],
      },
      {
        label: 'Feedback',
        items: [
          { label: 'Bug Tracking', path: '/feedback/bug-tracking', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Feature Requests', path: '/feedback/feature-requests', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Feedback Analysis', path: '/feedback/feedback-analysis', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Improvement Backlog', path: '/feedback/improvement-backlog', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'platform-simulator',
    label: 'Platform & Simulator',
    roles: ['super_admin', 'system_admin', 'support_admin', 'content_admin'],
    groups: [
      {
        label: 'Platform',
        items: [
          { label: 'Projects', path: '/platform/platform-projects-overview', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Platform Settings', path: '/platform/platform-settings', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Platform Health', path: '/platform/platform-health', roles: ['super_admin', 'system_admin', 'support_admin'] },
          { label: 'Impersonate User', path: '/platform/user-impersonation', roles: ['super_admin', 'system_admin', 'support_admin'] },
        ],
      },
      {
        label: 'Mirrors',
        items: [
          { label: 'Platform Mirror', path: '/mirrors/platform-mirror', roles: ['super_admin', 'system_admin'] },
          { label: 'Simulator Mirror', path: '/mirrors/simulator-mirror', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Simulator',
        items: [
          { label: 'Scenarios', path: '/simulator/sim-scenario-admin', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Certificates', path: '/simulator/sim-certificate-admin', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Leaderboard', path: '/simulator/sim-leaderboard-admin', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Learning Paths', path: '/simulator/sim-learning-path-admin', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'NPC Admin', path: '/simulator/sim-n-p-c-admin', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Impersonate User', path: '/simulator/user-impersonation', roles: ['super_admin', 'system_admin', 'support_admin'] },
        ],
      },
    ],
  },
  {
    id: 'global-templates',
    label: 'Global Templates',
    roles: ['super_admin', 'system_admin', 'content_admin'],
    groups: [
      {
        label: 'Library',
        items: [
          {
            label: 'Global Template Library',
            path: '/content/global-template-library',
            roles: ['super_admin', 'system_admin', 'content_admin'],
            activePaths: ['/content/global-template-form', '/content/global-template-detail', '/content/legacy-template-upload'],
          },
        ],
      },
    ],
    subsections: [
      {
        label: 'Templates',
        groups: [
          {
            label: 'Portfolio',
            items: [
              { label: 'Standards-Based', path: '/content/global-template-library?domain=portfolio_template&methodology=standards_based', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Structured', path: '/content/global-template-library?domain=portfolio_template&methodology=structured', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Agile', path: '/content/global-template-library?domain=portfolio_template&methodology=agile', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Programme',
            items: [
              { label: 'Standards-Based', path: '/content/global-template-library?domain=programme_template&methodology=standards_based', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Structured', path: '/content/global-template-library?domain=programme_template&methodology=structured', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Agile', path: '/content/global-template-library?domain=programme_template&methodology=agile', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Project',
            items: [
              { label: 'Standards-Based', path: '/content/global-template-library?domain=project_template&methodology=standards_based', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Structured', path: '/content/global-template-library?domain=project_template&methodology=structured', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Agile', path: '/content/global-template-library?domain=project_template&methodology=agile', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
        ],
      },
      {
        label: 'Forms',
        groups: [
          {
            label: 'Standards-Based',
            items: [
              { label: 'Initiating', path: '/content/global-template-library?domain=form_template&methodology=standards_based&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Planning', path: '/content/global-template-library?domain=form_template&methodology=standards_based&category=Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Executing', path: '/content/global-template-library?domain=form_template&methodology=standards_based&category=Executing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Monitoring & Controlling', path: '/content/global-template-library?domain=form_template&methodology=standards_based&category=Monitoring+%26+Controlling', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Closing', path: '/content/global-template-library?domain=form_template&methodology=standards_based&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Structured',
            items: [
              { label: 'Starting Up', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Starting+Up', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Directing', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Directing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Initiating', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Controlling a Stage', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Controlling+a+Stage', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Managing Product Delivery', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Managing+Product+Delivery', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Managing a Stage Boundary', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Managing+a+Stage+Boundary', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Closing', path: '/content/global-template-library?domain=form_template&methodology=structured&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Agile',
            items: [
              { label: 'Backlog', path: '/content/global-template-library?domain=form_template&methodology=agile&category=Backlog', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Sprint Planning', path: '/content/global-template-library?domain=form_template&methodology=agile&category=Sprint+Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Sprint Execution', path: '/content/global-template-library?domain=form_template&methodology=agile&category=Sprint+Execution', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Review & Retrospective', path: '/content/global-template-library?domain=form_template&methodology=agile&category=Review+%26+Retrospective', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Release', path: '/content/global-template-library?domain=form_template&methodology=agile&category=Release', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
        ],
      },
      {
        label: 'Content Coverage',
        groups: [
          {
            label: 'Standards-Based',
            items: [
              { label: 'Initiating', path: '/content/default-content-library?methodology=standards_based&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Planning', path: '/content/default-content-library?methodology=standards_based&category=Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Executing', path: '/content/default-content-library?methodology=standards_based&category=Executing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Monitoring & Controlling', path: '/content/default-content-library?methodology=standards_based&category=Monitoring+%26+Controlling', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Closing', path: '/content/default-content-library?methodology=standards_based&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'All coverage', path: '/content/default-content-library?methodology=standards_based', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
            ],
          },
          {
            label: 'Structured',
            items: [
              { label: 'Starting Up', path: '/content/default-content-library?methodology=structured&category=Starting+Up', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Directing', path: '/content/default-content-library?methodology=structured&category=Directing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Initiating', path: '/content/default-content-library?methodology=structured&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Controlling a Stage', path: '/content/default-content-library?methodology=structured&category=Controlling+a+Stage', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Managing Product Delivery', path: '/content/default-content-library?methodology=structured&category=Managing+Product+Delivery', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Managing a Stage Boundary', path: '/content/default-content-library?methodology=structured&category=Managing+a+Stage+Boundary', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Closing', path: '/content/default-content-library?methodology=structured&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
            ],
          },
          {
            label: 'Agile',
            items: [
              { label: 'Backlog', path: '/content/default-content-library?methodology=agile&category=Backlog', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Sprint Planning', path: '/content/default-content-library?methodology=agile&category=Sprint+Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Sprint Execution', path: '/content/default-content-library?methodology=agile&category=Sprint+Execution', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Review & Retrospective', path: '/content/default-content-library?methodology=agile&category=Review+%26+Retrospective', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
              { label: 'Release', path: '/content/default-content-library?methodology=agile&category=Release', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/default-content-library'] },
            ],
          },
        ],
      },
      {
        label: 'Process Docs',
        groups: [
          {
            label: 'Standards-Based',
            items: [
              { label: 'Initiating', path: '/content/global-template-library?domain=process_template&methodology=standards_based&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Planning', path: '/content/global-template-library?domain=process_template&methodology=standards_based&category=Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Executing', path: '/content/global-template-library?domain=process_template&methodology=standards_based&category=Executing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Monitoring & Controlling', path: '/content/global-template-library?domain=process_template&methodology=standards_based&category=Monitoring+%26+Controlling', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Closing', path: '/content/global-template-library?domain=process_template&methodology=standards_based&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Structured',
            items: [
              { label: 'Starting Up', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Starting+Up', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Directing', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Directing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Initiating', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Initiating', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Controlling a Stage', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Controlling+a+Stage', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Managing Product Delivery', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Managing+Product+Delivery', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Managing a Stage Boundary', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Managing+a+Stage+Boundary', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Closing', path: '/content/global-template-library?domain=process_template&methodology=structured&category=Closing', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
          {
            label: 'Agile',
            items: [
              { label: 'Backlog', path: '/content/global-template-library?domain=process_template&methodology=agile&category=Backlog', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Sprint Planning', path: '/content/global-template-library?domain=process_template&methodology=agile&category=Sprint+Planning', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Sprint Execution', path: '/content/global-template-library?domain=process_template&methodology=agile&category=Sprint+Execution', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Review & Retrospective', path: '/content/global-template-library?domain=process_template&methodology=agile&category=Review+%26+Retrospective', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
              { label: 'Release', path: '/content/global-template-library?domain=process_template&methodology=agile&category=Release', roles: ['super_admin', 'system_admin', 'content_admin'], activePaths: ['/content/global-template-library'] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'content-localization',
    label: 'Content & Localization',
    roles: ['super_admin', 'system_admin', 'content_admin'],
    groups: [
      {
        label: 'Content',
        items: [
          { label: 'Documentation CMS', path: '/content/documentation-c-m-s', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Help Management', path: '/content/help-management', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'PWA Settings', path: '/content/p-w-a-settings', roles: ['super_admin', 'system_admin'] },
          { label: 'Role Menu Config', path: '/content/role-menu-config', roles: ['super_admin'] },
        ],
      },
      {
        label: 'Email',
        items: [
          { label: 'Email Templates', path: '/content/email-templates', roles: ['super_admin', 'system_admin'], activePaths: ['/content/email-template-editor'] },
          { label: 'Send Log', path: '/content/email-send-log', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Localization',
        items: [
          { label: 'Languages', path: '/content/languages', roles: ['super_admin', 'system_admin', 'content_admin'] },
          { label: 'Translations', path: '/content/translations', roles: ['super_admin', 'system_admin', 'content_admin'] },
        ],
      },
    ],
  },
  {
    id: 'system-security',
    label: 'System & Security',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'System',
        items: [
          { label: 'System Settings', path: '/system/system-settings', roles: ['super_admin', 'system_admin'] },
          { label: 'Email Provider', path: '/system/email-provider', roles: ['super_admin'] },
          { label: 'Maintenance', path: '/system/maintenance-mode', roles: ['super_admin'] },
        ],
      },
      {
        label: 'Security',
        items: [
          { label: 'Security Settings', path: '/security/security-settings', roles: ['super_admin', 'system_admin'] },
          { label: 'SSO Management', path: '/security/s-s-o-management', roles: ['super_admin', 'system_admin'] },
          { label: 'Security Monitoring', path: '/security/security-monitoring', roles: ['super_admin', 'system_admin'] },
          { label: 'GDPR Compliance', path: '/security/g-d-p-r-compliance', roles: ['super_admin', 'system_admin'] },
          { label: 'Performance Metrics', path: '/security/performance-metrics', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Integrations',
        items: [
          { label: 'API Keys', path: '/security/api-keys', roles: ['super_admin', 'system_admin'] },
          { label: 'Webhooks', path: '/security/webhooks', roles: ['super_admin', 'system_admin'] },
          { label: 'Webhook Log', path: '/security/webhook-log', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'ID Generation',
        items: [
          { label: 'ID Rules', path: '/system/id-generation-rules', roles: ['super_admin', 'system_admin'], activePaths: ['/system/id-generation-rule-form'] },
          { label: 'Generated IDs', path: '/system/id-generated-list', roles: ['super_admin', 'system_admin'] },
          { label: 'ID to Application Report', path: '/system/id-to-application-report', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Notifications',
        items: [
          { label: 'Notification Templates', path: '/system/notification-templates', roles: ['super_admin', 'system_admin'], activePaths: ['/system/notification-template-form'] },
          { label: 'Alert Rules', path: '/system/alert-rules', roles: ['super_admin', 'system_admin'], activePaths: ['/system/alert-rule-form'] },
        ],
      },
      {
        label: 'Testing',
        items: [
          { label: 'Test Dashboard', path: '/system/test-dashboard', roles: ['super_admin', 'system_admin'] },
          { label: 'Fix Patterns', path: '/system/test-fix-patterns', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'reports-audit',
    label: 'Reports & Audit',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'Reports',
        items: [
          { label: 'Reports', path: '/audit/reports', roles: ['super_admin', 'system_admin'], activePaths: ['/audit/report-viewer'] },
          { label: 'Report Builder', path: '/audit/report-builder', roles: ['super_admin', 'system_admin'] },
          { label: 'Scheduled Reports', path: '/audit/scheduled-reports', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Audit',
        items: [
          { label: 'Audit Trail', path: '/audit/audit-trail', roles: ['super_admin', 'system_admin'] },
          { label: 'Admin Activity', path: '/audit/admin-activity', roles: ['super_admin', 'system_admin'] },
          { label: 'Session History', path: '/audit/session-history', roles: ['super_admin', 'system_admin'] },
          { label: 'Export Logs', path: '/audit/export-logs', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    roles: ['super_admin', 'system_admin'],
    groups: [
      {
        label: 'Batch Jobs',
        items: [
          { label: 'Batch Jobs', path: '/batch-ops/batch-jobs', roles: ['super_admin', 'system_admin'], activePaths: ['/batch-ops/batch-job-detail'] },
          { label: 'Data Import', path: '/batch-ops/batch-import', roles: ['super_admin', 'system_admin'] },
        ],
      },
      {
        label: 'Close of Business',
        items: [
          { label: 'COB Dashboard', path: '/batch-ops/cob-dashboard', roles: ['super_admin', 'system_admin'], activePaths: ['/batch-ops/cob-run-detail'] },
          { label: 'Business Calendar', path: '/batch-ops/business-calendar', roles: ['super_admin', 'system_admin'] },
          { label: 'COB Processes', path: '/batch-ops/cob-processes', roles: ['super_admin', 'system_admin'] },
        ],
      },
    ],
  },
  {
    id: 'admin-mgmt',
    label: 'Admin Management',
    roles: ['super_admin'],
    groups: [
      {
        label: 'Admin Users',
        items: [
          { label: 'Admin Users', path: '/admin-mgmt/admin-user-list', roles: ['super_admin'], activePaths: ['/admin-mgmt/admin-user-detail', '/admin-mgmt/admin-user-edit'] },
          { label: 'Invite Admin', path: '/admin-mgmt/admin-user-invite', roles: ['super_admin'] },
          { label: 'Pending Activations', path: '/admin-mgmt/pending-activations', roles: ['super_admin'], badge: 'pending' },
        ],
      },
      {
        label: 'Access Control',
        items: [
          { label: 'Role Permissions', path: '/admin-mgmt/role-permissions', roles: ['super_admin'] },
          { label: 'Navigation Management', path: '/admin-mgmt/navigation-management', roles: ['super_admin'] },
          { label: 'Active Sessions', path: '/admin-mgmt/active-sessions', roles: ['super_admin'] },
        ],
      },
      {
        label: 'Record Governance',
        items: [
          { label: 'Lifecycle Configuration', path: '/admin-mgmt/record-governance/lifecycle-configuration', roles: ['super_admin', 'system_admin'] },
          { label: 'Authorisers', path: '/admin-mgmt/record-governance/authorisers', roles: ['super_admin', 'system_admin'] },
          { label: 'Archive Retention Rules', path: '/admin-mgmt/record-governance/archive-retention-rules', roles: ['super_admin', 'system_admin'] },
          { label: 'My Approvals', path: '/admin-mgmt/record-governance/my-approvals', roles: ['super_admin', 'system_admin'], badge: 'pending' },
        ],
      },
    ],
  },
]
