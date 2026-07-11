import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { executeBulkOperation } from './bulkOperationService.js'

export function useBulkSelection({ rows = [], idKey = 'id' }) {
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState(null)
  const abortRef = useRef(null)

  const rowIds = useMemo(
    () => new Set(rows.map((row) => row[idKey]).filter(Boolean)),
    [rows, idKey],
  )

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => rowIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [rowIds])

  const selectedItems = useMemo(
    () => rows.filter((row) => selectedIds.has(row[idKey])),
    [rows, selectedIds, idKey],
  )

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setResults(null)
    setProgress({ current: 0, total: 0 })
  }, [])

  const executeBulk = useCallback(async (operation, { signal } = {}) => {
    const items = rows.filter((row) => selectedIds.has(row[idKey]))
    if (!items.length) return { succeeded: [], failed: [], errors: [] }

    setProcessing(true)
    setProgress({ current: 0, total: items.length })
    setResults(null)

    const controller = signal ? null : new AbortController()
    const activeSignal = signal || controller.signal
    abortRef.current = controller

    const outcome = await executeBulkOperation({
      items,
      operation,
      signal: activeSignal,
      onProgress: ({ current, total }) => setProgress({ current, total }),
    })

    setResults(outcome)
    setProcessing(false)
    abortRef.current = null

    if (!outcome.cancelled && outcome.failed.length === 0) {
      clearSelection()
    }

    return outcome
  }, [rows, selectedIds, idKey, clearSelection])

  const cancelBulk = useCallback(() => {
    abortRef.current?.abort()
    setProcessing(false)
  }, [])

  return {
    selectedIds,
    setSelectedIds,
    selectedItems,
    selectedCount: selectedIds.size,
    processing,
    progress,
    results,
    executeBulk,
    clearSelection,
    cancelBulk,
  }
}
