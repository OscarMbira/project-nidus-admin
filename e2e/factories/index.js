import { testTag, randomEmail, randomCode, futureDate, pastDate } from './base.factory.js'

export function buildUser(overrides = {}) {
  const name = testTag('User')
  return {
    email: randomEmail(),
    full_name: name,
    ...overrides,
  }
}

export function buildSubscription(overrides = {}) {
  return {
    targetSystem: 'platform',
    planType: 'professional',
    billingCycle: 'monthly',
    currency: 'USD',
    amountPaid: 49.99,
    started_at: pastDate(1),
    expires_at: futureDate(365),
    notes: testTag('Sub'),
    ...overrides,
  }
}

export function buildCurrency(overrides = {}) {
  const code = randomCode(3)
  return {
    currency_code: code,
    currency_name: testTag('Currency'),
    symbol: '$',
    decimal_places: 2,
    symbol_position: 'prefix',
    is_active: true,
    sort_order: 0,
    ...overrides,
  }
}

export function buildCountry(overrides = {}) {
  const code = randomCode(2)
  return {
    country_code: code,
    country_name: testTag('Country'),
    iso3_code: `${code}X`,
    phone_code: '+1',
    region: 'Test Region',
    is_active: true,
    ...overrides,
  }
}

export function buildExchangeRate(overrides = {}) {
  return {
    from_currency: 'USD',
    to_currency: 'EUR',
    rate: 0.92,
    effective_from: pastDate(1),
    is_active: true,
    notes: testTag('Rate'),
    ...overrides,
  }
}

export function buildTicket(overrides = {}) {
  return {
    subject: testTag('Ticket'),
    category: 'general',
    priority: 'medium',
    message: 'Automated test ticket message.',
    ...overrides,
  }
}

export function buildAnnouncement(overrides = {}) {
  return {
    title: testTag('Announcement'),
    message: 'Test announcement body.',
    type: 'info',
    ...overrides,
  }
}

export function buildAdmin(overrides = {}) {
  return {
    email: randomEmail(),
    role: 'system_admin',
    invite_message: testTag('Invite'),
    ...overrides,
  }
}

export function buildFeatureFlag(overrides = {}) {
  const key = `test_flag_${Date.now()}`
  return {
    flag_key: key,
    flag_name: testTag('Flag'),
    applies_to: 'admin',
    description: 'E2E test feature flag',
    ...overrides,
  }
}

export function buildMaintenanceWindow(overrides = {}) {
  return {
    target_system: 'platform',
    message: testTag('Maintenance'),
    scheduled_start: futureDate(1),
    scheduled_end: futureDate(2),
    ...overrides,
  }
}

export function buildIdRule(overrides = {}) {
  return {
    target_table: 'public.users',
    abbreviation: randomCode(3),
    separator: '-',
    num_letters: 2,
    num_digits: 4,
    description: testTag('ID Rule'),
    ...overrides,
  }
}

export function buildNotificationTemplate(overrides = {}) {
  const key = `test_tpl_${Date.now()}`
  return {
    template_key: key,
    name: testTag('Notification'),
    channel: 'email',
    body: 'Hello {{name}}',
    ...overrides,
  }
}

export function buildAlertRule(overrides = {}) {
  return {
    rule_name: testTag('Alert'),
    condition_type: 'threshold',
    condition_params: { threshold: 10 },
    ...overrides,
  }
}

export function buildEmailTemplate(overrides = {}) {
  const key = `test_email_${Date.now()}`
  return {
    template_key: key,
    subject: testTag('Email Subject'),
    body_html: '<p>Test email body</p>',
    ...overrides,
  }
}

export function buildApiKey(overrides = {}) {
  return {
    key_name: testTag('API Key'),
    permissions: ['read'],
    ...overrides,
  }
}

export function buildWebhook(overrides = {}) {
  return {
    name: testTag('Webhook'),
    endpoint_url: 'https://example.com/webhook',
    events: ['user.created'],
    ...overrides,
  }
}

export function buildInvoice(overrides = {}) {
  return {
    currency: 'USD',
    subtotal: 100,
    line_items: [{ description: testTag('Line'), amount: 100 }],
    ...overrides,
  }
}

export function buildTaxRate(overrides = {}) {
  return {
    country_code: 'US',
    tax_name: testTag('Tax'),
    rate: 8.25,
    ...overrides,
  }
}
