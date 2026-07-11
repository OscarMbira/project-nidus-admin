import { ProgressIndicator } from './ProgressIndicator.jsx'

export function BulkActionBar({
  selectedCount = 0,
  actions = [],
  onClearSelection,
  processing = false,
  progressCurrent = 0,
  progressTotal = 0,
}) {
  if (!selectedCount && !processing) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-3xl rounded-xl border border-gray-700 bg-gray-900/95 p-4 shadow-2xl backdrop-blur">
        {processing ? (
          <ProgressIndicator
            label="Processing bulk action..."
            current={progressCurrent}
            total={progressTotal}
          />
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-100">
              {selectedCount} item{selectedCount === 1 ? '' : 's'} selected
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.onClick}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${
                    action.variant === 'danger'
                      ? 'border border-red-700 bg-red-900/40 text-red-200 hover:bg-red-900/60'
                      : 'border border-blue-700 bg-blue-900/40 text-blue-200 hover:bg-blue-900/60'
                  }`}
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onClearSelection}
                className="text-sm text-gray-400 hover:text-gray-200"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
