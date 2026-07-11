const env = import.meta.env

export default {
  ADMIN_USERS_URL: env.VITE_ADMIN_USERS_URL || 'http://127.0.0.1:5180/assets/remoteEntry.js',
  ADMIN_SUBSCRIPTIONS_URL: env.VITE_ADMIN_SUBSCRIPTIONS_URL || 'http://127.0.0.1:5181/assets/remoteEntry.js',
  ADMIN_SYSTEM_URL: env.VITE_ADMIN_SYSTEM_URL || 'http://127.0.0.1:5182/assets/remoteEntry.js',
  ADMIN_SUPPORT_URL: env.VITE_ADMIN_SUPPORT_URL || 'http://127.0.0.1:5183/assets/remoteEntry.js',
  ADMIN_ERRORS_URL: env.VITE_ADMIN_ERRORS_URL || 'http://127.0.0.1:5184/assets/remoteEntry.js',
  ADMIN_MIRRORS_URL: env.VITE_ADMIN_MIRRORS_URL || 'http://127.0.0.1:5185/assets/remoteEntry.js',
  ADMIN_PLATFORM_URL: env.VITE_ADMIN_PLATFORM_URL || 'http://127.0.0.1:5186/assets/remoteEntry.js',
  ADMIN_SIMULATOR_URL: env.VITE_ADMIN_SIMULATOR_URL || 'http://127.0.0.1:5187/assets/remoteEntry.js',
  ADMIN_SECURITY_URL: env.VITE_ADMIN_SECURITY_URL || 'http://127.0.0.1:5188/assets/remoteEntry.js',
  ADMIN_CONTENT_URL: env.VITE_ADMIN_CONTENT_URL || 'http://127.0.0.1:5189/assets/remoteEntry.js',
  ADMIN_FEEDBACK_URL: env.VITE_ADMIN_FEEDBACK_URL || 'http://127.0.0.1:5190/assets/remoteEntry.js',
  ADMIN_AUDIT_URL: env.VITE_ADMIN_AUDIT_URL || 'http://127.0.0.1:5191/assets/remoteEntry.js',
  ADMIN_ADMIN_MGMT_URL: env.VITE_ADMIN_ADMIN_MGMT_URL || 'http://127.0.0.1:5192/assets/remoteEntry.js',
  ADMIN_BATCH_OPS_URL: env.VITE_ADMIN_BATCH_OPS_URL || 'http://127.0.0.1:5193/assets/remoteEntry.js',
  ADMIN_AFFILIATES_URL: env.VITE_ADMIN_AFFILIATES_URL || 'http://127.0.0.1:5194/assets/remoteEntry.js',
  ADMIN_SYSTEM_TESTERS_URL: env.VITE_ADMIN_SYSTEM_TESTERS_URL || 'http://127.0.0.1:5195/assets/remoteEntry.js',
  ADMIN_DOCS_CENTRE_URL: env.VITE_ADMIN_DOCS_CENTRE_URL || 'http://127.0.0.1:5196/assets/remoteEntry.js',
  ADMIN_TESTING_CENTRE_URL: env.VITE_ADMIN_TESTING_CENTRE_URL || 'http://127.0.0.1:5197/assets/remoteEntry.js',
  ADMIN_EMAIL_CENTRE_URL: env.VITE_ADMIN_EMAIL_CENTRE_URL || 'http://127.0.0.1:5198/assets/remoteEntry.js',
}
