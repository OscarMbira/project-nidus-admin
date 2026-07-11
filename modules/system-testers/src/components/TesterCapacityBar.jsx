import { Link } from 'react-router-dom'
import { capacityBarVariant } from '@nidus-admin/shared'

const barColors = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
}

const textColors = {
  green: 'text-emerald-400',
  yellow: 'text-amber-400',
  red: 'text-red-400',
}

export default function TesterCapacityBar({ activeCount = 0, maxTesters = 100, className = '' }) {
  const variant = capacityBarVariant(activeCount, maxTesters)
  const pct = maxTesters ? Math.min(100, Math.round((activeCount / maxTesters) * 100)) : 0
  const atLimit = activeCount >= maxTesters

  return (
    <div className={`rounded-lg border border-gray-700 bg-gray-900 p-4 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-300">
          <span className={`font-semibold ${textColors[variant]}`}>{activeCount}</span>
          {' / '}
          {maxTesters}
          {' active testers'}
        </p>
        <Link
          to="/system/settings?category=testers"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Adjust limit in System Settings
        </Link>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full transition-all ${barColors[variant]}`} style={{ width: `${pct}%` }} />
      </div>
      {atLimit && (
        <p className="mt-2 text-xs text-red-400">
          Tester limit reached — increase testers.max_active_testers in System Settings to approve more.
        </p>
      )}
    </div>
  )
}
