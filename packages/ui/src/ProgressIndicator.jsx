export function ProgressIndicator({ label, current = 0, total = 0 }) {
  const safeTotal = Math.max(total, 1)
  const pct = Math.min(100, Math.round((current / safeTotal) * 100))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-gray-200">{label}</span>
        <span className="text-gray-400">{current} / {total} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
