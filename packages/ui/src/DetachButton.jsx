import { useLocation } from 'react-router-dom'

export function DetachButton({ label = 'Detach', width = 1000, height = 750 }) {
  const location = useLocation()

  const handleClick = () => {
    const url = `${window.location.origin}/popout${location.pathname}${location.search}`
    window.open(
      url,
      `popout${location.pathname}`,
      `width=${width},height=${height},resizable=yes,scrollbars=yes`,
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Open in a separate window for a second monitor"
      className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition hover:border-cyan-500 hover:text-cyan-200"
    >
      ⤢ {label}
    </button>
  )
}
