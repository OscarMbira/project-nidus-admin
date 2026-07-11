import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { ADMIN_ALL_ROUTES, ADMIN_FEATURE_TESTS, MODULE_ROLES } from '../e2e/catalogs/admin-routes.js'
import { PLATFORM_ROUTES, PLATFORM_FEATURE_TESTS } from '../e2e/catalogs/platform-routes.js'
import { SIMULATOR_ROUTES, SIMULATOR_FEATURE_TESTS } from '../e2e/catalogs/simulator-routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx < 0 || line.trimStart().startsWith('#')) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) process.env[key] = val
  }
}

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
}

function resolveDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  }
  const supabaseUrl = process.env.VITE_ADMIN_SUPABASE_URL
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!supabaseUrl || !password) return null
  const ref = new URL(supabaseUrl).hostname.split('.')[0]
  const region = process.env.SUPABASE_DB_REGION || 'eu-central-1'
  const useDirect = process.env.SUPABASE_DB_DIRECT === 'true'
  const host = process.env.SUPABASE_DB_HOST
    || (useDirect ? `db.${ref}.supabase.co` : `aws-0-${region}.pooler.supabase.com`)
  const user = process.env.SUPABASE_DB_USER
    || (useDirect ? 'postgres' : `postgres.${ref}`)
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${process.env.SUPABASE_DB_PORT || '5432'}/postgres`
}

function getSupabaseAdmin() {
  const url = process.env.VITE_ADMIN_SUPABASE_URL
  const serviceKey = process.env.VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    db: { schema: 'admin' },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── Supabase client backend ───────────────────────────────────────────────

async function upsertSuiteSupabase(db, { suiteKey, suiteName, system, module, targetRole, description }) {
  const { data, error } = await db.from('test_suites').upsert({
    suite_key: suiteKey,
    suite_name: suiteName,
    system,
    module,
    target_role: targetRole,
    description,
    is_active: true,
  }, { onConflict: 'suite_key' }).select('id').single()
  if (error) throw new Error(`upsert suite ${suiteKey}: ${error.message}`)
  return data.id
}

async function upsertCaseSupabase(db, { suiteId, caseName, caseKey, testType, pagePath, operation, priority, expectedOutcome }) {
  const { error } = await db.from('test_cases').upsert({
    suite_id: suiteId,
    case_name: caseName,
    case_key: caseKey,
    test_type: testType,
    page_path: pagePath,
    operation,
    priority,
    expected_outcome: expectedOutcome,
    is_active: true,
  }, { onConflict: 'suite_id,case_key' })
  if (error) throw new Error(`upsert case ${caseKey}: ${error.message}`)
}

async function updateSuiteCountsSupabase(db) {
  const { data: suites, error } = await db.from('test_suites').select('id')
  if (error) throw new Error(error.message)
  for (const suite of suites || []) {
    const { count } = await db.from('test_cases')
      .select('*', { count: 'exact', head: true })
      .eq('suite_id', suite.id)
      .eq('is_active', true)
    await db.from('test_suites').update({ test_count: count || 0 }).eq('id', suite.id)
  }
}

// ─── Direct Postgres backend (optional) ────────────────────────────────────

async function upsertSuitePg(client, payload) {
  const { rows } = await client.query(
    `INSERT INTO admin.test_suites (suite_key, suite_name, system, module, target_role, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (suite_key) DO UPDATE SET
       suite_name = EXCLUDED.suite_name, module = EXCLUDED.module,
       target_role = EXCLUDED.target_role, description = EXCLUDED.description, updated_at = NOW()
     RETURNING id`,
    [payload.suiteKey, payload.suiteName, payload.system, payload.module, payload.targetRole, payload.description],
  )
  return rows[0].id
}

async function upsertCasePg(client, payload) {
  await client.query(
    `INSERT INTO admin.test_cases (suite_id, case_name, case_key, test_type, page_path, operation, priority, expected_outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (suite_id, case_key) DO UPDATE SET
       case_name = EXCLUDED.case_name, page_path = EXCLUDED.page_path,
       operation = EXCLUDED.operation, priority = EXCLUDED.priority,
       expected_outcome = EXCLUDED.expected_outcome, updated_at = NOW()`,
    [payload.suiteId, payload.caseName, payload.caseKey, payload.testType, payload.pagePath, payload.operation, payload.priority, payload.expectedOutcome],
  )
}

async function updateSuiteCountsPg(client) {
  await client.query(`
    UPDATE admin.test_suites s SET test_count = sub.cnt, updated_at = NOW()
    FROM (SELECT suite_id, COUNT(*)::INTEGER AS cnt FROM admin.test_cases WHERE is_active = TRUE GROUP BY suite_id) sub
    WHERE s.id = sub.suite_id
  `)
}

// ─── Shared seed logic ─────────────────────────────────────────────────────

async function seedCatalog(upsertSuite, upsertCase) {
  let caseCount = 0
  const adminRoles = ['super_admin', 'system_admin', 'support_admin', 'content_admin']

  for (const role of adminRoles) {
    const suiteId = await upsertSuite({
      suiteKey: `admin.access.${role}`,
      suiteName: `Admin Access — ${role}`,
      system: 'admin',
      module: 'access',
      targetRole: role,
      description: `Route access control for ${role}`,
    })
    for (const route of ADMIN_ALL_ROUTES) {
      await upsertCase({
        suiteId,
        caseName: `${role} access: ${route.label}`,
        caseKey: `admin.access.${role}.${slugify(route.path)}`,
        testType: 'access_control',
        pagePath: route.path,
        operation: 'read',
        priority: 'high',
        expectedOutcome: 'pass',
      })
      caseCount += 1
    }
  }

  for (const [module, tests] of Object.entries(ADMIN_FEATURE_TESTS)) {
    for (const role of MODULE_ROLES[module] || ['super_admin']) {
      const suiteId = await upsertSuite({
        suiteKey: `admin.${module}.${role}`,
        suiteName: `${module} Module — ${role}`,
        system: 'admin',
        module,
        targetRole: role,
        description: `Feature tests for ${module} module`,
      })
      for (const t of tests) {
        await upsertCase({
          suiteId,
          caseName: t.name,
          caseKey: `admin.${module}.${role}.${slugify(t.name)}`,
          testType: 'e2e',
          pagePath: t.path,
          operation: t.operation,
          priority: 'medium',
          expectedOutcome: 'pass',
        })
        caseCount += 1
      }
    }
  }

  for (const [role, routes] of Object.entries(PLATFORM_ROUTES)) {
    const suiteId = await upsertSuite({
      suiteKey: `platform.access.${role}`,
      suiteName: `Platform Access — ${role}`,
      system: 'platform',
      module: 'access',
      targetRole: role,
      description: `Platform route access for ${role}`,
    })
    for (const routePath of routes) {
      await upsertCase({
        suiteId,
        caseName: `${role} access: ${routePath}`,
        caseKey: `platform.access.${role}.${slugify(routePath)}`,
        testType: 'access_control',
        pagePath: routePath,
        operation: 'read',
        priority: 'high',
        expectedOutcome: 'pass',
      })
      caseCount += 1
    }
  }

  for (const [area, tests] of Object.entries(PLATFORM_FEATURE_TESTS)) {
    for (const t of tests) {
      for (const role of t.roles) {
        const suiteId = await upsertSuite({
          suiteKey: `platform.${area}.${role}`,
          suiteName: `Platform ${area} — ${role}`,
          system: 'platform',
          module: area,
          targetRole: role,
          description: `Platform ${area} feature tests`,
        })
        await upsertCase({
          suiteId,
          caseName: t.name,
          caseKey: `platform.${area}.${role}.${slugify(t.name)}`,
          testType: 'e2e',
          pagePath: t.path,
          operation: 'read',
          priority: 'medium',
          expectedOutcome: 'pass',
        })
        caseCount += 1
      }
    }
  }

  for (const [role, routes] of Object.entries(SIMULATOR_ROUTES)) {
    const suiteId = await upsertSuite({
      suiteKey: `simulator.access.${role}`,
      suiteName: `Simulator Access — ${role}`,
      system: 'simulator',
      module: 'access',
      targetRole: role,
      description: `Simulator route access for ${role}`,
    })
    for (const routePath of routes) {
      await upsertCase({
        suiteId,
        caseName: `${role} access: ${routePath}`,
        caseKey: `simulator.access.${role}.${slugify(routePath)}`,
        testType: 'access_control',
        pagePath: routePath,
        operation: 'read',
        priority: 'high',
        expectedOutcome: 'pass',
      })
      caseCount += 1
    }
  }

  for (const [area, tests] of Object.entries(SIMULATOR_FEATURE_TESTS)) {
    for (const t of tests) {
      for (const role of t.roles) {
        const suiteId = await upsertSuite({
          suiteKey: `simulator.${area}.${role}`,
          suiteName: `Simulator ${area} — ${role}`,
          system: 'simulator',
          module: area,
          targetRole: role,
          description: `Simulator ${area} feature tests`,
        })
        await upsertCase({
          suiteId,
          caseName: t.name,
          caseKey: `simulator.${area}.${role}.${slugify(t.name)}`,
          testType: 'e2e',
          pagePath: t.path,
          operation: 'read',
          priority: 'medium',
          expectedOutcome: 'pass',
        })
        caseCount += 1
      }
    }
  }

  const crossSuiteId = await upsertSuite({
    suiteKey: 'cross-system.integration',
    suiteName: 'Cross-System Integration',
    system: 'admin',
    module: 'cross-system',
    targetRole: 'super_admin',
    description: 'Cross-system propagation tests',
  })
  for (const t of [
    { name: 'Admin suspend blocks platform login', key: 'cross.suspend.platform', path: '/users/user-list' },
    { name: 'Admin suspend blocks simulator login', key: 'cross.suspend.simulator', path: '/users/user-list' },
    { name: 'Admin disable country blocks platform', key: 'cross.country.platform', path: '/system/countries' },
    { name: 'Admin disable country blocks simulator', key: 'cross.country.simulator', path: '/system/countries' },
    { name: 'Admin subscription change on platform', key: 'cross.subscription.platform', path: '/subscriptions/subscription-list' },
    { name: 'Admin subscription change on simulator', key: 'cross.subscription.simulator', path: '/subscriptions/subscription-list' },
    { name: 'Admin deactivate currency platform', key: 'cross.currency.platform', path: '/system/currencies' },
    { name: 'Admin maintenance mode platform', key: 'cross.maintenance.platform', path: '/system/maintenance-mode' },
    { name: 'Admin maintenance mode simulator', key: 'cross.maintenance.simulator', path: '/system/maintenance-mode' },
  ]) {
    await upsertCase({
      suiteId: crossSuiteId,
      caseName: t.name,
      caseKey: t.key,
      testType: 'e2e',
      pagePath: t.path,
      operation: 'read',
      priority: 'critical',
      expectedOutcome: 'pass',
    })
    caseCount += 1
  }

  return caseCount
}

async function main() {
  const db = getSupabaseAdmin()
  const databaseUrl = resolveDatabaseUrl()

  if (db) {
    console.log('Seeding test catalog via Supabase service role...')
    try {
      const caseCount = await seedCatalog(
        (p) => upsertSuiteSupabase(db, p),
        (p) => upsertCaseSupabase(db, p),
      )
      await updateSuiteCountsSupabase(db)
      console.log(`Test catalog seeded: ${caseCount} test cases across all systems.`)
      return
    } catch (err) {
      if (!err.message?.includes('does not exist') && !err.message?.includes('relation')) {
        throw err
      }
      console.error('\nTables not found — run the migration first:')
      console.error('  Option A: Supabase Dashboard → SQL Editor → paste SQL/v36_test_management.sql → Run')
      console.error('  Option B: Set SUPABASE_DB_PASSWORD in .env → pnpm admin:seed-test-management\n')
      process.exit(1)
    }
  }

  if (databaseUrl) {
    console.log('Seeding test catalog via direct Postgres...')
    const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
    await client.connect()
    const caseCount = await seedCatalog(
      (p) => upsertSuitePg(client, p),
      (p) => upsertCasePg(client, p),
    )
    await updateSuiteCountsPg(client)
    await client.end()
    console.log(`Test catalog seeded: ${caseCount} test cases across all systems.`)
    return
  }

  console.error('Set VITE_ADMIN_SUPABASE_URL + VITE_ADMIN_SUPABASE_SERVICE_ROLE_KEY in .env')
  console.error('(or SUPABASE_DB_PASSWORD / SUPABASE_DB_URL for direct Postgres)')
  process.exit(1)
}

main().catch((e) => { console.error(e.message || e); process.exit(1) })
