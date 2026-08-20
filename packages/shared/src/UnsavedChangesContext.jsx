import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { AdminModal } from '@nidus-admin/ui'
import { aggregateDirtyState, evaluateLinkClickForGuard } from './unsavedChangesUtils.js'

const UnsavedChangesContext = createContext(null)

const DEFAULT_MESSAGE = 'You have unsaved changes. Discard them and leave this page?'

function confirmDiscardFallback(isDirty, message, onProceed) {
  if (!isDirty) {
    onProceed?.()
    return true
  }
  if (window.confirm(message || DEFAULT_MESSAGE)) {
    onProceed?.()
    return true
  }
  return false
}

function requestNavigationFallback(isDirty, message, navigate, to, options) {
  if (!isDirty || window.confirm(message || DEFAULT_MESSAGE)) {
    navigate(to, options)
  }
}

export function UnsavedChangesProvider({ children }) {
  const navigate = useNavigate()
  const [guards, setGuards] = useState(() => new Map())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const pendingActionRef = useRef(null)
  const bypassRef = useRef(false)
  const historyTrapRef = useRef(false)

  const { isDirty, message } = useMemo(
    () => aggregateDirtyState(guards.values()),
    [guards],
  )

  const registerGuard = useCallback((id, isDirtyFlag, guardMessage) => {
    setGuards((prev) => {
      const next = new Map(prev)
      next.set(id, { isDirty: !!isDirtyFlag, message: guardMessage || null })
      return next
    })
  }, [])

  const unregisterGuard = useCallback((id) => {
    setGuards((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const openConfirm = useCallback((action) => {
    pendingActionRef.current = action
    setConfirmOpen(true)
  }, [])

  const runPendingAction = useCallback(() => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    bypassRef.current = true
    try {
      if (!action) return
      if (action.type === 'navigate') {
        navigate(action.to, action.options)
      } else if (action.type === 'back') {
        window.history.back()
      } else if (action.type === 'callback') {
        action.fn?.()
      }
    } finally {
      window.setTimeout(() => {
        bypassRef.current = false
      }, 0)
    }
  }, [navigate])

  const requestNavigation = useCallback((to, options) => {
    if (!isDirty || bypassRef.current) {
      navigate(to, options)
      return
    }
    openConfirm({ type: 'navigate', to, options })
  }, [isDirty, navigate, openConfirm])

  const confirmDiscard = useCallback((onProceed) => {
    if (!isDirty || bypassRef.current) {
      onProceed?.()
      return
    }
    openConfirm({ type: 'callback', fn: onProceed })
  }, [isDirty, openConfirm])

  const handleKeepEditing = useCallback(() => {
    pendingActionRef.current = null
    setConfirmOpen(false)
  }, [])

  const handleDiscard = useCallback(() => {
    setConfirmOpen(false)
    runPendingAction()
  }, [runPendingAction])

  useEffect(() => {
    if (!isDirty) return undefined

    const onBeforeUnload = (event) => {
      if (bypassRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!isDirty) {
      historyTrapRef.current = false
      return undefined
    }

    if (!historyTrapRef.current) {
      window.history.pushState({ nidusUnsavedGuard: true }, '', window.location.href)
      historyTrapRef.current = true
    }

    const onPopState = () => {
      if (bypassRef.current || !isDirty) return
      window.history.pushState({ nidusUnsavedGuard: true }, '', window.location.href)
      openConfirm({ type: 'back' })
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isDirty, openConfirm])

  useEffect(() => {
    if (!isDirty) return undefined

    const onDocumentClick = (event) => {
      if (bypassRef.current) return
      const { intercept, targetPath } = evaluateLinkClickForGuard(event)
      if (!intercept || !targetPath) return
      event.preventDefault()
      event.stopPropagation()
      openConfirm({ type: 'navigate', to: targetPath })
    }

    document.addEventListener('click', onDocumentClick, true)
    return () => document.removeEventListener('click', onDocumentClick, true)
  }, [isDirty, openConfirm])

  const contextValue = useMemo(
    () => ({
      isDirty,
      registerGuard,
      unregisterGuard,
      requestNavigation,
      confirmDiscard,
    }),
    [isDirty, registerGuard, unregisterGuard, requestNavigation, confirmDiscard],
  )

  return (
    <UnsavedChangesContext.Provider value={contextValue}>
      {children}
      <AdminModal
        open={confirmOpen}
        title="Unsaved changes"
        onClose={handleKeepEditing}
        onConfirm={handleDiscard}
        confirmLabel="Discard changes"
        danger
      >
        <p>{message || DEFAULT_MESSAGE}</p>
      </AdminModal>
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChangesContext() {
  const ctx = useContext(UnsavedChangesContext)
  if (!ctx) {
    throw new Error('useUnsavedChangesContext must be used within UnsavedChangesProvider')
  }
  return ctx
}

/**
 * Register a form/page dirty state with the global unsaved-changes guard.
 * When the provider is unavailable (e.g. federated remote using a separate shared bundle),
 * falls back to confirm + navigate — same pattern as useToast().
 * @param {boolean} isDirty
 * @param {string} [message]
 */
export function useUnsavedChangesGuard(isDirty, message) {
  const ctx = useContext(UnsavedChangesContext)
  const navigate = useNavigate()
  const id = useId()

  useEffect(() => {
    if (!ctx) return undefined
    ctx.registerGuard(id, isDirty, message)
    return () => ctx.unregisterGuard(id)
  }, [ctx, id, isDirty, message])

  useEffect(() => {
    if (ctx || !isDirty) return undefined

    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ctx, isDirty])

  const requestNavigation = useCallback((to, options) => {
    if (ctx) {
      ctx.requestNavigation(to, options)
      return
    }
    requestNavigationFallback(isDirty, message, navigate, to, options)
  }, [ctx, isDirty, message, navigate])

  const confirmDiscard = useCallback((onProceed) => {
    if (ctx) {
      ctx.confirmDiscard(onProceed)
      return
    }
    confirmDiscardFallback(isDirty, message, onProceed)
  }, [ctx, isDirty, message])

  return { requestNavigation, confirmDiscard }
}
