// Admin plan v217 (monorepo v1341) — consolidated menu placement services and helpers.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc }) }))
import {
  PLACEMENT_KEY_LABELS,
  fetchSystemConsolidatedMenu,
  groupPlacementsBySection,
  setConsolidatedMenuForAll,
  upsertMenuPlacement,
} from '../menuPlacementServices.js'
import { DEFAULT_NAV_SECTIONS } from '../defaultAdminNav.js'

describe('menuPlacementServices (v217 / v1528)', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: { ok: true }, error: null }))

  it('reads the system-wide single sidebar flag (v1528)', async () => {
    rpc.mockResolvedValueOnce({ data: { enabled: true }, error: null })
    const res = await fetchSystemConsolidatedMenu()
    expect(rpc).toHaveBeenCalledWith('admin_get_system_consolidated_menu', {})
    expect(res.data.enabled).toBe(true)
  })

  it('turns the single sidebar on system-wide with a reason (D30 / v1528)', async () => {
    await setConsolidatedMenuForAll(true, 'Release 1341')
    expect(rpc).toHaveBeenCalledWith('admin_set_consolidated_menu_all', { p_enabled: true, p_reason: 'Release 1341' })
  })

  it('sends a placement with defaults for empty optional fields', async () => {
    await upsertMenuPlacement({ menuItemId: 'm1', placementKey: 'pm', sectionCode: 'home', sortOrder: '5' }, 'Move')
    expect(rpc).toHaveBeenCalledWith('admin_upsert_menu_placement', {
      p_menu_item_id: 'm1', p_placement_key: 'pm', p_section_code: 'home', p_parent_menu_item_id: null, p_slot_key: null,
      p_sort_order: 5, p_scope: 'project', p_is_active: true, p_reason: 'Move',
    })
  })

  it('returns the RPC error text', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'A reason is required' } })
    expect((await setConsolidatedMenuForAll(false, '')).error).toBe('A reason is required')
  })

  it('labels every placement key used by the monorepo CHECK constraint', () => {
    expect(Object.keys(PLACEMENT_KEY_LABELS)).toHaveLength(16) // + support (monorepo v1471)
    expect(PLACEMENT_KEY_LABELS.support).toBe('Project Administrator (Support)')
  })

  it('groups placements by section in sidebar order, footer last', () => {
    const sections = [
      { section_code: 'footer', label: 'Reports & Documents', is_footer: true },
      { section_code: 'home', label: 'Home' },
      { section_code: 'risks_governance', label: 'Risks' },
    ]
    const rows = [
      { section_code: 'footer', sort_order: 1 }, { section_code: 'risks_governance', sort_order: 2 },
      { section_code: 'home', sort_order: 9 }, { section_code: 'home', sort_order: 3 },
    ]
    const groups = groupPlacementsBySection(rows, sections)
    expect(groups.map((g) => g.sectionCode)).toEqual(['home', 'risks_governance', 'footer'])
    expect(groups[0].items.map((r) => r.sort_order)).toEqual([3, 9])
  })
})

describe('Admin nav (v249)', () => {
  it('lists Menu Placements and Menu Sections & Slots under System', () => {
    const paths = JSON.stringify(DEFAULT_NAV_SECTIONS)
    expect(paths).toContain('/system/menu-placements')
    expect(paths).toContain('/system/menu-sections')
  })
})
