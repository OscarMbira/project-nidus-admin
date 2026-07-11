import fs from 'fs'
import path from 'path'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'url'
import {
  loadEnv,
  TEST_PASSWORD,
  ADMIN_ACCOUNTS,
  PLATFORM_ACCOUNTS,
  SIMULATOR_ACCOUNTS,
} from './helpers/env.js'
import { createTestRun } from './helpers/api-client.js'
import {
  assertStorageStateFile,
  injectAdminSession,
  saveAdminStorageState,
  saveFullStorageState,
  signInAdminAccount,
} from './helpers/auth-storage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.resolve(__dirname, '..', '.auth')

function systemsToAuth() {
  if (process.env.E2E_AUTH_SYSTEMS) {
    return process.env.E2E_AUTH_SYSTEMS.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const args = process.argv.join(' ')
  const systems = new Set()
  if (/tests[/\\]admin|tests[/\\]cross-system|--project=admin|--project=cross-system/.test(args)) {
    systems.add('admin')
  }
  if (/tests[/\\]platform|--project=platform/.test(args)) systems.add('platform')
  if (/tests[/\\]simulator|--project=sim-/.test(args)) systems.add('simulator')
  if (systems.size === 0) return ['admin', 'platform', 'simulator']
  return [...systems]
}

async function loginAdminAccount(browser, baseURL, account) {
  const filePath = path.join(authDir, account.file)
  const session = await signInAdminAccount(account.email, TEST_PASSWORD)
  const context = await browser.newContext({ baseURL })
  await injectAdminSession(context, session)
  const page = await context.newPage()

  try {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })

    if (page.url().includes('/auth/2fa-setup')) {
      throw new Error('requires 2FA setup — re-run pnpm test:seed-accounts (sets requires_2fa=false)')
    }

    await saveAdminStorageState(context, page, filePath)
    assertStorageStateFile(filePath, account.email)
    console.log(`  ✓ ${account.email} → ${account.file}`)
    return true
  } catch (err) {
    console.warn(`  ⚠ Admin auth failed for ${account.email}: ${err.message.split('\n')[0]}`)
    fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }))
    return false
  } finally {
    await context.close()
  }
}

async function loginViaUi(browser, baseURL, account, options = {}) {
  const filePath = path.join(authDir, account.file)
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()

  try {
    await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.fill('input[type="email"], input[name="email"]', account.email)
    await page.fill('input[type="password"], input[name="password"]', TEST_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 })

    if (options.simRole) {
      await page.goto('/role-selection', { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {})
      const roleBtn = page.getByRole('button', { name: new RegExp(options.simRole, 'i') })
      if (await roleBtn.count() > 0) {
        await roleBtn.first().click()
        await page.waitForLoadState('networkidle').catch(() => {})
      }
    }

    await saveFullStorageState(context, page, filePath)
    console.log(`  ✓ ${account.email} → ${account.file}`)
    return true
  } catch (err) {
    const refused = String(err.message).includes('ERR_CONNECTION_REFUSED')
    if (!refused) {
      console.warn(`  ⚠ Auth skipped for ${account.email}: ${err.message.split('\n')[0]}`)
    }
    fs.writeFileSync(filePath, JSON.stringify({ cookies: [], origins: [] }))
    return false
  } finally {
    await context.close()
  }
}

export default async function globalSetup() {
  loadEnv()
  fs.mkdirSync(authDir, { recursive: true })

  const systems = systemsToAuth()
  const adminUrl = process.env.ADMIN_BASE_URL || 'http://localhost:5175'
  const platformUrl = process.env.PLATFORM_BASE_URL || 'http://localhost:5173'
  const simulatorUrl = process.env.SIMULATOR_BASE_URL || 'http://localhost:5174'

  console.log(`E2E global setup: authenticating [${systems.join(', ')}]...`)
  const browser = await chromium.launch()

  if (systems.includes('admin')) {
    for (const account of ADMIN_ACCOUNTS) {
      await loginAdminAccount(browser, adminUrl, account)
    }
  }
  if (systems.includes('platform')) {
    let refused = 0
    for (const account of PLATFORM_ACCOUNTS) {
      const ok = await loginViaUi(browser, platformUrl, account)
      if (!ok) refused += 1
    }
    if (refused === PLATFORM_ACCOUNTS.length) {
      console.warn(`  ⚠ Platform not reachable at ${platformUrl} — start it or run admin-only tests`)
    }
  }
  if (systems.includes('simulator')) {
    let refused = 0
    for (const account of SIMULATOR_ACCOUNTS) {
      const ok = await loginViaUi(browser, simulatorUrl, account, { simRole: account.simRole })
      if (!ok) refused += 1
    }
    if (refused === SIMULATOR_ACCOUNTS.length) {
      console.warn(`  ⚠ Simulator not reachable at ${simulatorUrl} — start it or run admin-only tests`)
    }
  }

  await browser.close()

  try {
    const runId = await createTestRun(`E2E run ${new Date().toISOString()}`, 'cli')
    if (runId) {
      process.env.E2E_RUN_ID = runId
      fs.writeFileSync(path.join(authDir, 'run-id.json'), JSON.stringify({ runId, startedAt: new Date().toISOString() }))
      console.log(`  ✓ Test run created: ${runId}`)
    }
  } catch (err) {
    console.warn(`  ⚠ Could not create test run record: ${err.message}`)
  }
}
