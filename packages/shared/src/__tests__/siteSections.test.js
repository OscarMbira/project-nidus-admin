import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const upload = vi.fn()
vi.mock('../supabase.js', () => ({
  getPublicDb: () => ({ rpc: (...a) => rpc(...a) }),
  getAdminStorageClient: () => ({
    storage: { from: () => ({ upload: (...a) => upload(...a), getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) }) },
  }),
}))

import {
  SITE_SECTION_TYPES,
  SITE_SECTION_ITEM_FIELDS,
  SITE_SECTION_FIELDS,
  effectiveSiteSection,
  siteSectionStatus,
  validateSiteSection,
  siteSectionChanges,
  sitePreviewUrl,
  saveSiteSectionDraft,
  addSiteSection,
  reorderSiteSections,
  publishSiteSections,
  uploadSiteAsset,
} from '../publicSiteServices.js'

describe('section types', () => {
  it('match the 11 monorepo types, each with item and editor fields', () => {
    expect(SITE_SECTION_TYPES).toHaveLength(11)
    for (const t of SITE_SECTION_TYPES) {
      expect(SITE_SECTION_ITEM_FIELDS[t.value]).toBeDefined()
      expect(SITE_SECTION_FIELDS[t.value]).toBeDefined()
    }
  })
})

describe('drafts and status', () => {
  it('applies the draft over the published columns', () => {
    const e = effectiveSiteSection({ heading: 'Old', is_active: false, draft: { heading: 'New', is_active: true } })
    expect(e.heading).toBe('New')
    expect(e.is_active).toBe(true)
  })

  it('reports new, draft and published', () => {
    expect(siteSectionStatus({ published_at: null, draft: { heading: 'x' } })).toBe('new')
    expect(siteSectionStatus({ published_at: '2026-10-12', draft: { heading: 'x' } })).toBe('draft')
    expect(siteSectionStatus({ published_at: '2026-10-12', draft: null })).toBe('published')
  })

  it('sends only changed fields', () => {
    const before = { heading: 'A', items: [{ title: 'x' }], primary_cta: null }
    expect(siteSectionChanges(before, { heading: 'A', items: [{ title: 'x' }], primary_cta: null })).toEqual({})
    expect(siteSectionChanges(before, { heading: 'B', items: [{ title: 'x' }, { title: 'y' }] })).toEqual({ heading: 'B', items: [{ title: 'x' }, { title: 'y' }] })
  })
})

describe('validateSiteSection', () => {
  it('accepts a valid hero and FAQ', () => {
    expect(validateSiteSection('hero', { heading: 'H', primary_cta: { label: 'Go', href: '#get-started' } })).toEqual({})
    expect(validateSiteSection('faq', { heading: 'Q', items: [{ title: 'Q1', text: 'A1' }] })).toEqual({})
  })

  it('flags missing heading, bad links, missing alt text and incomplete items', () => {
    expect(validateSiteSection('feature_grid', {}).heading).toBeTruthy()
    expect(validateSiteSection('hero', { heading: 'H', secondary_cta: { label: 'Demo', href: 'contact' } }).secondary_cta).toBeTruthy()
    expect(validateSiteSection('hero', { heading: 'H', image_url: 'https://x/y.png' }).image_alt).toBeTruthy()
    expect(validateSiteSection('faq', { heading: 'Q', items: [{ title: 'Q1' }] })['items.0']).toMatch(/answer/)
    expect(validateSiteSection('audience_links', { heading: 'S', items: [{ title: 'PMO', href: 'pmo' }] })['items.0']).toMatch(/link/)
  })
})

describe('service calls', () => {
  beforeEach(() => { rpc.mockReset(); upload.mockReset() })

  it('uses the v231 RPCs and never sends an admin id', async () => {
    rpc.mockResolvedValue({ data: 'ok', error: null })
    await saveSiteSectionDraft('s1', { heading: 'H' })
    await addSiteSection({ page_slug: 'home', section_key: 'more', section_type: 'faq', changes: { heading: 'FAQ' } })
    await reorderSiteSections('home', ['hero', 'faq'])
    await publishSiteSections('home')
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(['admin_save_site_section_draft', 'admin_add_site_section', 'admin_reorder_site_sections', 'admin_publish_site_sections'])
    for (const [, params] of rpc.mock.calls) expect(params).not.toHaveProperty('p_admin_user_id')
  })

  it('builds the preview address for home and Solutions pages', () => {
    expect(sitePreviewUrl('https://nidus.test/', 'home', 'abc')).toBe('https://nidus.test/?preview=abc')
    expect(sitePreviewUrl('https://nidus.test', 'solutions/pmo', 'abc')).toBe('https://nidus.test/solutions/pmo?preview=abc')
  })

  it('checks image type and size before uploading', async () => {
    expect((await uploadSiteAsset({ name: 'a.gif', type: 'image/gif', size: 10 })).error).toMatch(/PNG/)
    expect((await uploadSiteAsset({ name: 'a.png', type: 'image/png', size: 3 * 1024 * 1024 })).error).toMatch(/2 MB/)
    upload.mockResolvedValue({ error: null })
    const res = await uploadSiteAsset({ name: 'hero.png', type: 'image/png', size: 1000 })
    expect(res.data.url).toMatch(/^https:\/\/cdn\.test\/sections\/.+\.png$/)
  })
})
