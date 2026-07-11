const STATUS_STYLES = {
  active: 'bg-green-900/50 text-green-300 border-green-700',
  success: 'bg-green-900/50 text-green-300 border-green-700',
  failed: 'bg-red-900/50 text-red-300 border-red-700',
  pending: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  retrying: 'bg-orange-900/50 text-orange-300 border-orange-700',
  refunded: 'bg-purple-900/50 text-purple-300 border-purple-700',
  pending_activation: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  suspended: 'bg-red-900/50 text-red-300 border-red-700',
  unauthorised: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',
  live: 'bg-green-900/50 text-green-300 border-green-700',
  history: 'bg-orange-900/50 text-orange-300 border-orange-700',
  archived: 'bg-slate-800/80 text-slate-300 border-slate-600',
  rejected: 'bg-red-900/50 text-red-400 border-red-800',
  super_admin: 'bg-purple-900/50 text-purple-300 border-purple-700',
  system_admin: 'bg-blue-900/50 text-blue-300 border-blue-700',
  support_admin: 'bg-cyan-900/50 text-cyan-300 border-cyan-700',
  content_admin: 'bg-teal-900/50 text-teal-300 border-teal-700',
}

export function AdminBadge({ label, variant = 'active' }) {
  const style = STATUS_STYLES[variant] || 'bg-gray-800 text-gray-300 border-gray-600'
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}
