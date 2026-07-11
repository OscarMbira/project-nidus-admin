export function AdminCard({ title, value, trend, className = '', children }) {
  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-900 p-4 ${className}`}>
      {title && <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>}
      {children ? (
        <div className={title ? 'mt-4' : ''}>{children}</div>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-gray-100">{value ?? '—'}</p>
          {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
        </>
      )}
    </div>
  )
}
