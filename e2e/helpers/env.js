import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx < 0 || line.trimStart().startsWith('#')) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

export const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'NidusTest!2026Secure'

export const ADMIN_ACCOUNTS = [
  { role: 'super_admin', email: 'test-super@nidus-test.local', file: 'admin_super_admin.json' },
  { role: 'system_admin', email: 'test-system@nidus-test.local', file: 'admin_system_admin.json' },
  { role: 'support_admin', email: 'test-support@nidus-test.local', file: 'admin_support_admin.json' },
  { role: 'content_admin', email: 'test-content@nidus-test.local', file: 'admin_content_admin.json' },
]

export const PLATFORM_ACCOUNTS = [
  { role: 'pmo_admin', email: 'test-pmo@nidus-test.local', file: 'platform_pmo_admin.json' },
  { role: 'project_manager', email: 'test-pm@nidus-test.local', file: 'platform_project_manager.json' },
  { role: 'programme_manager', email: 'test-pgm@nidus-test.local', file: 'platform_programme_manager.json' },
  { role: 'portfolio_manager', email: 'test-pfm@nidus-test.local', file: 'platform_portfolio_manager.json' },
  { role: 'team_lead', email: 'test-tl@nidus-test.local', file: 'platform_team_lead.json' },
  { role: 'team_member', email: 'test-tm@nidus-test.local', file: 'platform_team_member.json' },
  { role: 'stakeholder', email: 'test-sh@nidus-test.local', file: 'platform_stakeholder.json' },
  { role: 'viewer', email: 'test-viewer@nidus-test.local', file: 'platform_viewer.json' },
]

export const SIMULATOR_ACCOUNTS = [
  { role: 'portfolio', email: 'test-pfm@nidus-test.local', file: 'sim_portfolio.json', simRole: 'portfolio' },
  { role: 'programme', email: 'test-pgm@nidus-test.local', file: 'sim_programme.json', simRole: 'programme' },
  { role: 'coordinator', email: 'test-tl@nidus-test.local', file: 'sim_coordinator.json', simRole: 'coordinator' },
  { role: 'pmo', email: 'test-pmo@nidus-test.local', file: 'sim_pmo.json', simRole: 'pmo' },
]
