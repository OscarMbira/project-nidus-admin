import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
vi.mock('../supabase.js', () => ({ getPublicDb: () => ({ rpc: (...a) => rpc(...a) }) }))

import {
  validateSiteProduct,
  saveSiteProduct,
  fetchSiteProductBySlugOrId,
  setSiteProductActive,
} from '../publicSiteServices.js'

describe('validateSiteProduct', () => {
  const ok = { slug: 'planner', name: 'Planner', landing_url: 'https://planner.example/' }

  it('accepts a valid row', () => {
    expect(validateSiteProduct(ok)).toEqual({})
  })

  it('requires slug, name and landing URL', () => {
    expect(Object.keys(validateSiteProduct({}))).toEqual(expect.arrayContaining(['slug', 'name', 'landing_url']))
  })

  it('refuses the admin slug and bad URLs', () => {
    expect(validateSiteProduct({ ...ok, slug: 'admin' }).slug).toMatch(/never listed/)
    expect(validateSiteProduct({ ...ok, sign_in_url: 'planner/login' }).sign_in_url).toMatch(/full URL/)
    expect(validateSiteProduct({ ...ok, slug: 'Bad Slug' }).slug).toMatch(/lowercase/)
  })
})

describe('service calls', () => {
  beforeEach(() => rpc.mockReset())

  it('saves through the upsert RPC without sending an admin id', async () => {
    rpc.mockResolvedValue({ data: 'id-1', error: null })
    await saveSiteProduct({ slug: 'planner', name: 'Planner', landing_url: 'https://p/', sort_order: '30' })
    const [fn, params] = rpc.mock.calls[0]
    expect(fn).toBe('admin_upsert_site_product')
    expect(params.p_sort_order).toBe(30)
    expect(params).not.toHaveProperty('p_admin_user_id')
  })

  it('finds a product by slug (friendly URL, rule 16.3) or id', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'u1', slug: 'planner' }], error: null })
    expect((await fetchSiteProductBySlugOrId('planner')).data.id).toBe('u1')
    expect((await fetchSiteProductBySlugOrId('u1')).data.slug).toBe('planner')
  })

  it('switches a card on or off', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    await setSiteProductActive('u1', true)
    expect(rpc).toHaveBeenCalledWith('admin_set_site_product_active', { p_id: 'u1', p_is_active: true })
  })
})
