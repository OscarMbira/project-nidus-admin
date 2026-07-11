import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadEnv } from './helpers/env.js'
import { cleanupTestData, updateTestRunStatus } from './helpers/api-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.resolve(__dirname, '..', '.auth')

export default async function globalTeardown() {
  loadEnv()

  const runMetaPath = path.join(authDir, 'run-id.json')
  if (fs.existsSync(runMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(runMetaPath, 'utf8'))
      const durationMs = Date.now() - new Date(meta.startedAt).getTime()
      if (meta.status) {
        console.log(`E2E teardown: run ${meta.runId} already finalized (${meta.status})`)
      } else {
        await updateTestRunStatus(meta.runId, 'completed', { durationMs })
        console.log(`E2E teardown: finalized run ${meta.runId}`)
      }
    } catch (err) {
      console.warn(`E2E teardown: could not finalize run — ${err.message}`)
    }
  }

  try {
    await cleanupTestData('[TEST]')
    console.log('E2E teardown: cleaned [TEST] tagged data')
  } catch (err) {
    console.warn(`E2E teardown: cleanup warning — ${err.message}`)
  }
}
