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
  danger,
  size = 'default',
  hideFooter = false,
}) {
  if (!open) return null

  const isFull = size === 'full'
  const panelClass = SIZE_CLASSES[size] || SIZE_CLASSES.default

  return (
    <div className={`fixed inset-0 z-50 flex bg-black/70 p-4 ${isFull ? 'items-stretch' : 'items-center justify-center'}`}>
      <div className={`flex w-full flex-col rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-xl ${panelClass} ${isFull ? 'overflow-hidden' : ''}`}>
        <h2 className="shrink-0 text-lg font-semibold text-gray-100">{title}</h2>
        <div className={`mt-4 min-h-0 flex-1 text-sm text-gray-300 ${isFull ? 'overflow-y-auto' : ''}`}>{children}</div>
        {!hideFooter && (
          <div className="mt-6 flex shrink-0 justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancel</button>
            {onConfirm && (
              <button type="button" onClick={onConfirm} className={`rounded px-4 py-2 text-sm font-medium ${danger ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-700 hover:bg-blue-600'} text-white`}>
                {confirmLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
