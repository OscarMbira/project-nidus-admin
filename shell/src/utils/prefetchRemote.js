import { MODULE_REGISTRY } from '../config/moduleRegistry.js'

const prefetched = new Set()
const inflight = new Map()

/** Warm a federated remote before navigation (sidebar hover / section expand). */
export function prefetchRemoteModule(moduleKey) {
  const entry = MODULE_REGISTRY[moduleKey]
  if (!entry?.load || prefetched.has(moduleKey) || inflight.has(moduleKey)) return

  const promise = entry.load()
    .then((mod) => {
      prefetched.add(moduleKey)
      inflight.delete(moduleKey)
      return mod
    })
    .catch(() => {
      inflight.delete(moduleKey)
    })

  inflight.set(moduleKey, promise)
}
