/**
 * Single labelled audit value (definition list item). Empty → em dash.
 */
export default function AuditField({ label, value }) {
  const display = value == null || value === '' ? '—' : value
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">{display}</dd>
    </div>
  )
}
