import { useId, useState } from 'react'

/**
 * Lightweight theme-aware tooltip. Shows on hover and keyboard focus; touch
 * taps fire the wrapped control's own onClick without needing a tooltip step.
 * @param {{ label?: string, children: React.ReactNode, className?: string }} props
 */
export function AdminTooltip({ label, children, className = '' }) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  if (!label) return children

  return (
    <span
      className={`relative inline-flex ${className}`.trim()}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          id={id}
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-xs font-medium shadow-lg bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-900"
        >
          {label}
        </span>
      )}
    </span>
  )
}
