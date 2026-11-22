/**
 * Admin date input logic (v1351 parity, Admin rule 24) — a copy of the monorepo's
 * packages/shared/src/utils/regionalDateInput.js (no cross-repo import).
 * Admin has no Regional & Format Settings, so the format is fixed: D MMM YYYY, 24-hour, week starts Monday.
 * Stored values match the browser pickers: 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' for a date and time.
 */
/** Admin's fixed date settings. */
export const ADMIN_DATE_SETTINGS = { date_format: 'D MMM YYYY', time_format: '24h', first_day_of_week: 'monday', locale: 'en-US', time_zone: 'UTC' }
const REGIONAL_FORMAT_DEFAULTS = ADMIN_DATE_SETTINGS

/** A noon-UTC ISO instant in one of the supported date formats (subset of the monorepo's formatRegionalDate). */
function formatRegionalDate(value, s) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const named = String(s.date_format || '').includes('MMM')
  const parts = new Intl.DateTimeFormat(s.locale || 'en-US', { day: named ? 'numeric' : '2-digit', month: named ? 'short' : '2-digit', year: 'numeric', timeZone: 'UTC' }).formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value || ''
  switch (s.date_format) {
    case 'YYYY-MM-DD': return `${get('year')}-${get('month')}-${get('day')}`
    case 'DD/MM/YYYY': return `${get('day')}/${get('month')}/${get('year')}`
    case 'MM/DD/YYYY': return `${get('month')}/${get('day')}/${get('year')}`
    case 'MMM D, YYYY': return `${get('month')} ${get('day')}, ${get('year')}`
    default: return `${get('day')} ${get('month')} ${get('year')}`
  }
}

const pad = (n) => String(n).padStart(2, '0')
const withDefaults = (settings) => ({ ...REGIONAL_FORMAT_DEFAULTS, ...(settings || {}) })

/** Is y-m-d a real calendar date? */
export function isRealDate(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function toIsoDate(y, m, d) {
  return isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null
}

/** 'YYYY-MM-DD' (or the date part of 'YYYY-MM-DDTHH:mm') → { y, m, d } or null. */
export function splitIsoDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''))
  if (!m) return null
  const [y, mo, d] = m.slice(1).map(Number)
  return isRealDate(y, mo, d) ? { y, m: mo, d } : null
}

/** Month comes before day when the organisation's format says so. */
export function monthFirst(settings) {
  const f = withDefaults(settings).date_format
  return f === 'MM/DD/YYYY' || f === 'MMM D, YYYY'
}

/** Stored 'YYYY-MM-DD' → text in the organisation's date format ('' when empty or invalid). */
export function formatDateValue(value, settings) {
  const p = splitIsoDate(value)
  if (!p) return ''
  // Noon UTC, formatted in UTC: a date never shifts to the day before in a western time zone.
  return formatRegionalDate(`${p.y}-${pad(p.m)}-${pad(p.d)}T12:00:00Z`, { ...withDefaults(settings), time_zone: 'UTC' })
}

/** 'HH:mm' → '14:30' or '2:30 PM' per the organisation's time format. */
export function formatTimeValue(hhmm, settings) {
  const m = /^(\d{2}):(\d{2})/.exec(String(hhmm || ''))
  if (!m) return ''
  const h = Number(m[1])
  if (withDefaults(settings).time_format === '12h') return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
  return `${m[1]}:${m[2]}`
}

/** Stored 'YYYY-MM-DDTHH:mm' → '8 Sep 2026 14:30' (organisation's date and time format). */
export function formatDateTimeValue(value, settings) {
  const s = String(value || '')
  const date = formatDateValue(s.slice(0, 10), settings)
  if (!date) return ''
  const time = formatTimeValue(s.slice(11, 16), settings)
  return time ? `${date} ${time}` : date
}

const ENGLISH_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

/** Month names in the display locale (long + short), lower case, index 0–11. */
function localeMonthNames(locale) {
  const out = []
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(Date.UTC(2026, i, 15, 12))
    try {
      out.push([
        new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(d).toLowerCase(),
        new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d).toLowerCase().replace(/\.$/, ''),
      ])
    } catch {
      out.push([])
    }
  }
  return out
}

function monthFromWord(word, locale) {
  const w = word.toLowerCase().replace(/\.$/, '')
  if (w.length < 3) return null
  const local = localeMonthNames(locale)
  for (let i = 0; i < 12; i += 1) {
    if (local[i].some((n) => n && (n === w || n.startsWith(w)))) return i + 1
    if (ENGLISH_MONTHS[i].startsWith(w)) return i + 1
  }
  return null
}

const year4 = (s) => (s.length === 4 ? Number(s) : s.length === 2 ? 2000 + Number(s) : NaN)

function addDays(today, n) {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + n))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/**
 * Typed text → 'YYYY-MM-DD', '' for an empty box, or null when it is not a date.
 * Accepts: the organisation's format, ISO (2026-09-08), numbers in the format's day / month order
 * (8/9/2026, 8-9-26, 8.9.2026), month names in the display locale or English (8 Sep 2026, Sep 8 2026,
 * 8 September 2026), and today / tomorrow / yesterday.
 */
export function parseTypedDate(text, settings, today = new Date()) {
  const s = withDefaults(settings)
  const t = String(text ?? '').trim()
  if (!t) return ''
  const lower = t.toLowerCase()
  if (lower === 'today') return addDays(today, 0)
  if (lower === 'tomorrow') return addDays(today, 1)
  if (lower === 'yesterday') return addDays(today, -1)

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(t)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    const y = year4(m[3])
    return monthFirst(s) ? toIsoDate(y, a, b) : toIsoDate(y, b, a)
  }

  // Words: one month name, a 1–2 digit day and a 2 or 4 digit year, in any order (commas ignored).
  const parts = t.replace(/,/g, ' ').split(/[\s/.\-]+/).filter(Boolean)
  if (parts.length === 3) {
    let month = null
    const nums = []
    for (const p of parts) {
      if (/^\d+$/.test(p)) nums.push(p)
      else if (month == null) month = monthFromWord(p, s.locale)
      else return null
    }
    if (month && nums.length === 2) {
      const yearPart = nums.find((n) => n.length === 4) || nums[1]
      const dayPart = nums.find((n) => n !== yearPart) ?? nums[0]
      if (dayPart.length > 2) return null
      return toIsoDate(year4(yearPart), month, Number(dayPart))
    }
  }
  return null
}

/** Typed time → 'HH:mm' or null. Accepts 14:30, 14.30, 2:30 pm, 2pm, 1430. */
export function parseTypedTime(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!t) return null
  let m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/.exec(t) || /^(\d{1,2})\s*(am|pm)$/.exec(t) || /^(\d{2})(\d{2})$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] && /^\d{2}$/.test(m[2]) ? Number(m[2]) : 0
  const ampm = m.find((x, i) => i > 0 && (x === 'am' || x === 'pm'))
  if (ampm) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (ampm === 'pm' ? 12 : 0)
  }
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/**
 * Typed date and time → 'YYYY-MM-DDTHH:mm', '' when empty, or null. The time is the last part
 * ("8 Sep 2026 14:30", "2026-09-08T14:30", "8/9/2026 2:30 pm", "now").
 */
export function parseTypedDateTime(text, settings, now = new Date()) {
  const t = String(text ?? '').trim()
  if (!t) return ''
  if (t.toLowerCase() === 'now') return `${addDays(now, 0)}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  const iso = /^(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})$/.exec(t)
  if (iso) {
    const time = parseTypedTime(iso[2])
    return splitIsoDate(iso[1]) && time ? `${iso[1]}T${time}` : null
  }
  const m = /^(.*?)[\s,]+(\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?|\d{4})$/i.exec(t)
  if (m) {
    const date = parseTypedDate(m[1], settings, now)
    const time = parseTypedTime(m[2])
    if (date && time) return `${date}T${time}`
  }
  // A date with no time means the start of that day.
  const dateOnly = parseTypedDate(t, settings, now)
  return dateOnly ? `${dateOnly}T00:00` : null
}

/** Is an ISO date within [min, max] (both optional, 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm')? */
export function inRange(value, min, max) {
  if (!value) return true
  if (min && value < String(min).slice(0, value.length)) return false
  if (max && value > String(max).slice(0, value.length)) return false
  return true
}

const DAY_INDEX = { sunday: 0, monday: 1, saturday: 6 }

/** Weekday headings starting on the organisation's first day of week, in the display locale. */
export function weekdayLabels(settings) {
  const s = withDefaults(settings)
  const start = DAY_INDEX[s.first_day_of_week] ?? 1
  const out = []
  for (let i = 0; i < 7; i += 1) {
    const day = (start + i) % 7
    const d = new Date(Date.UTC(2026, 10, 1 + day, 12)) // 1 Nov 2026 is a Sunday
    let short
    try { short = new Intl.DateTimeFormat(s.locale, { weekday: 'short', timeZone: 'UTC' }).format(d) } catch { short = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] }
    out.push({ day, short })
  }
  return out
}

/** "September 2026" in the display locale. */
export function monthTitle(year, month, settings) {
  const s = withDefaults(settings)
  try {
    return new Intl.DateTimeFormat(s.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15, 12)))
  } catch {
    return `${ENGLISH_MONTHS[month - 1]} ${year}`
  }
}

/**
 * The weeks of a month for the calendar: rows of 7 cells { iso, day, inMonth }, starting on the
 * organisation's first day of week, including the leading / trailing days of the next / previous month.
 */
export function calendarWeeks(year, month, settings) {
  const s = withDefaults(settings)
  const start = DAY_INDEX[s.first_day_of_week] ?? 1
  const first = new Date(Date.UTC(year, month - 1, 1))
  const lead = (first.getUTCDay() - start + 7) % 7
  const cursor = new Date(Date.UTC(year, month - 1, 1 - lead))
  const weeks = []
  do {
    const row = []
    for (let i = 0; i < 7; i += 1) {
      row.push({
        iso: `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`,
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month - 1,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(row)
  } while (cursor.getUTCMonth() === month - 1)
  return weeks
}

/** A short hint of what to type, e.g. "e.g. 8 Sep 2026" in the organisation's format. */
export function dateHint(settings, withTime = false) {
  const sample = formatDateValue('2026-09-08', settings)
  return withTime ? `e.g. ${sample} ${formatTimeValue('14:30', settings)}` : `e.g. ${sample}`
}

/** Today as 'YYYY-MM-DD' (local calendar day). */
export function todayIso(now = new Date()) {
  return addDays(now, 0)
}
