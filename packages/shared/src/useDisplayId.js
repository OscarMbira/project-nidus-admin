import { useEffect, useState } from 'react'
import { bulkResolveDisplayIds, generateDisplayId, resolveDisplayId, formatDisplayIdError } from './mutationServices.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value) {
  return UUID_RE.test(String(value || ''))
}

export async function getDisplayIdForRecord(tableName, recordId) {
  if (!tableName || !recordId) return null
  const { data, error } = await generateDisplayId(tableName, recordId)
  if (error) throw new Error(formatDisplayIdError(error))
  return data || null
}

export async function getUuidFromDisplayId(tableName, displayId) {
  if (!tableName || !displayId) return null
  const { data, error } = await resolveDisplayId(tableName, displayId)
  if (error) throw new Error(typeof error === 'string' ? error : error.message || String(error))
  return data || null
}

export function useDisplayId(tableName, idParam) {
  const [state, setState] = useState({
    uuid: null,
    displayId: null,
    loading: Boolean(idParam && tableName),
    error: null,
  })

  useEffect(() => {
    if (!tableName || !idParam) {
      setState({ uuid: null, displayId: null, loading: false, error: null })
      return undefined
    }

    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, error: null }))

    const resolve = async () => {
      try {
        if (isUuid(idParam)) {
          const { data: rows, error: bulkError } = await bulkResolveDisplayIds(tableName, [idParam])
          if (bulkError) throw new Error(bulkError)
          const existing = rows?.find?.((row) => row.record_id === idParam)
            ?? rows?.[0]
          let displayId = existing?.display_id || null
          if (!displayId) {
            const { data: generated, error: genError } = await generateDisplayId(tableName, idParam)
            if (genError) throw new Error(genError)
            displayId = generated || null
          }
          if (!cancelled) {
            setState({ uuid: idParam, displayId, loading: false, error: null })
          }
          return
        }

        const { data: uuid, error } = await resolveDisplayId(tableName, idParam)
        if (error) throw new Error(error)
        if (!cancelled) {
          setState({ uuid: uuid || null, displayId: idParam, loading: false, error: null })
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            uuid: null,
            displayId: null,
            loading: false,
            error: formatDisplayIdError(err.message || err),
          })
        }
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [tableName, idParam])

  return state
}

export function useDisplayIdMap(tableName, recordIds, options = {}) {
  const { generateMissing = false } = options
  const [displayIdMap, setDisplayIdMap] = useState({})
  const [loading, setLoading] = useState(false)

  const idsKey = Array.isArray(recordIds) ? recordIds.join(',') : ''
  const generateMissingKey = generateMissing ? '1' : '0'

  useEffect(() => {
    if (!tableName || !recordIds?.length) {
      setDisplayIdMap({})
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)

    const resolve = async () => {
      const { data, error } = await bulkResolveDisplayIds(tableName, recordIds)
      if (cancelled) return
      if (error) {
        setDisplayIdMap({})
        setLoading(false)
        return
      }

      const map = {}
      for (const row of data || []) {
        if (row.record_id && row.display_id) map[row.record_id] = row.display_id
      }

      if (generateMissing) {
        const missing = recordIds.filter((id) => id && !map[id])
        if (missing.length) {
          const generated = await Promise.all(
            missing.map(async (id) => {
              const { data: displayId, error: genError } = await generateDisplayId(tableName, id)
              if (genError || !displayId) return null
              return { record_id: id, display_id: displayId }
            }),
          )
          for (const row of generated) {
            if (row?.record_id && row?.display_id) map[row.record_id] = row.display_id
          }
        }
      }

      if (!cancelled) {
        setDisplayIdMap(map)
        setLoading(false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [tableName, idsKey, generateMissingKey])

  return { displayIdMap, loading }
}

export function navId(displayIdMap, recordId) {
  return encodeURIComponent(displayIdMap[recordId] || recordId)
}
