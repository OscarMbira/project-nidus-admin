// v211 (monorepo v1239 Slice 8.4) — edition filter on the Organisations list.
import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase.js', () => ({ getPublicDb: () => null }))
import { filterByEdition, EDITION_LABELS } from '../plannerEditionServices.js'

const rows = [
  { id: 'a', product_edition: 'platform' },
  { id: 'b', product_edition: 'planner' },
  { id: 'c' }, // accounts created before v1247 have no value yet: they are Full PMIS
]

describe('filterByEdition', () => {
  it('returns everything for "all"', () => {
    expect(filterByEdition(rows, 'all')).toHaveLength(3)
  })
  it('treats a missing edition as Full PMIS', () => {
    expect(filterByEdition(rows, 'platform').map((r) => r.id)).toEqual(['a', 'c'])
    expect(filterByEdition(rows, 'planner').map((r) => r.id)).toEqual(['b'])
  })
  it('labels both editions', () => {
    expect(EDITION_LABELS).toEqual({ platform: 'Full PMIS', planner: 'Project Planner' })
  })
})
