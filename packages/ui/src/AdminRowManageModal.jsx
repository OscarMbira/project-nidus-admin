import { AdminModal } from './AdminModal.jsx'
import { AdminActionButton } from './AdminActionButton.jsx'

export function AdminRowManageModal({
  open,
  title,
  subtitle,
  onClose,
  actions = [],
}) {
  const visibleActions = actions.filter((action) => !action.hidden)

  return (
    <AdminModal open={open} title={title} onClose={onClose}>
      {subtitle ? <p className="mb-3 text-sm text-gray-400">{subtitle}</p> : null}
      <div className="flex flex-col gap-2">
        {visibleActions.map((action) => (
          <AdminActionButton
            key={action.key}
            variant={action.variant || 'default'}
            disabled={action.disabled}
            className="w-full px-3 py-2 text-left"
            onClick={() => {
              onClose?.()
              action.onClick?.()
            }}
          >
            {action.label}
          </AdminActionButton>
        ))}
      </div>
    </AdminModal>
  )
}
