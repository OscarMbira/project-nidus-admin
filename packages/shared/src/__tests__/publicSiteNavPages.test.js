import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc: (...a) => rpc(...a) }) }))

import {
  validateSiteNavLink,
  validateSitePage,
  validateSiteProduct,
  saveSiteNavLink,
  saveSitePage,
  saveSiteProduct,
  setSiteEnquiryStatus,
  siteNavGroupLabel,
  siteEnquiryReference,
} from '../publicSiteServices.js'

describe('validateSiteNavLink', () => {
  const ok = { link_key: 'company.about', nav_group: 'company', label: 'About', target: 'page', page_slug: 'about' }

  it('accepts a page link and an address link', () => {
    expect(validateSiteNavLink(ok)).toEqual({})
    expect(validateSiteNavLink({ ...ok, target: 'url', url: 'https://platform.example/pricing' })).toEqual({})
    expect(validateSiteNavLink({ ...ok, nav_group: 'product_planner', target: 'url', url: '/pricing' })).toEqual({})
  })

  it('rejects unknown menus, bad keys and bad addresses', () => {
    expect(validateSiteNavLink({ ...ok, nav_group: 'sidebar' }).nav_group).toBeTruthy()
    expect(validateSiteNavLink({ ...ok, link_key: 'Bad Key' }).link_key).toBeTruthy()
    expect(validateSiteNavLink({ ...ok, target: 'url', url: 'platform/pricing' }).url).toBeTruthy()
    expect(validateSiteNavLink({ ...ok, page_slug: '' }).page_slug).toBeTruthy()
  })
})

describe('validateSitePage', () => {
  it('accepts nested solution slugs and refuses reserved ones', () => {
    expect(validateSitePage({ slug: 'solutions/pmo', title: 'PMO' })).toEqual({})
    expect(validateSitePage({ slug: 'pricing', title: 'x' }).slug).toMatch(/reserved/)
    expect(validateSitePage({ slug: 'a/b/c', title: 'x' }).slug).toBeTruthy()
    expect(validateSitePage({ slug: 'about' }).title).toBeTruthy()
  })
})

describe('labels and references', () => {
  it('names product bars and known menus', () => {
    expect(siteNavGroupLabel('footer_legal')).toBe('Footer › Legal')
    expect(siteNavGroupLabel('product_planner')).toBe('Product bar › planner')
  })

  it('builds the same 8-character reference the visitor sees', () => {
    expect(siteEnquiryReference('0a1b2c3d-4e5f-6789-abcd-ef0123456789')).toBe('0A1B2C3D')
  })
})

describe('service calls', () => {
  beforeEach(() => rpc.mockReset())

  it('sends only the chosen link target', async () => {
    rpc.mockResolvedValue({ data: 'id', error: null })
    await saveSiteNavLink({ link_key: 'k', nav_group: 'company', label: 'L', target: 'url', page_slug: 'about', url: 'https://x/' })
    const [fn, params] = rpc.mock.calls[0]
    expect(fn).toBe('admin_upsert_site_nav_link')
    expect(params.p_page_slug).toBeNull()
    expect(params.p_url).toBe('https://x/')
    expect(params).not.toHaveProperty('p_admin_user_id')
  })

  it('saves pages and product pricing/docs links', async () => {
    rpc.mockResolvedValue({ data: 'id', error: null })
    await saveSitePage({ slug: 'about', title: 'About', body_md: '# Hi' })
    expect(rpc.mock.calls[0][0]).toBe('admin_upsert_site_page')
    await saveSiteProduct({ slug: 'planner', name: 'P', landing_url: 'https://p/', pricing_url: 'https://p/pricing' })
    expect(rpc.mock.calls[1][1].p_pricing_url).toBe('https://p/pricing')
    expect(validateSiteProduct({ slug: 'planner', name: 'P', landing_url: 'https://p/', docs_url: 'docs' }).docs_url).toBeTruthy()
  })

  it('updates an enquiry status', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await setSiteEnquiryStatus('e1', 'answered')
    expect(rpc).toHaveBeenCalledWith('admin_set_site_enquiry_status', { p_id: 'e1', p_status: 'answered' })
  })
})
