/** @deprecated Use fetchActiveCurrencies() + currenciesRowsToOptions() instead */
export const DEPRECATED_STATIC_CURRENCIES_NOTE = 'SUPPORTED_CURRENCIES is deprecated; load from admin.currencies'

export function roundToDecimals(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(Number(value) * factor) / factor
}

export function formatCurrencyDynamic(amount, currencyMeta) {
  if (amount == null || amount === '') return '—'
  const meta = currencyMeta || {}
  const decimals = meta.decimal_places ?? 2
  const symbol = meta.symbol || meta.currency_code || '$'
  const position = meta.symbol_position || 'prefix'
  const formatted = roundToDecimals(Number(amount), decimals).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return position === 'suffix' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

export function currenciesRowsToOptions(rows = []) {
  return (rows || [])
    .filter((row) => row.is_active !== false)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.currency_code).localeCompare(String(b.currency_code)))
    .map((row) => ({
      code: row.currency_code,
      label: `${row.currency_code} (${row.symbol || row.currency_name || row.currency_code})`,
      meta: row,
    }))
}

export function currenciesRowsToMap(rows = []) {
  return Object.fromEntries((rows || []).map((row) => [row.currency_code, row]))
}

export function buildRatesMap(rateRows = []) {
  const map = new Map()
  for (const row of rateRows || []) {
    const key = `${row.from_currency}:${row.to_currency}`
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

export function convertCurrency(amount, from, to, ratesMap, baseCurrency = 'USD', currenciesMap = {}) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return null
  if (!from || !to || from === to) return value

  const direct = ratesMap.get(`${from}:${to}`)
  if (direct?.rate) return roundToDecimals(value * Number(direct.rate), currenciesMap[to]?.decimal_places ?? 2)

  const inverse = ratesMap.get(`${to}:${from}`)
  if (inverse?.rate) return roundToDecimals(value / Number(inverse.rate), currenciesMap[to]?.decimal_places ?? 2)
  if (inverse?.inverse_rate) return roundToDecimals(value * Number(inverse.inverse_rate), currenciesMap[to]?.decimal_places ?? 2)

  const base = baseCurrency || 'USD'
  if (from !== base && to !== base) {
    const toBase = convertCurrency(value, from, base, ratesMap, base, currenciesMap)
    if (toBase == null) return null
    return convertCurrency(toBase, base, to, ratesMap, base, currenciesMap)
  }

  const viaBase = ratesMap.get(`${base}:${to}`) || ratesMap.get(`${from}:${base}`)
  if (from === base && ratesMap.get(`${base}:${to}`)?.rate) {
    return roundToDecimals(value * Number(ratesMap.get(`${base}:${to}`).rate), currenciesMap[to]?.decimal_places ?? 2)
  }
  if (to === base && ratesMap.get(`${from}:${base}`)?.rate) {
    return roundToDecimals(value * Number(ratesMap.get(`${from}:${base}`).rate), currenciesMap[base]?.decimal_places ?? 2)
  }

  return null
}

export function countryCodeToFlag(code) {
  if (!code || String(code).length !== 2) return '🏳️'
  const upper = String(code).toUpperCase()
  return String.fromCodePoint(...upper.split('').map((char) => 127397 + char.charCodeAt(0)))
}

export function formatCurrencyWithMeta(amount, currencyCode, currenciesMap = {}) {
  const meta = currenciesMap[currencyCode]
  if (meta) return formatCurrencyDynamic(amount, meta)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(Number(amount))
}
