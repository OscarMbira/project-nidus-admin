#!/usr/bin/env node
/**
 * Ensures each admin module workflow has a sync-docs job.
 * Run: node scripts/patch-workflow-doc-sync.js
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ROOT = join(process.cwd(), '.github', 'workflows')

const MODULES = [
  { workflow: 'admin-users.yml', folder: 'users', storage: 'users' },
  { workflow: 'admin-subscriptions.yml', folder: 'subscriptions', storage: 'subscriptions' },
  { workflow: 'admin-system.yml', folder: 'system', storage: 'system' },
  { workflow: 'admin-support.yml', folder: 'support', storage: 'support' },
  { workflow: 'admin-errors.yml', folder: 'errors', storage: 'errors' },
  { workflow: 'admin-mirrors.yml', folder: 'mirrors', storage: 'mirrors' },
  { workflow: 'admin-platform.yml', folder: 'platform', storage: 'platform' },
  { workflow: 'admin-simulator.yml', folder: 'simulator', storage: 'simulator' },
  { workflow: 'admin-security.yml', folder: 'security', storage: 'security' },
  { workflow: 'admin-content.yml', folder: 'content', storage: 'content' },
  { workflow: 'admin-feedback.yml', folder: 'feedback', storage: 'feedback' },
  { workflow: 'admin-audit.yml', folder: 'audit', storage: 'audit' },
  { workflow: 'admin-admin-mgmt.yml', folder: 'admin-mgmt', storage: 'admin-mgmt' },
  { workflow: 'admin-affiliates.yml', folder: 'affiliates', storage: 'affiliates', pkg: 'affiliates' },
  { workflow: 'admin-batch-ops.yml', folder: 'batch-ops', storage: 'batch-ops', pkg: 'batch-ops' },
  { workflow: 'admin-system-testers.yml', folder: 'system-testers', storage: 'testers', pkg: 'system-testers' },
  { workflow: 'admin-docs-centre.yml', folder: 'docs-centre', storage: 'docs-centre', pkg: 'docs-centre' },
  { workflow: 'admin-testing-centre.yml', folder: 'testing-centre', storage: 'testing-centre', pkg: 'testing-centre' },
]

const SYNC_MARKER = 'sync-docs:'

function syncBlock(folder, storage) {
  const cmd = storage === folder
    ? `node scripts/sync-module-docs.js ${folder}`
    : `node scripts/sync-module-docs.js ${folder} ${storage}`
  return `
  sync-docs:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Sync module docs to Supabase Storage
        env:
          SUPABASE_URL: \${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: \${{ secrets.SUPABASE_SERVICE_KEY }}
        run: ${cmd}
`
}

function workflowBody({ folder, storage, pkg }) {
  const packageName = pkg || folder
  return `name: Admin ${folder} Module CI/CD
on:
  push:
    branches: [main, develop]
    paths:
      - 'modules/${folder}/**'
  pull_request:
    paths:
      - 'modules/${folder}/**

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build --filter=@nidus-admin/${packageName}
${syncBlock(folder, storage)}
`
}

for (const mod of MODULES) {
  const filePath = join(ROOT, mod.workflow)
  if (existsSync(filePath)) {
    let content = readFileSync(filePath, 'utf8')
    if (!content.includes(SYNC_MARKER)) {
      content = content.trimEnd() + syncBlock(mod.folder, mod.storage)
      writeFileSync(filePath, content + '\n')
      console.log(`Patched ${mod.workflow}`)
    }
  } else {
    writeFileSync(filePath, workflowBody(mod))
    console.log(`Created ${mod.workflow}`)
  }
}
