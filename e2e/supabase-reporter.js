import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './helpers/env.js'
import { findCaseByKey, recordTestResult, updateTestRunStatus } from './helpers/api-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.resolve(__dirname, '..', '.auth')

loadEnv()

function getRunId() {
  if (process.env.E2E_RUN_ID) return process.env.E2E_RUN_ID
  const metaPath = path.join(authDir, 'run-id.json')
  if (fs.existsSync(metaPath)) {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')).runId
  }
  return null
}

function caseKeyFromTest(test) {
  const title = test.title.replace(/\s+/g, '.').toLowerCase()
  const file = path.basename(test.location.file, path.extname(test.location.file))
  return `${file}.${title}`.replace(/[^a-z0-9._-]/gi, '_').slice(0, 120)
}

class SupabaseReporter {
  constructor() {
    this.runId = getRunId()
    this.counts = { passed: 0, failed: 0, skipped: 0, total: 0 }
    this.startedAt = Date.now()
  }

  onBegin(_config, suite) {
    this.counts.total = suite.allTests().length
    if (this.runId) {
      updateTestRunStatus(this.runId, 'running', { total: this.counts.total }).catch(() => {})
    }
  }

  async onTestEnd(test, result) {
    const statusMap = { passed: 'passed', failed: 'failed', timedOut: 'error', skipped: 'skipped', interrupted: 'error' }
    const status = statusMap[result.status] || 'error'
    if (status === 'passed') this.counts.passed += 1
    else if (status === 'skipped') this.counts.skipped += 1
    else this.counts.failed += 1

    if (!this.runId) return

    const caseKey = caseKeyFromTest(test)
    let caseId = null
    try {
      const match = await findCaseByKey(caseKey)
      caseId = match?.id ?? null
    } catch {
      // catalog may not be seeded yet
    }

    const screenshot = result.attachments.find((a) => a.name === 'screenshot')
    const trace = result.attachments.find((a) => a.name === 'trace')

    await recordTestResult(this.runId, {
      caseId,
      status,
      durationMs: result.duration,
      error: result.error?.message || null,
      errorStack: result.error?.stack || null,
      screenshotUrl: screenshot?.path || null,
      traceUrl: trace?.path || null,
      metadata: { retry: result.retry, project: test.parent?.project?.()?.name },
    }).catch(() => {})
  }

  async onEnd() {
    if (!this.runId) return
    const durationMs = Date.now() - this.startedAt
    const finalStatus = this.counts.failed > 0 ? 'failed' : 'completed'
    const summary = {
      total: this.counts.total,
      passed: this.counts.passed,
      failed: this.counts.failed,
      skipped: this.counts.skipped,
      durationMs,
      status: finalStatus,
    }
    try {
      await updateTestRunStatus(this.runId, finalStatus, summary)
      const metaPath = path.join(authDir, 'run-id.json')
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        fs.writeFileSync(metaPath, JSON.stringify({ ...meta, ...summary }))
      }
    } catch (err) {
      console.warn(`E2E reporter: could not finalize run — ${err.message}`)
    }
  }
}

export default SupabaseReporter
