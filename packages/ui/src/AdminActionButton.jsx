const VARIANT_CLASS = {
  default: 'border-gray-600 bg-gray-800/60 text-gray-200 hover:bg-gray-800',
  primary: 'border-blue-700 bg-blue-900/40 text-blue-200 hover:bg-blue-900/70',
  cyan: 'border-cyan-700 bg-cyan-900/30 text-cyan-200 hover:bg-cyan-900/60',
  success: 'border-emerald-700 bg-emerald-900/30 text-emerald-200 hover:bg-emerald-900/60',
  warning: 'border-amber-700 bg-amber-900/30 text-amber-200 hover:bg-amber-900/60',
  danger: 'border-red-700 bg-red-900/30 text-red-200 hover:bg-red-900/60',
}

export function AdminActionButton({
  variant = 'default',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASS[variant] || VARIANT_CLASS.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
