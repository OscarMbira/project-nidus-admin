import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import federation from '@originjs/vite-plugin-federation'
import { adminBrowserResolveAliases } from '../packages/shared/viteBrowserShims.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const reactRoot = path.dirname(require.resolve('react/package.json'))
const reactDomRoot = path.dirname(require.resolve('react-dom/package.json'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const remote = (key, port) => env[key] || `http://127.0.0.1:${port}/assets/remoteEntry.js`

  return {
    plugins: [
      react({ jsxRuntime: 'automatic' }),
      federation({
        name: 'admin_shell',
        remotes: {
          admin_users: remote('VITE_ADMIN_USERS_URL', 5180),
          admin_subscriptions: remote('VITE_ADMIN_SUBSCRIPTIONS_URL', 5181),
          admin_system: remote('VITE_ADMIN_SYSTEM_URL', 5182),
          admin_support: remote('VITE_ADMIN_SUPPORT_URL', 5183),
          admin_errors: remote('VITE_ADMIN_ERRORS_URL', 5184),
          admin_mirrors: remote('VITE_ADMIN_MIRRORS_URL', 5185),
          admin_platform: remote('VITE_ADMIN_PLATFORM_URL', 5186),
          admin_simulator: remote('VITE_ADMIN_SIMULATOR_URL', 5187),
          admin_security: remote('VITE_ADMIN_SECURITY_URL', 5188),
          admin_content: remote('VITE_ADMIN_CONTENT_URL', 5189),
          admin_feedback: remote('VITE_ADMIN_FEEDBACK_URL', 5190),
          admin_audit: remote('VITE_ADMIN_AUDIT_URL', 5191),
          admin_admin_mgmt: remote('VITE_ADMIN_ADMIN_MGMT_URL', 5192),
          admin_batch_ops: remote('VITE_ADMIN_BATCH_OPS_URL', 5193),
          admin_affiliates: remote('VITE_ADMIN_AFFILIATES_URL', 5194),
          admin_system_testers: remote('VITE_ADMIN_SYSTEM_TESTERS_URL', 5195),
          admin_docs_centre: remote('VITE_ADMIN_DOCS_CENTRE_URL', 5196),
          admin_testing_centre: remote('VITE_ADMIN_TESTING_CENTRE_URL', 5197),
          admin_email_centre: remote('VITE_ADMIN_EMAIL_CENTRE_URL', 5198),
        },
      shared: {
        react: { singleton: true, requiredVersion: '^18.3.1', eager: true },
        'react-dom': { singleton: true, requiredVersion: '^18.3.1', eager: true },
        'react-router-dom': { singleton: true, requiredVersion: '^6.30.2' },
        '@supabase/supabase-js': { singleton: true },
      },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        react: reactRoot,
        'react-dom': reactDomRoot,
        '@': path.resolve(__dirname, 'src'),
        '@nidus-admin/ui': path.resolve(__dirname, '../packages/ui/src'),
        '@nidus-admin/shared': path.resolve(__dirname, '../packages/shared/src'),
        ...adminBrowserResolveAliases(),
      },
    },
    optimizeDeps: {
      exclude: ['xlsx-js-style'],
    },
    envDir: path.resolve(__dirname, '..'),
    build: { target: 'esnext', minify: false, cssCodeSplit: false, modulePreload: false },
    server: { port: 5175, strictPort: true, cors: true, host: '127.0.0.1' },
    preview: { port: 5175, strictPort: true, cors: true, host: '127.0.0.1' },
  }
})
