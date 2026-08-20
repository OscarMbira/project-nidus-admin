/**
 * Audit details body: heading + card grid. Never include Technical reference cards.
 * @param {{ title?: string, description?: string, children: import('react').ReactNode, footer?: import('react').ReactNode }} props
 */
export default function AuditDetailsPanel({
  title = 'Audit details',
  description = 'Who created or changed this record, and how it is classified.',
  children,
  footer = null,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
      {footer}
    </div>
  )
}
