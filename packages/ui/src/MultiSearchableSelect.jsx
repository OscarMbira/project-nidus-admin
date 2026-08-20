import { SearchableSelect } from './SearchableSelect.jsx'
import { appendUniqueMultiValue, removeMultiValue } from './searchableSelectUtils.js'

/**
 * Multi-value searchable select: chips + SearchableSelect (allowCreate).
 * Theme-aware; composes SearchableSelect rather than duplicating portal logic.
 */
export function MultiSearchableSelect({
  values = [],
  onChange,
  options = [],
  placeholder = 'Add…',
  disabled = false,
  allowCreate = true,
  emptyMessage = 'No matching options.',
}) {
  const selected = Array.isArray(values) ? values.map((v) => String(v).trim()).filter(Boolean) : []

  const selectOptions = options.length
    ? options
    : selected.map((v) => ({ value: v, label: v }))

  const removeValue = (value) => {
    onChange(removeMultiValue(selected, value))
  }

  const addValue = (value) => {
    onChange(appendUniqueMultiValue(selected, value))
  }

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-800 dark:text-gray-200"
            >
              {value}
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeValue(value)}
                className="text-gray-500 hover:text-red-500 disabled:opacity-40"
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <SearchableSelect
        value=""
        onChange={addValue}
        options={selectOptions}
        excludeValues={selected}
        placeholder={placeholder}
        disabled={disabled}
        allowCreate={allowCreate}
        emptyMessage={emptyMessage}
        searchPlaceholder="Search or type new…"
      />
    </div>
  )
}
