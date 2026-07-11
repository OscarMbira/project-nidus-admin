import { lazy } from 'react'

function isRemoteLoadError(error) {
  const msg = error?.message || ''
  return (
    msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Failed to fetch')
    || msg.includes('remoteEntry')
    || msg.includes('Loading chunk')
    || msg.includes('ERR_CONNECTION_REFUSED')
    || msg.includes('ERR_ABORTED')
    || msg.includes('404')
    || msg.includes('ECONNREFUSED')
    || msg.includes('NetworkError')
    || msg.includes('Load failed')
  )
}

/**
 * Module federation remotes need `vite preview` on their port before the shell can import them.
 * In dev, retry while remotes finish their initial build.
 */
export function lazyRemote(importer) {
  return lazy(async () => {
    const maxAttempts = import.meta.env.DEV ? 45 : 1
    const delayMs = 2000
    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await importer()
      } catch (error) {
        lastError = error
        if (!import.meta.env.DEV || !isRemoteLoadError(error) || attempt === maxAttempts) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    throw lastError
  })
}

export function isModuleRemoteError(error) {
  return isRemoteLoadError(error)
}
