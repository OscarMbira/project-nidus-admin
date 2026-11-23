/** Admin plan v219 (monorepo v1352) — small shared pieces for the Background Jobs pages (theme-aware). */

const TONES = {
  green: 'border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
  red: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300',
  amber: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  blue: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  gray: 'border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300',
}

const STATUS = {
  on: ['On', 'green'],
  off: ['Off', 'gray'],
  succeeded: ['Succeeded', 'green'],
  failed: ['Failed', 'red'],
  partial: ['Partly failed', 'amber'],
  skipped: ['Skipped', 'gray'],
  running: ['Running', 'blue'],
  pending: ['Waiting', 'blue'],
  dead: ['Failed for good', 'red'],
  alert: ['Failure alert', 'red'],
  late: ['Late alert', 'amber'],
}

export function JobStatusPill({ status }) {
  const [label, tone] = STATUS[status] || [status, 'gray']
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {label}
    </span>
  )
}
