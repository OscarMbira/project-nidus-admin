const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'
const MAX_KEYSPACE = 9223372036854775807n

function effectivePoolSize(pool, excluded) {
  const exc = excluded || ''
  return pool.split('').filter((c) => !exc.includes(c)).length
}

function binomial(n, k) {
  if (k < 0 || n < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let result = 1
  for (let i = 1; i <= kk; i += 1) {
    result = (result * (n - kk + i)) / i
  }
  return result
}

function powBigInt(base, exponent) {
  let result = 1n
  for (let i = 0; i < exponent; i += 1) {
    result *= base
    if (result >= MAX_KEYSPACE) return MAX_KEYSPACE
  }
  return result
}

export function computeKeyspaceSize(form) {
  const segmentType = form.segment_type || 'alphanumeric'
  const numLetters = Math.max(0, Number(form.num_letters) || 0)
  const numDigits = Math.max(0, Number(form.num_digits) || 0)
  const letterCase = form.letter_case || 'uppercase'
  const excluded = form.excluded_chars || ''

  const letterPool = effectivePoolSize(UPPER, excluded)
  const digitPool = effectivePoolSize(DIGITS, excluded)

  let perLetter = BigInt(letterPool)
  if (letterCase === 'mixed') perLetter = BigInt(letterPool * 2)

  let size = 1n

  if (segmentType === 'alpha' || segmentType === 'alphanumeric') {
    if (perLetter <= 0n && numLetters > 0) return 0n
    size = powBigInt(perLetter, numLetters)
  }

  if (segmentType === 'numeric' || segmentType === 'alphanumeric') {
    if (digitPool <= 0 && numDigits > 0) return 0n
    const digitFactor = powBigInt(BigInt(digitPool), numDigits)
    size *= digitFactor
    if (size >= MAX_KEYSPACE) return MAX_KEYSPACE
  }

  if (segmentType === 'alphanumeric' && numLetters > 0 && numDigits > 0) {
    size *= BigInt(binomial(numLetters + numDigits, numLetters))
    if (size >= MAX_KEYSPACE) return MAX_KEYSPACE
  }

  return size
}

export function formatKeyspaceSize(value) {
  let size = typeof value === 'bigint' ? value : BigInt(String(value ?? 0))
  if (size < 0n) size = 0n

  if (size >= 1_000_000_000n) {
    const whole = size / 1_000_000_000n
    const frac = (size % 1_000_000_000n) / 100_000_000n
    return frac > 0n ? `~${whole}.${frac}B` : `~${whole}B`
  }
  if (size >= 1_000_000n) {
    const whole = size / 1_000_000n
    const frac = (size % 1_000_000n) / 100_000n
    return frac > 0n ? `~${whole}.${frac}M` : `~${whole}M`
  }
  if (size >= 1_000n) {
    const whole = size / 1_000n
    const frac = (size % 1_000n) / 100n
    return frac > 0n ? `~${whole}.${frac}K` : `~${whole}K`
  }
  return `~${size.toLocaleString()}`
}

function pickChar(pool, excluded) {
  const filtered = excluded
    ? pool.split('').filter((c) => !excluded.includes(c))
    : pool.split('')
  const source = filtered.length ? filtered : pool.split('')
  return source[Math.floor(Math.random() * source.length)]
}

function buildSampleCode(numLetters, numDigits, letterCase, excluded, segmentType = 'alphanumeric') {
  const type = segmentType || 'alphanumeric'
  const letters = []
  const digits = []

  if (type !== 'numeric') {
    for (let i = 0; i < numLetters; i += 1) {
      let letter = pickChar(UPPER, excluded)
      if (letterCase === 'lowercase') letter = letter.toLowerCase()
      else if (letterCase === 'mixed' && Math.random() < 0.5) letter = letter.toLowerCase()
      letters.push(letter)
    }
  }

  if (type !== 'alpha') {
    for (let i = 0; i < numDigits; i += 1) {
      digits.push(pickChar(DIGITS, excluded))
    }
  }

  if (type === 'alphanumeric') {
    const chars = [...letters, ...digits]
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    return chars.join('')
  }

  return [...letters, ...digits].join('')
}

export function formatPreviewPattern(form) {
  const type = form.segment_type || 'alphanumeric'
  const letters = Math.max(0, Number(form.num_letters) || 0)
  const digits = Math.max(0, Number(form.num_digits) || 0)
  if (type === 'numeric') return `[D${digits}]`
  if (type === 'alpha') return `[L${letters}]`
  return `[L${letters}D${digits}]`
}

export function buildIdPreview(form) {
  const abbrev = String(form.table_abbreviation || 'ABC').toUpperCase().slice(0, 4) || 'ABC'
  const separator = form.separator ?? '-'
  const suffix = form.suffix || ''
  const segmentType = form.segment_type || 'alphanumeric'
  const letters = Math.min(10, Math.max(0, Number(form.num_letters) || 0))
  const digits = Math.min(10, Math.max(0, Number(form.num_digits) || 0))
  const letterCase = form.letter_case || 'uppercase'
  const excluded = form.excluded_chars || ''
  const length = segmentType === 'numeric' ? digits : segmentType === 'alpha' ? letters : letters + digits
  const code = length > 0
    ? buildSampleCode(letters, digits, letterCase, excluded, segmentType)
    : 'X'
  return `${abbrev}${separator}${code}${suffix}`
}

export function isDefaultRule(rule) {
  return !rule.created_by && String(rule.table_description || '').includes('Auto-generated default')
}
