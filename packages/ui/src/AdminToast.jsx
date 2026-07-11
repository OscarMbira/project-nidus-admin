import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const ToastContext = createContext(null)
const TOAST_EVENT = 'nidus-admin-toast'

let toastId = 0

function emitToast(message, type = 'success') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }))
}

/** Stable when ToastProvider context is unavailable (e.g. federated remotes). */
const FALLBACK_TOAST = {
  showSuccess: (msg) => emitToast(msg, 'success'),
  showError: (msg) => emitToast(msg, 'error'),
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((message, type = 'success') => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const showSuccess = useCallback((message) => show(message, 'success'), [show])
  const showError = useCallback((message) => show(message, 'error'), [show])

  useEffect(() => {
    const handler = (event) => {
      const { message, type } = event.detail || {}
      if (message) show(message, type || 'success')
    }
    window.addEventListener(TOAST_EVENT, handler)
    return () => window.removeEventListener(TOAST_EVENT, handler)
  }, [show])

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.type === 'error'
                ? 'border-red-700 bg-red-900/90 text-red-100'
                : 'border-green-700 bg-green-900/90 text-green-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  return ctx || FALLBACK_TOAST
}
