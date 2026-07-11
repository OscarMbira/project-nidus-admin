import { AdminModal } from './AdminModal.jsx'

export function BulkConfirmModal({
  open,
  title,
  message,
  items = [],
  itemLabel = (item) => item.label || item.name || item.email || item.id,
  confirmLabel = 'Confirm',
  danger = false,
  requireReason = false,
  reason = '',
  onReasonChange,
  onConfirm,
  onClose,
  processing = false,
}) {
  if (!open) return null

  return (
    <AdminModal
      open
      title={title}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      danger={danger}
      confirmDisabled={processing || (requireReason && !reason?.trim())}
    >
      <p className="text-sm text-gray-300">{message}</p>
      {items.length > 0 && (
        <div className="mt-3 max-h-48 overflow-y-auto rounded border border-gray-700 bg-gray-950/60 p-3">
          <ul className="space-y-1 text-sm text-gray-300">
            {items.slice(0, 50).map((item) => (
              <li key={item.id || itemLabel(item)} className="truncate">{itemLabel(item)}</li>
            ))}
            {items.length > 50 && (
              <li className="text-xs text-gray-500">…and {items.length - 50} more</li>
            )}
          </ul>
        </div>
      )}
      {requireReason && (
        <textarea
          className="mt-3 w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
          placeholder="Reason (required)"
          rows={3}
          value={reason}
          onChange={(e) => onReasonChange?.(e.target.value)}
        />
      )}
    </AdminModal>
  )
}
