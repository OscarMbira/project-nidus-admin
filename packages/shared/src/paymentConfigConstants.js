export const PAYMENT_PROVIDERS = [
  { key: 'paynow', label: 'PayNow', active: true, apiKeyLabel: 'Integration ID', apiSecretLabel: 'Integration Key' },
  { key: 'flutterwave', label: 'Flutterwave', active: true, apiKeyLabel: 'Public Key', apiSecretLabel: 'Secret Key' },
  { key: 'paddle', label: 'Paddle', active: true, apiKeyLabel: 'Vendor ID', apiSecretLabel: 'Auth Code' },
  { key: 'razorpay', label: 'Razorpay', active: false, apiKeyLabel: 'Key ID', apiSecretLabel: 'Key Secret' },
  { key: 'dlocal', label: 'dLocal', active: false, apiKeyLabel: 'API Key', apiSecretLabel: 'API Secret' },
]

export const PROVIDER_METHOD_TYPES = {
  paynow: [
    { value: 'ecocash', label: 'EcoCash' },
    { value: 'onemoney', label: 'OneMoney' },
    { value: 'telecash', label: 'Telecash' },
    { value: 'zimswitch', label: 'ZimSwitch' },
    { value: 'zipit', label: 'ZIPIT' },
  ],
  flutterwave: [
    { value: 'credit_card', label: 'Credit / Debit Card' },
    { value: 'debit_card', label: 'Debit Card' },
    { value: 'mpesa', label: 'M-Pesa' },
    { value: 'mtn_momo', label: 'MTN Mobile Money' },
    { value: 'airtel_money', label: 'Airtel Money' },
    { value: 'vodafone_cash', label: 'Vodafone Cash' },
    { value: 'orange_money', label: 'Orange Money' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
  ],
  paddle: [
    { value: 'credit_card', label: 'Credit / Debit Card' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'apple_pay', label: 'Apple Pay' },
    { value: 'google_pay', label: 'Google Pay' },
  ],
  razorpay: [
    { value: 'credit_card', label: 'Credit / Debit Card' },
    { value: 'upi', label: 'UPI' },
    { value: 'netbanking', label: 'Netbanking' },
  ],
  dlocal: [
    { value: 'credit_card', label: 'Credit / Debit Card' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
  ],
}

export const REGION_SCOPES = [
  { value: 'local', label: 'Local' },
  { value: 'africa', label: 'Africa' },
  { value: 'global', label: 'Global' },
]

export const FEE_TYPES = [
  { value: 'none', label: 'None' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'percentage', label: 'Percentage' },
]

export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'merchant', label: 'Merchant' },
]

export const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed_amount', label: 'Fixed Amount (USD)' },
]

export const ENVIRONMENTS = [
  { value: 'sandbox', label: 'Sandbox' },
  { value: 'production', label: 'Production' },
]

export function providerLabel(key) {
  return PAYMENT_PROVIDERS.find((p) => p.key === key)?.label || key || '—'
}

export function providerCoverage(key) {
  const map = {
    paynow: 'Zimbabwe',
    flutterwave: 'Africa + cards',
    paddle: 'Global SaaS',
    razorpay: 'India (future)',
    dlocal: 'Emerging markets (future)',
  }
  return map[key] || '—'
}

export function methodTypesForProvider(providerKey) {
  return PROVIDER_METHOD_TYPES[providerKey] || []
}

export const DEFAULT_RETRY_SCHEDULE = [
  { attempt: 1, delay_hours: 1, notify_customer: true },
  { attempt: 2, delay_hours: 24, notify_customer: true },
  { attempt: 3, delay_hours: 72, notify_customer: true },
]

export const PAYMENT_EVENT_TYPE_CONFIG = {
  initiated: { icon: '●', color: 'text-blue-400', label: 'Payment Initiated' },
  success: { icon: '✓', color: 'text-green-400', label: 'Payment Successful' },
  failed: { icon: '✗', color: 'text-red-400', label: 'Payment Failed' },
  retry_scheduled: { icon: '🔄', color: 'text-orange-400', label: 'Retry Scheduled' },
  retry_attempt: { icon: '🔄', color: 'text-orange-400', label: 'Retry Attempt' },
  refunded: { icon: '💰', color: 'text-purple-400', label: 'Refund Processed' },
  cancelled: { icon: '✗', color: 'text-red-400', label: 'Payment Cancelled' },
  invoice_issued: { icon: '📄', color: 'text-gray-400', label: 'Invoice Issued' },
}

export const REGION_FLOW_LABELS = {
  local: { label: 'Zimbabwe', emoji: '🇿🇼' },
  africa: { label: 'Africa (non-ZW)', emoji: '🌍' },
  global: { label: 'Global', emoji: '🌐' },
}

export const GATEWAY_CHART_COLORS = {
  paynow: '#22c55e',
  flutterwave: '#3b82f6',
  paddle: '#a855f7',
}
