/**
 * Map public.risk_categories rows → SearchableSelect options.
 * value = category_code (payload risk_category); label = category_name.
 */
export function riskCategoriesToSelectOptions(categories = []) {
  return (categories || [])
    .map((c) => {
      const code = String(c.category_code || '').trim()
      const name = String(c.category_name || c.category_code || '').trim()
      if (!code && !name) return null
      const value = code || name
      return {
        value,
        label: name || code,
        description: c.category_description || code || '',
      }
    })
    .filter(Boolean)
}
