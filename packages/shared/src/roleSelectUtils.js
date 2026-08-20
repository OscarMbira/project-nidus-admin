/**
 * Map public.roles rows → SearchableSelect options.
 * value/label use role_display_name so payload.role_title stays human-readable.
 */
export function rolesToSelectOptions(roles = []) {
  return (roles || [])
    .map((r) => {
      const label = String(r.role_display_name || r.role_name || '').trim()
      if (!label) return null
      return {
        value: label,
        label,
        description: r.role_description || r.role_name || '',
      }
    })
    .filter(Boolean)
}
