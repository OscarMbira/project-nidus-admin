/**
 * SelectField — Admin single-select that auto-switches to SearchableSelect
 * when the option list is long (v209 / monorepo v1064).
 */
import { SearchableSelect } from './SearchableSelect.jsx'
import { inputClass } from './AdminForm.jsx'

export const SEARCHABLE_SELECT_MIN_OPTIONS = 12

export function SelectField({
  options = [],
  value = '',
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  disabled = false,
  forceSearchable = false,
  forceNative = false,
  allowCreate = false,
  emptyMessage = 'No matching options.',
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
}) {
  const list = Array.isArray(options) ? options : []
  const useSearchable =
    !forceNative && (forceSearchable || list.length >= SEARCHABLE_SELECT_MIN_OPTIONS)

  if (useSearchable) {
    return (
      <SearchableSelect
        options={list}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        disabled={disabled}
        allowCreate={allowCreate}
        emptyMessage={emptyMessage}
      />
    )
  }

  return (
    <select
      id={id}
      name={name}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className || inputClass}
    >
      <option value="">{placeholder}</option>
      {list.map((opt, index) => (
        <option key={String(opt.value) || index} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export default SelectField
