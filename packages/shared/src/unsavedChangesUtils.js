/**
 * Pure helpers for unsaved-changes navigation guards (unit-tested).
 */

const SKIP_HREF_PREFIXES = ['mailto:', 'tel:', 'javascript:']

/**
 * @param {MouseEvent} event
 * @param {string} [currentPath=window.location.pathname + window.location.search + window.location.hash]
 * @returns {{ intercept: boolean, targetPath?: string }}
 */
export function evaluateLinkClickForGuard(event, currentPath) {
  if (event.defaultPrevented) return { intercept: false }
  if (event.button !== 0) return { intercept: false }
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return { intercept: false }

  const target = event.target
  if (!(target instanceof Element)) return { intercept: false }

  const anchor = target.closest('a[href]')
  if (!anchor || !(anchor instanceof HTMLAnchorElement)) return { intercept: false }
  if (anchor.target === '_blank' || anchor.hasAttribute('download')) return { intercept: false }

  const href = anchor.getAttribute('href')
  if (!href || href.startsWith('#')) return { intercept: false }
  if (SKIP_HREF_PREFIXES.some((prefix) => href.toLowerCase().startsWith(prefix))) {
    return { intercept: false }
  }

  let url
  try {
    url = new URL(href, window.location.origin)
  } catch {
    return { intercept: false }
  }

  if (url.origin !== window.location.origin) return { intercept: false }

  const targetPath = `${url.pathname}${url.search}${url.hash}`
  const current = currentPath ?? `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (targetPath === current) return { intercept: false }

  return { intercept: true, targetPath }
}

/**
 * @param {Iterable<{ isDirty?: boolean, message?: string }>} guards
 */
export function aggregateDirtyState(guards) {
  let isDirty = false
  let message = null
  for (const guard of guards) {
    if (guard?.isDirty) {
      isDirty = true
      if (guard.message) message = guard.message
    }
  }
  return {
    isDirty,
    message: message || 'You have unsaved changes. Discard them and leave this page?',
  }
}
