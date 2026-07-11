import { useDebugValue, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

const objectIs = typeof Object.is === 'function'
  ? Object.is
  : (x, y) => (x === y && (x !== 0 || 1 / x === 1 / y)) || (x !== x && y !== y)

export function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual,
) {
  const instRef = useRef(null)
  if (instRef.current === null) {
    instRef.current = { hasValue: false, value: null }
  }
  const inst = instRef.current

  const memoized = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot
    let memoizedSelection
    const maybeGetServerSnapshot = getServerSnapshot === undefined ? null : getServerSnapshot

    function memoizedSelector(nextSnapshot) {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        nextSnapshot = selector(nextSnapshot)
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value
          if (isEqual(currentSelection, nextSnapshot)) {
            return memoizedSelection = currentSelection
          }
        }
        return memoizedSelection = nextSnapshot
      }

      const currentSelection = memoizedSelection
      if (objectIs(memoizedSnapshot, nextSnapshot)) {
        return currentSelection
      }

      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot
        return currentSelection
      }

      memoizedSnapshot = nextSnapshot
      return memoizedSelection = nextSelection
    }

    return [
      () => memoizedSelector(getSnapshot()),
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot()),
    ]
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(subscribe, memoized[0], memoized[1])

  useEffect(() => {
    inst.hasValue = true
    inst.value = value
  }, [value, inst])

  useDebugValue(value)
  return value
}

export default { useSyncExternalStoreWithSelector }
