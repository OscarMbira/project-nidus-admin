import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '..', '.auth')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: path.join(__dirname, 'global-setup.js'),
  globalTeardown: path.join(__dirname, 'global-teardown.js'),
  reporter: [
    ['list'],
    [path.join(__dirname, 'supabase-reporter.js')],
  ],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'admin-super_admin', testMatch: /admin\//, use: { baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:5175', storageState: path.join(authDir, 'admin_super_admin.json') } },
    { name: 'admin-system_admin', testMatch: /admin\//, use: { baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:5175', storageState: path.join(authDir, 'admin_system_admin.json') } },
    { name: 'admin-support_admin', testMatch: /admin\//, use: { baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:5175', storageState: path.join(authDir, 'admin_support_admin.json') } },
    { name: 'admin-content_admin', testMatch: /admin\//, use: { baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:5175', storageState: path.join(authDir, 'admin_content_admin.json') } },
    { name: 'platform-pmo_admin', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_pmo_admin.json') } },
    { name: 'platform-project_manager', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_project_manager.json') } },
    { name: 'platform-programme_manager', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_programme_manager.json') } },
    { name: 'platform-portfolio_manager', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_portfolio_manager.json') } },
    { name: 'platform-team_lead', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_team_lead.json') } },
    { name: 'platform-team_member', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_team_member.json') } },
    { name: 'platform-stakeholder', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_stakeholder.json') } },
    { name: 'platform-viewer', testMatch: /platform\//, use: { baseURL: process.env.PLATFORM_BASE_URL || 'http://localhost:5173', storageState: path.join(authDir, 'platform_viewer.json') } },
    { name: 'sim-portfolio', testMatch: /simulator\//, use: { baseURL: process.env.SIMULATOR_BASE_URL || 'http://localhost:5174', storageState: path.join(authDir, 'sim_portfolio.json') } },
    { name: 'sim-programme', testMatch: /simulator\//, use: { baseURL: process.env.SIMULATOR_BASE_URL || 'http://localhost:5174', storageState: path.join(authDir, 'sim_programme.json') } },
    { name: 'sim-coordinator', testMatch: /simulator\//, use: { baseURL: process.env.SIMULATOR_BASE_URL || 'http://localhost:5174', storageState: path.join(authDir, 'sim_coordinator.json') } },
    { name: 'sim-pmo', testMatch: /simulator\//, use: { baseURL: process.env.SIMULATOR_BASE_URL || 'http://localhost:5174', storageState: path.join(authDir, 'sim_pmo.json') } },
    { name: 'cross-system', testMatch: /cross-system\//, use: { baseURL: process.env.ADMIN_BASE_URL || 'http://localhost:5175', storageState: path.join(authDir, 'admin_super_admin.json') } },
  ],
})
