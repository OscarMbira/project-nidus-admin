// v233 (monorepo v1264) — header settings: contrast, validation, RPC payload.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc: (...a) => rpc(...a) }) }))

import { contrastRatio, validateSiteHeaderSettings, saveSiteHeaderSettings, siteHeaderLabel } from '../publicSiteServices.js'

const ok = { scope_slug: 'platform', bg_color: '#030712', text_color: '#D1D5DB', accent_color: '#2563EB', cta_text_color: '#FFFFFF', cta_label: 'Request a demo', cta_url: '/platform/request-demo' }

describe('contrastRatio', () => {
  it('matches the WCAG reference values used by the database', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBe(21)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1)
    expect(contrastRatio('#FFFFFF', '#16A34A')).toBeLessThan(4.5)
    expect(contrastRatio('nope', '#FFFFFF')).toBeNull()
  })
})

describe('validateSiteHeaderSettings', () => {
  it('accepts the seeded values and a blank address', () => {
    expect(validateSiteHeaderSettings(ok)).toEqual({})
    expect(validateSiteHeaderSettings({ ...ok, cta_url: '' })).toEqual({})
  })
  it('blocks low contrast, bad hex, missing label and bad addresses', () => {
    expect(validateSiteHeaderSettings({ ...ok, text_color: '#1F2937' }).text_color).toMatch(/4.5:1/)
    expect(validateSiteHeaderSettings({ ...ok, accent_color: '#16A34A' }).cta_text_color).toMatch(/4.5:1/)
    expect(validateSiteHeaderSettings({ ...ok, bg_color: 'black' }).bg_color).toBeTruthy()
    expect(validateSiteHeaderSettings({ ...ok, cta_label: ' ' }).cta_label).toBeTruthy()
    expect(validateSiteHeaderSettings({ ...ok, cta_url: 'javascript:alert(1)' }).cta_url).toBeTruthy()
  })
})

describe('saveSiteHeaderSettings', () => {
  beforeEach(() => rpc.mockReset().mockResolvedValue({ data: 'id', error: null }))
  it('sends trimmed values and null for a blank address', async () => {
    await saveSiteHeaderSettings({ ...ok, cta_label: ' Book ', cta_url: ' ' })
    expect(rpc).toHaveBeenCalledWith('admin_upsert_site_header_settings', expect.objectContaining({
      p_scope_slug: 'platform', p_cta_label: 'Book', p_cta_url: null, p_is_active: true,
    }))
  })
})

describe('siteHeaderLabel', () => {
  it('names the brand site and products', () => {
    expect(siteHeaderLabel('brand')).toBe('Brand site')
    expect(siteHeaderLabel('planner', [{ slug: 'planner', name: 'Project Nidus Planner' }])).toBe('Project Nidus Planner')
  })
})
