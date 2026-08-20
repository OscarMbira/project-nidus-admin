const SIZE_CLASSES = {
  default: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'h-full max-h-[calc(100vh-2rem)] max-w-none',
}

export function AdminModal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  size = 'default',
  hideFooter = false,
}) {
  if (!open) return null

  const isFull = size === 'full'
  const panelClass = SIZE_CLASSES[size] || SIZE_CLASSES.default

  return (
    <div
      className={`fixed inset-0 z-50 flex bg-black/50 dark:bg-black/70 p-4 ${
        isFull ? 'items-stretch' : 'items-center justify-center'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div
        className={`flex w-full flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-xl ${panelClass} ${
          isFull ? '' : 'max-h-[calc(100vh-2rem)]'
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
          {children}
        </div>
        {!hideFooter && (
          <div className="mt-4 flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {onConfirm ? cancelLabel : (cancelLabel === 'Cancel' ? 'Close' : cancelLabel)}
            </button>
            {onConfirm && (
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded px-4 py-2 text-sm font-medium text-white ${
                  danger ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-700 hover:bg-blue-600'
                }`}
              >
                {confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
