/**
 * Session cache for private-storage image URLs (avatars, signatures).
 *
 * createSignedUrl returns a new token every call, which busts the browser HTTP
 * cache and adds a network round-trip before <img> can even start. Reusing one
 * signed URL for its lifetime (memory + sessionStorage) lets the browser cache
 * the bytes; inflight dedupe stops the header and profile page from minting two
 * tokens at once. Optional blob prefetch makes the next mount instant.
 */

const STORAGE_KEY = 'nidus.signedImageCache.v1'
const EXPIRY_SAFETY_MS = 60 * 1000

const memory = new Map()
const inflight = new Map()

function makeKey(bucket, path) {
  return `${bucket}:${path}`
}

function isFresh(entry) {
  return Boolean(entry?.signedUrl && entry.expiresAt && Date.now() < entry.expiresAt - EXPIRY_SAFETY_MS)
}

function readSessionStore() {
  try {
    if (typeof sessionStorage === 'undefined') return {}
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeSessionStore(store) {
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // quota / private mode — memory cache still works
  }
}

function persistSession(key, payload) {
  const store = readSessionStore()
  store[key] = payload
  writeSessionStore(store)
}

function removeSession(key) {
  const store = readSessionStore()
  if (!(key in store)) return
  delete store[key]
  writeSessionStore(store)
}

function hydrateFromSession(key) {
  const stored = readSessionStore()[key]
  if (!stored?.signedUrl || !stored.expiresAt) return null
  const entry = { signedUrl: stored.signedUrl, expiresAt: stored.expiresAt, objectUrl: null }
  memory.set(key, entry)
  return entry
}

function prefetchBlob(key, signedUrl) {
  if (!signedUrl || typeof fetch !== 'function') return
  const current = memory.get(key)
  if (!current || current.objectUrl || current.prefetching) return
  memory.set(key, { ...current, prefetching: true })
  fetch(signedUrl)
    .then((response) => {
      if (!response.ok) throw new Error('prefetch failed')
      return response.blob()
    })
    .then((blob) => {
      if (typeof URL === 'undefined' || !URL.createObjectURL) return
      const objectUrl = URL.createObjectURL(blob)
      const latest = memory.get(key)
      if (!latest || latest.signedUrl !== signedUrl) {
        URL.revokeObjectURL(objectUrl)
        return
      }
      if (latest.objectUrl) URL.revokeObjectURL(latest.objectUrl)
      memory.set(key, { ...latest, objectUrl, prefetching: false })
    })
    .catch(() => {
      const latest = memory.get(key)
      if (latest) memory.set(key, { ...latest, prefetching: false })
    })
}

/** Synchronous display URL if we already resolved this object this session. */
export function peekSignedImage(bucket, path) {
  if (!bucket || !path) return null
  const key = makeKey(bucket, path)
  const entry = memory.get(key) || hydrateFromSession(key)
  if (!entry) return null
  if (entry.objectUrl) return entry.objectUrl
  if (isFresh(entry)) return entry.signedUrl
  return null
}

/**
 * Return a reusable display URL, minting a signed URL only when the cache is cold.
 * `createSignedUrl` must resolve to the signed URL string.
 */
export async function resolveSignedImage({ bucket, path, expiresInSeconds, createSignedUrl }) {
  if (!bucket || !path) throw new Error('Bucket and path are required')
  const key = makeKey(bucket, path)
  const cached = peekSignedImage(bucket, path)
  const entry = memory.get(key)
  if (cached && isFresh(entry)) {
    if (!entry.objectUrl) prefetchBlob(key, entry.signedUrl)
    return cached
  }
  if (cached && entry?.objectUrl) return cached

  if (inflight.has(key)) return inflight.get(key)

  const pending = (async () => {
    const signedUrl = await createSignedUrl()
    const expiresAt = Date.now() + Math.max(60, Number(expiresInSeconds) || 3600) * 1000
    const previous = memory.get(key)
    memory.set(key, {
      signedUrl,
      expiresAt,
      objectUrl: previous?.objectUrl || null,
      prefetching: false,
    })
    persistSession(key, { signedUrl, expiresAt })
    prefetchBlob(key, signedUrl)
    return memory.get(key).objectUrl || signedUrl
  })()

  inflight.set(key, pending)
  try {
    return await pending
  } finally {
    inflight.delete(key)
  }
}

/** Drop a cached object so the next resolve mints a fresh signed URL (after replace/remove). */
export function invalidateSignedImage(bucket, path) {
  if (!bucket || !path) return
  const key = makeKey(bucket, path)
  const entry = memory.get(key)
  memory.delete(key)
  inflight.delete(key)
  removeSession(key)
  if (entry?.objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    const objectUrl = entry.objectUrl
    setTimeout(() => {
      try { URL.revokeObjectURL(objectUrl) } catch { /* already revoked */ }
    }, 5000)
  }
}

/** Test helper — also safe to call from logout if we ever need a full wipe. */
export function clearSignedImageCache() {
  for (const entry of memory.values()) {
    if (entry?.objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try { URL.revokeObjectURL(entry.objectUrl) } catch { /* ignore */ }
    }
  }
  memory.clear()
  inflight.clear()
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
