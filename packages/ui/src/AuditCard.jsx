/**
 * Audit details card — title, optional description, 2-column field grid.
 */
export default function AuditCard({ title, description, children }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  )
}
