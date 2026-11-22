/**
 * AdminDateInput (v1351 parity, Admin rule 24) — the date / date-and-time field for every Admin form.
 * A copy of the monorepo's @nidus/ui RegionalDateInput (no cross-repo import) with Admin's fixed format:
 * D MMM YYYY, 24-hour, week starting Monday. People type the date (any common form) or pick it from a calendar.
 *
 * Value contract = the native input's: 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' with `withTime`.
 * onChange receives the value; with `eventStyle` it receives { target: { value, name, id, type } } so an existing
 * `onChange={(e) => …e.target.value}` handler works unchanged.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  calendarWeeks, dateHint, formatDateTimeValue, formatDateValue, inRange, monthTitle, parseTypedDate,
  parseTypedDateTime, splitIsoDate, todayIso, weekdayLabels, ADMIN_DATE_SETTINGS,
} from './adminDateInputUtils.js'

const BASE_INPUT =
  'w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// `className` keeps the native input's meaning (the codemod carries it over unchanged): layout classes — width, flex,
// grid span, margins, self-alignment — size the wrapper; the rest style the text box, which fills the wrapper.
const LAYOUT_TOKEN = /^(?:[a-z0-9]+:)*(?:-?m[trblxy]?-|w-|min-w-|max-w-|flex-|basis-|grow|shrink|col-|row-|self-|justify-self-|order-|hidden$|block$|inline-block$|inline$|flex$)/
export function splitClassName(className) {
  const tokens = String(className || '').split(/\s+/).filter(Boolean)
  const wrap = tokens.filter((t) => LAYOUT_TOKEN.test(t))
  const input = tokens.filter((t) => !LAYOUT_TOKEN.test(t))
  return { wrapperClass: wrap.join(' '), inputClass: input.length ? `${input.join(' ')} w-full pr-9` : '' }
}

function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return [d.getUTCFullYear(), d.getUTCMonth() + 1]
}
function addDaysIso(iso, n) {
  const p = splitIsoDate(iso)
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n))
  return d.toISOString().slice(0, 10)
}

export function AdminDateInput({
  value,
  onChange,
  withTime = false,
  eventStyle = false,
  settings: settingsProp = null,
  id,
  name,
  required = false,
  min,
  max,
  disabled = false,
  readOnly = false,
  placeholder,
  className = '',
  inputClassName,
  onBlur,
  onKeyDown,
  ...rest
}) {
  const settings = settingsProp || ADMIN_DATE_SETTINGS
  const autoId = useId()
  const inputId = id || `adi-${autoId}`
  const stored = value == null ? '' : String(value)
  // A stored timestamp ('2026-09-08T00:00:00Z') counts as its date (or date + minute) — no change on blur.
  const storedKey = withTime ? stored.slice(0, 16) : stored.slice(0, 10)
  const { wrapperClass, inputClass } = splitClassName(className)
  const display = useMemo(
    () => (withTime ? formatDateTimeValue(stored, settings) : formatDateValue(stored, settings)),
    [stored, withTime, settings],
  )
  const [text, setText] = useState(display)
  const [editing, setEditing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // A new stored value (or new settings) refreshes the box — but never while the person is typing, and a rejected
  // entry stays visible (flagged) until they fix it.
  useEffect(() => { if (!editing) { setText(display); setInvalid(false) } }, [display]) // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (next) => {
    if (!onChange) return
    if (eventStyle) onChange({ target: { value: next, name, id: inputId, type: withTime ? 'datetime-local' : 'date' } })
    else onChange(next)
  }
  const parse = (t) => (withTime ? parseTypedDateTime(t, settings) : parseTypedDate(t, settings))

  const handleType = (e) => {
    const t = e.target.value
    setText(t)
    setEditing(true)
    const parsed = parse(t)
    if (parsed === '') { setInvalid(false); if (stored !== '') emit(''); return }
    if (parsed && inRange(parsed, min, max)) { setInvalid(false); if (parsed !== storedKey) emit(parsed) }
  }
  const commit = (e) => {
    setEditing(false)
    const parsed = parse(text)
    if (parsed === '') { setInvalid(false); if (stored !== '') emit(''); setText('') }
    else if (parsed && inRange(parsed, min, max)) {
      setInvalid(false)
      if (parsed !== storedKey) emit(parsed)
      setText(withTime ? formatDateTimeValue(parsed, settings) : formatDateValue(parsed, settings))
    } else setInvalid(true)
    if (e?.type === 'blur') onBlur?.(e)
  }

  // Calendar state
  const base = splitIsoDate(stored) || splitIsoDate(todayIso())
  const [view, setView] = useState([base.y, base.m])
  const [focusDay, setFocusDay] = useState(stored.slice(0, 10) || todayIso())
  useEffect(() => {
    if (!open) return undefined
    const b = splitIsoDate(stored) || splitIsoDate(todayIso())
    setView([b.y, b.m])
    setFocusDay(stored.slice(0, 10) || todayIso())
    const onDown = (ev) => { if (wrapRef.current && !wrapRef.current.contains(ev.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (iso) => {
    const time = withTime ? (stored.slice(11, 16) || '00:00') : null
    const next = withTime ? `${iso}T${time}` : iso
    if (!inRange(next, min, max)) return
    setEditing(false)
    setInvalid(false)
    emit(next)
    setOpen(false)
    inputRef.current?.focus()
  }
  const onGridKey = (e) => {
    const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (moves[e.key] != null) {
      e.preventDefault()
      const next = addDaysIso(focusDay, moves[e.key])
      setFocusDay(next)
      const p = splitIsoDate(next)
      setView([p.y, p.m])
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const [y, m] = shiftMonth(view[0], view[1], e.key === 'PageUp' ? -1 : 1)
      setView([y, m])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(focusDay)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.focus()
    }
  }

  const weeks = calendarWeeks(view[0], view[1], settings)
  const heads = weekdayLabels(settings)
  const today = todayIso()
  const selected = stored.slice(0, 10)
  const hint = dateHint(settings, withTime)
  const canEdit = !disabled && !readOnly

  return (
    <div ref={wrapRef} className={`relative ${wrapperClass}`}>
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        id={inputId}
        name={name}
        value={text}
        onChange={handleType}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(e); if (e.key === 'ArrowDown' && e.altKey && canEdit) setOpen(true); onKeyDown?.(e) }}
        placeholder={placeholder || hint}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${inputId}-error` : rest['aria-describedby']}
        className={`${inputClassName || inputClass || BASE_INPUT} ${invalid ? 'border-red-500 dark:border-red-500' : ''}`}
        {...rest}
      />
      {canEdit && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600"
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          aria-expanded={open}
          tabIndex={-1}
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {invalid && (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {min || max ? 'Not a date in the allowed range' : 'Not a date'} — {hint}
        </p>
      )}
      {open && canEdit && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute z-50 mt-1 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setView(shiftMonth(view[0], view[1], -1))} className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{monthTitle(view[0], view[1], settings)}</span>
            <button type="button" onClick={() => setView(shiftMonth(view[0], view[1], 1))} className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" aria-label="Next month">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <table role="grid" tabIndex={0} onKeyDown={onGridKey} className="w-full text-center text-sm focus:outline-none" aria-label={monthTitle(view[0], view[1], settings)}>
            <thead>
              <tr>{heads.map((h) => <th key={h.day} className="pb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{h.short}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((row) => (
                <tr key={row[0].iso}>
                  {row.map((c) => {
                    const isSel = c.iso === selected
                    const isFocus = c.iso === focusDay
                    const allowed = inRange(c.iso, min ? String(min).slice(0, 10) : null, max ? String(max).slice(0, 10) : null)
                    return (
                      <td key={c.iso} className="p-0.5">
                        <button
                          type="button"
                          disabled={!allowed}
                          onClick={() => pick(c.iso)}
                          aria-label={formatDateValue(c.iso, settings)}
                          aria-pressed={isSel}
                          className={[
                            'h-8 w-8 rounded-full text-sm',
                            isSel ? 'bg-blue-600 text-white' : c.inMonth ? 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700' : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
                            c.iso === today && !isSel ? 'ring-1 ring-blue-500' : '',
                            isFocus ? 'outline outline-2 outline-blue-400' : '',
                            !allowed ? 'opacity-40 cursor-not-allowed' : '',
                          ].join(' ')}
                        >
                          {c.day}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-between">
            <button type="button" onClick={() => pick(today)} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">Today</button>
            {!required && (
              <button type="button" onClick={() => { emit(''); setText(''); setOpen(false) }} className="text-sm text-gray-600 hover:underline dark:text-gray-300">Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDateInput
