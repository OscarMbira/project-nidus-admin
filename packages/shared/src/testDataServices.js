import { getAdminDb } from './supabase.js'

const q = (client, table, select, opts = {}) => {
  if (!client) return Promise.resolve({ data: [], error: null, count: 0 })
  let query = client.from(table).select(select, opts.count ? { count: 'exact' } : undefined)
  if (opts.order?.column) {
    query = opts.order.asc === false
      ? query.order(opts.order.column, { ascending: false })
      : query.order(opts.order.column)
  }
  if (opts.limit) query = query.limit(opts.limit)
  if (opts.filters) {
    for (const f of opts.filters) {
      if (f.op === 'eq') query = query.eq(f.col, f.val)
      else if (f.op === 'ilike') query = query.ilike(f.col, f.val)
    }
  }
  return query
}

export const fetchTestSuites = (opts = {}) =>
  q(getAdminDb(), 'test_suites', '*', {
    order: { column: 'system' },
    limit: opts.limit || 500,
    filters: opts.system ? [{ op: 'eq', col: 'system', val: opts.system }] : undefined,
  })

export const fetchTestSuiteById = (id) =>
  q(getAdminDb(), 'test_suites', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export const fetchTestCases = (suiteId) =>
  q(getAdminDb(), 'test_cases', '*', {
    filters: [{ op: 'eq', col: 'suite_id', val: suiteId }],
    order: { column: 'case_name' },
    limit: 500,
  })

export const fetchTestRuns = (opts = {}) =>
  q(getAdminDb(), 'test_runs', '*', {
    order: { column: 'created_at', asc: false },
    limit: opts.limit || 50,
  })

export const fetchTestRunById = (id) =>
  q(getAdminDb(), 'test_runs', '*', { filters: [{ op: 'eq', col: 'id', val: id }], limit: 1 })
    .then(({ data, error }) => ({ data: data?.[0] ?? null, error }))

export async function fetchTestCoverageSummary() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_test_coverage_summary')
  return { data: data || [], error: error?.message || error || null }
}

export async function fetchTestRunResults(runId) {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_test_run_results', { p_run_id: runId })
  return { data: data || [], error: error?.message || error || null }
}

export async function fetchTestResultById(resultId, runId) {
  if (!resultId || !runId) return { data: null, error: 'Missing result or run id' }
  const { data, error } = await fetchTestRunResults(runId)
  if (error) return { data: null, error }
  const match = (data || []).find((row) => row.result_id === resultId)
  return { data: match ?? null, error: match ? null : 'Result not found' }
}

export async function fetchAutoFixSummary(runId) {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc('get_auto_fix_summary', { p_run_id: runId })
  return { data: data?.[0] ?? null, error: error?.message || error || null }
}

export async function fetchFixPatternStats() {
  const db = getAdminDb()
  if (!db) return { data: [], error: 'Database not configured' }
  const { data, error } = await db.rpc('get_fix_pattern_stats')
  return { data: data || [], error: error?.message || error || null }
}

export const fetchFixPatterns = () =>
  q(getAdminDb(), 'test_fix_patterns', '*', { order: { column: 'pattern_name' }, limit: 200 })

export async function fetchTestDashboardStats() {
  const db = getAdminDb()
  if (!db) return { data: null, error: 'Database not configured' }

  const [suites, cases, runs, coverage, patterns] = await Promise.all([
    db.from('test_suites').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('test_cases').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('test_runs').select('*').order('created_at', { ascending: false }).limit(1),
    db.rpc('get_test_coverage_summary'),
    db.rpc('get_fix_pattern_stats'),
  ])

  const lastRun = runs.data?.[0] ?? null
  const passRate = lastRun && lastRun.total_tests > 0
    ? Math.round((lastRun.passed_count / lastRun.total_tests) * 100)
    : 0

  const coverageRows = coverage.data || []
  const avgCoverage = coverageRows.length
    ? Math.round(coverageRows.reduce((sum, r) => sum + Number(r.pass_rate || 0), 0) / coverageRows.length)
    : 0

  const patternRows = patterns.data || []
  const autoFixAttempts = patternRows.reduce((sum, p) => sum + (p.success_count || 0) + (p.failure_count || 0), 0)
  const autoFixSuccess = patternRows.reduce((sum, p) => sum + (p.success_count || 0), 0)

  return {
    data: {
      totalSuites: suites.count || 0,
      totalCases: cases.count || 0,
      lastRun,
      passRate,
      coveragePercent: avgCoverage,
      autoFixAttempts,
      autoFixSuccessRate: autoFixAttempts ? Math.round((autoFixSuccess / autoFixAttempts) * 100) : 0,
      coverageMatrix: coverageRows,
      fixPatterns: patternRows.slice(0, 5),
    },
    error: null,
  }
}
