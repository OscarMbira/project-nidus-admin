import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Resolve aliases that silence Node built-in warnings in browser Vite builds. */
export function adminBrowserResolveAliases() {
  return {
    stream: path.resolve(__dirname, 'src/shims/empty-stream.js'),
  }
}

/** Merge into vite `optimizeDeps` so xlsx does not pull Node stream. */
export function adminBrowserOptimizeDeps(existing = {}) {
  return {
    ...existing,
    exclude: [...new Set([...(existing.exclude || []), 'xlsx-js-style'])],
  }
}
