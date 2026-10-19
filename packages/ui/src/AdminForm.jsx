export function AdminForm({ children, onSubmit, className = '', id }) {
  return (
    <form id={id} onSubmit={onSubmit} className={`space-y-4 ${className}`} noValidate>
      {children}
    </form>
  )
}

export function AdminField({ label, error, children, required }) {
  const testId = label
    ? `field-${String(label).toLowerCase().replace(/\s+/g, '-')}`
    : undefined
  return (
    <div data-testid={testId}>
      <label className="mb-1 block text-sm text-gray-700 dark:text-gray-300">
        {label}{required && <span className="text-red-600 dark:text-red-400"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export const inputClass = 'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none'
