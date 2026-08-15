import { Link } from 'react-router-dom'

/**
 * Pass `onClick` (same-page filter-and-switch) or `to` (cross-page route) to make a count/sum
 * card navigate to its underlying filtered list. Omit both for calculated cards (averages,
 * percentages, blended metrics) that have no single coherent list of records behind them —
 * see CLAUDE.md rule 17.
 */
export function AdminCard({ title, value, trend, className = '', children, onClick, to }) {
  const interactive = Boolean(onClick || to)
  const baseClassName = `rounded-lg border border-gray-700 bg-gray-900 p-4 text-left w-full ${
    interactive ? 'cursor-pointer transition-colors hover:border-blue-500 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900' : ''
  } ${className}`

  const content = (
    <>
      {title && <p className="text-xs uppercase tracking-wide text-gray-500">{title}</p>}
      {children ? (
        <div className={title ? 'mt-4' : ''}>{children}</div>
      ) : (
        <>
          <p className="mt-2 text-2xl font-semibold text-gray-100">{value ?? '—'}</p>
          {trend && <p className="mt-1 text-xs text-gray-400">{trend}</p>}
        </>
      )}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={baseClassName} onClick={onClick}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={baseClassName}>
        {content}
      </button>
    )
  }

  return <div className={baseClassName}>{content}</div>
}
