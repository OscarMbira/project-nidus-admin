export function SearchBar({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none ${className || 'max-w-sm'}`}
    />
  )
}

export function ViewToggle({ view, onChange }) {
  return (
    <div className="inline-flex rounded border border-gray-600">
      <button type="button" onClick={() => onChange('card')} className={`px-3 py-1.5 text-sm ${view === 'card' ? 'bg-gray-700 text-white' : 'text-gray-400'}`} title="Card view">⊞</button>
      <button type="button" onClick={() => onChange('table')} className={`px-3 py-1.5 text-sm ${view === 'table' ? 'bg-gray-700 text-white' : 'text-gray-400'}`} title="Table view">≡</button>
    </div>
  )
}

export function RowNumberBadge({ number }) {
  return <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300">#{number}</span>
}
