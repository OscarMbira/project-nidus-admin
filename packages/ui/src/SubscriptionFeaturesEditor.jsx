import { inputClass } from './AdminForm.jsx'
import { SearchableSelect } from './SearchableSelect.jsx'

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
      <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.735.011-1.47.042-2.203.094a.75.75 0 00-.584.786 17.237 17.237 0 002.853 10.665.75.75 0 001.043.174 18.345 18.345 0 009.305-6.368.75.75 0 00.174-1.043 17.236 17.236 0 00-10.665-2.853.75.75 0 00-.786.584 12.01 12.01 0 01-.094 2.203V3.75A2.75 2.75 0 0011.25 1h-2.5zM4.5 4.643c.712-.006 1.425-.028 2.136-.063a.75.75 0 00.787-.584 5.5 5.5 0 011.1-2.19.75.75 0 01.823-.334h2.908a.75.75 0 01.823.334 5.5 5.5 0 011.1 2.19.75.75 0 00.787.584c.711.035 1.424.057 2.136.063v9.214a2.25 2.25 0 01-2.25 2.25h-6.5A2.25 2.25 0 014.5 13.857V4.643z" clipRule="evenodd" />
    </svg>
  )
}

export function SubscriptionFeaturesEditor({
  value = [''],
  onChange,
  options = [],
  disabled = false,
  addLabel = '+ Add feature',
  loading = false,
  hint = null,
}) {
  const rows = value.length > 0 ? value : ['']
  const selectedValues = rows.map((feature) => String(feature ?? '').trim()).filter(Boolean)

  const updateRow = (index, nextValue) => {
    const next = [...rows]
    next[index] = nextValue
    onChange(next)
  }

  const removeRow = (index) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index)
    onChange(next.length > 0 ? next : [''])
  }

  const addRow = () => {
    onChange([...rows, ''])
  }

  const canAddAnother = selectedValues.length < options.length || options.length === 0

  if (loading) {
    return <p className="text-sm text-gray-500">Loading feature catalog...</p>
  }

  if (options.length === 0) {
    return (
      <div className="space-y-3">
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
        {rows.map((feature, index) => (
          <div key={`feature-${index}`} className="space-y-1">
            <label className="text-xs font-medium text-gray-400">Feature {index + 1}</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                className={inputClass}
                value={feature}
                disabled={disabled}
                placeholder="Enter feature label"
                onChange={(event) => updateRow(index, event.target.value)}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeRow(index)}
                className="shrink-0 rounded p-2 text-rose-400 transition hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-40"
                aria-label={`Remove feature ${index + 1}`}
                title="Remove feature"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
        >
          {addLabel}
        </button>
        <p className="text-xs text-gray-500">Plan catalog unavailable — run subscription_plans seed (v38/v43) or add rows in Pricing Plans.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((feature, index) => (
          <div key={`feature-${index}`} className="space-y-1">
            <label className="text-xs font-medium text-gray-400">Feature {index + 1}</label>
            <div className="flex items-start gap-2">
              <SearchableSelect
                value={feature}
                onChange={(nextValue) => updateRow(index, nextValue)}
                options={options}
                disabled={disabled}
                excludeValues={selectedValues.filter((_, rowIndex) => rowIndex !== index)}
                placeholder="Select feature..."
                searchPlaceholder="Search features..."
                emptyMessage="No matching features. Try another search term."
                groupByCategory
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeRow(index)}
                className="mt-0.5 shrink-0 rounded p-2 text-rose-400 transition hover:bg-rose-950/40 hover:text-rose-300 disabled:opacity-40"
                aria-label={`Remove feature ${index + 1}`}
                title="Remove feature"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
      {canAddAnother && (
        <button
          type="button"
          disabled={disabled}
          onClick={addRow}
          className="text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-40"
        >
          {addLabel}
        </button>
      )}
    </div>
  )
}

export function SubscriptionFeaturesList({ features = [], emptyLabel = 'No features configured.' }) {
  if (!features.length) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>
  }

  return (
    <ul className="space-y-2 text-sm text-gray-200">
      {features.map((feature, index) => (
        <li key={`${feature}-${index}`} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  )
}
