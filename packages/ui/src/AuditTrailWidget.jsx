export function AuditTrailWidget({ entries = [] }) {
  if (!entries.length) {
    return <p className="text-sm text-gray-500">No audit entries for this record.</p>
  }
  return (
    <ul className="space-y-2 text-sm">
      {entries.map((e) => (
        <li key={e.id} className="rounded border border-gray-700 bg-gray-900 px-3 py-2">
          <span className="text-gray-400">{new Date(e.created_at).toLocaleString()}</span>
          <span className="mx-2 text-gray-600">·</span>
          <span className="text-gray-200">{e.action}</span>
        </li>
      ))}
    </ul>
  )
}
