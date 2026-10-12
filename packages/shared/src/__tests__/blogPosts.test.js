import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const upload = vi.fn()
const remove = vi.fn()
vi.mock('../supabase.js', () => ({
  getPublicDb: () => ({ rpc: (...a) => rpc(...a) }),
  getAdminStorageClient: () => ({
    storage: {
      from: (bucket) => ({
        upload: (...a) => upload(bucket, ...a),
        remove: (paths) => remove(bucket, paths),
        getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }),
      }),
    },
  }),
}))

import {
  blogPostStatus,
  blogPostIsLive,
  effectiveBlogPost,
  validateBlogPost,
  blogPostChanges,
  slugifyBlogTitle,
  checkBlogAttachmentFile,
  formatBlogFileSize,
  uploadBlogAttachment,
  publishBlogPost,
  removeBlogAttachment,
  saveBlogCategory,
} from '../publicSiteServices.js'

beforeEach(() => { rpc.mockReset(); upload.mockReset(); remove.mockReset() })

describe('post status', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  it('derives draft, scheduled, published and archived', () => {
    expect(blogPostStatus({ published_at: null }, now)).toBe('draft')
    expect(blogPostStatus({ published_at: '2026-10-20T00:00:00Z' }, now)).toBe('scheduled')
    expect(blogPostStatus({ published_at: '2026-10-01T00:00:00Z' }, now)).toBe('published')
    expect(blogPostStatus({ published_at: '2026-10-01T00:00:00Z', archived_at: '2026-10-05T00:00:00Z' }, now)).toBe('archived')
  })

  it('treats live and scheduled posts as live (edits become drafts)', () => {
    expect(blogPostIsLive({ published_at: '2026-10-20T00:00:00Z' })).toBe(true)
    expect(blogPostIsLive({ published_at: null })).toBe(false)
    expect(blogPostIsLive({ published_at: '2026-10-01', archived_at: '2026-10-02' })).toBe(false)
    expect(effectiveBlogPost({ title: 'Old', draft: { title: 'New' } }).title).toBe('New')
  })
})

describe('validation and changes', () => {
  it('requires title and a valid address; cover image needs alt text', () => {
    expect(validateBlogPost({ title: 'T', slug: 'a-post' })).toEqual({})
    expect(Object.keys(validateBlogPost({}))).toEqual(expect.arrayContaining(['title', 'slug']))
    expect(validateBlogPost({ title: 'T', slug: 'Bad Slug' }).slug).toBeTruthy()
    expect(validateBlogPost({ title: 'T', slug: 'a', cover_image_url: 'https://x/c.png' }).cover_image_alt).toBeTruthy()
  })

  it('suggests addresses from titles and sends only changed fields', () => {
    expect(slugifyBlogTitle('How to set up a PMO!')).toBe('how-to-set-up-a-pmo')
    expect(blogPostChanges({ title: 'A', summary: 'S' }, { title: 'B', summary: 'S' })).toEqual({ title: 'B' })
  })

  it('checks attachment type and size', () => {
    expect(checkBlogAttachmentFile({ type: 'application/pdf', size: 100 })).toBeNull()
    expect(checkBlogAttachmentFile({ type: 'application/x-msdownload', size: 100 })).toMatch(/PDF/)
    expect(checkBlogAttachmentFile({ type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/)
    expect(formatBlogFileSize(2048)).toBe('2 KB')
  })
})

describe('attachments', () => {
  it('uploads open files to site-assets with a public link', async () => {
    upload.mockResolvedValue({ error: null })
    rpc.mockResolvedValue({ data: 'att-1', error: null })
    const res = await uploadBlogAttachment('post-1', { name: 'guide.pdf', type: 'application/pdf', size: 1000 }, { displayName: 'Guide', gated: false })
    expect(res.data.id).toBe('att-1')
    expect(upload.mock.calls[0][0]).toBe('site-assets')
    const [fn, params] = rpc.mock.calls[0]
    expect(fn).toBe('admin_add_blog_attachment')
    expect(params).toMatchObject({ p_bucket: 'site-assets', p_is_gated: false, p_display_name: 'Guide' })
    expect(params.p_public_url).toMatch(/^https:\/\/cdn\.test\/site-assets\/blog\/post-1\//)
    expect(params).not.toHaveProperty('p_admin_user_id')
  })

  it('uploads gated files to the private bucket without a public link', async () => {
    upload.mockResolvedValue({ error: null })
    rpc.mockResolvedValue({ data: 'att-2', error: null })
    await uploadBlogAttachment('post-1', { name: 'guide.pdf', type: 'application/pdf', size: 1000 }, { displayName: 'Guide', gated: true })
    expect(upload.mock.calls[0][0]).toBe('site-downloads')
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_bucket: 'site-downloads', p_public_url: null, p_is_gated: true })
  })

  it('removes the uploaded file if the database refuses it', async () => {
    upload.mockResolvedValue({ error: null })
    rpc.mockResolvedValue({ data: null, error: 'Post not found' })
    const res = await uploadBlogAttachment('post-1', { name: 'g.pdf', type: 'application/pdf', size: 10 }, { displayName: 'G', gated: false })
    expect(res.error).toBe('Post not found')
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('deletes files returned by publish and by an immediate removal', async () => {
    rpc.mockResolvedValueOnce({ data: { published_at: 'x', removed_files: [{ bucket: 'site-downloads', path: 'blog/p/old.pdf' }] }, error: null })
    remove.mockResolvedValue({ error: null })
    await publishBlogPost('post-1')
    expect(remove).toHaveBeenCalledWith('site-downloads', ['blog/p/old.pdf'])
    rpc.mockResolvedValueOnce({ data: { deleted: true, bucket: 'site-assets', path: 'blog/p/x.pdf' }, error: null })
    await removeBlogAttachment('att-1')
    expect(remove).toHaveBeenCalledWith('site-assets', ['blog/p/x.pdf'])
  })

  it('saves categories through the RPC', async () => {
    rpc.mockResolvedValue({ data: 'cat', error: null })
    await saveBlogCategory({ slug: 'pmo', name: 'PMO', sort_order: '20' })
    expect(rpc).toHaveBeenCalledWith('admin_upsert_blog_category', expect.objectContaining({ p_slug: 'pmo', p_sort_order: 20, p_is_active: true }))
  })
})
