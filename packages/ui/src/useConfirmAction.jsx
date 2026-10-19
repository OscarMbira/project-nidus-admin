import { useState } from 'react'
import { AdminModal } from './AdminModal.jsx'

export function useConfirmAction() {
  const [state, setState] = useState(null)

  const confirm = ({
    title,
    message,
    confirmLabel = 'Confirm',
    danger = false,
    requireReason = false,
    reasonLabel = 'Reason (required)',
    onConfirm,
    action,
  }) => {
    setState({
      title,
      message,
      confirmLabel,
      danger,
      requireReason,
      reasonLabel,
      reason: '',
      onConfirm: onConfirm || action,
    })
  }

  const close = () => setState(null)

  const handleConfirm = async () => {
    if (!state?.onConfirm) return
    if (state.requireReason && !state.reason?.trim()) return
    try {
      await state.onConfirm(state.reason?.trim())
      close()
    } catch {
      // Caller shows error toast; keep modal open for retry.
    }
  }

  const modal = state ? (
    <AdminModal
      open
      title={state.title}
      onClose={close}
      onConfirm={handleConfirm}
      confirmLabel={state.confirmLabel}
      danger={state.danger}
    >
      <p>{state.message}</p>
      {state.requireReason && (
        <textarea
          className="mt-3 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          placeholder={state.reasonLabel || 'Reason (required)'}
          rows={3}
          value={state.reason}
          onChange={(e) => setState((s) => ({ ...s, reason: e.target.value }))}
        />
      )}
    </AdminModal>
  ) : null

  return { confirm, modal }
}
