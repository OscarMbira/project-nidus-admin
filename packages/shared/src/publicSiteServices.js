/**
 * v210 (monorepo v1241) — Admin editing of the public Nidus brand site.
 * public.site_products / public.site_content live in the shared Supabase project's `public`
 * schema. Their RLS exposes only active rows and allows no client writes, so both reads (all
 * rows, including inactive) and writes go through the SECURITY DEFINER RPCs in
 * SQL/v225_site_products_admin_rpc.sql, gated by system.public_site.view / .edit.
 * The acting admin comes from the session — no admin id is sent from the client.
 */
import { getAdminStorageClient, getPublicDb } from './supabase.js'

async function rpc(fn, params = {}) {
  const db = getPublicDb()
  if (!db) return { data: null, error: 'Database not configured' }
  const { data, error } = await db.rpc(fn, params)
  return { data, error: error?.message || error || null }
}

export const SITE_PRODUCT_ICON_KEYS = ['layout-dashboard', 'graduation-cap', 'calendar-range']
export const SITE_PRODUCT_ACCENT_KEYS = ['blue', 'green', 'violet']

export const fetchSiteProducts = async () => {
  const { data, error } = await rpc('admin_list_site_products')
  return { data: data || [], error }
}

export const fetchSiteProductBySlugOrId = async (key) => {
  const { data, error } = await fetchSiteProducts()
  if (error) return { data: null, error }
  const k = String(key || '').trim().toLowerCase()
  return { data: data.find((r) => r.slug === k || r.id === key) || null, error: null }
}

export const saveSiteProduct = (row) =>
  rpc('admin_upsert_site_product', {
    p_id: row.id || null,
    p_slug: row.slug,
    p_name: row.name,
    p_tagline: row.tagline || null,
    p_description: row.description || null,
    p_audience: row.audience || null,
    p_landing_url: row.landing_url,
    p_sign_in_url: row.sign_in_url || null,
    p_sign_up_url: row.sign_up_url || null,
    p_icon_key: row.icon_key || null,
    p_accent_key: row.accent_key || null,
    p_sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    p_is_active: row.is_active !== false,
    p_pricing_url: row.pricing_url || null,
    p_docs_url: row.docs_url || null,
  })

export const setSiteProductActive = (id, isActive) =>
  rpc('admin_set_site_product_active', { p_id: id, p_is_active: Boolean(isActive) })

export const fetchSiteContent = async () => {
  const { data, error } = await rpc('admin_list_site_content')
  return { data: data || [], error }
}

export const saveSiteContent = ({ content_key, content_value, description, is_active }) =>
  rpc('admin_upsert_site_content', {
    p_content_key: content_key,
    p_content_value: content_value ?? '',
    p_description: description || null,
    p_is_active: is_active !== false,
  })

/** Required-field and URL checks shared by the form and its tests. */
export function validateSiteProduct(row) {
  const errors = {}
  const slug = String(row.slug || '').trim().toLowerCase()
  if (!slug) errors.slug = 'Slug is required'
  else if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens only'
  else if (slug === 'admin') errors.slug = 'The Admin app is never listed on the public site'
  if (!String(row.name || '').trim()) errors.name = 'Name is required'
  for (const field of ['landing_url', 'sign_in_url', 'sign_up_url', 'pricing_url', 'docs_url']) {
    const v = String(row[field] || '').trim()
    if (field === 'landing_url' && !v) errors[field] = 'Landing URL is required'
    else if (v && !/^https?:\/\/\S+$/i.test(v)) errors[field] = 'Enter a full URL starting with http:// or https://'
  }
  return errors
}

// ── v212 (monorepo v1241 Amendment A): navigation links, common pages, enquiries (SQL v230) ──

/** Menus a link can sit in. product_<slug> is that product's own bar (shown only inside it). */
export const SITE_NAV_GROUPS = [
  { value: 'solutions', label: 'Header › Solutions' },
  { value: 'resources', label: 'Header › Resources' },
  { value: 'company', label: 'Header › Company' },
  { value: 'footer_solutions', label: 'Footer › Solutions' },
  { value: 'footer_resources', label: 'Footer › Resources' },
  { value: 'footer_company', label: 'Footer › Company' },
  { value: 'footer_legal', label: 'Footer › Legal' },
]
export const SITE_PAGE_KINDS = ['page', 'solution', 'legal', 'contact']
export const SITE_ENQUIRY_STATUSES = ['new', 'in_progress', 'answered', 'closed', 'spam']

export const siteNavGroupLabel = (group) => {
  const known = SITE_NAV_GROUPS.find((g) => g.value === group)
  if (known) return known.label
  const m = /^product_(.+)$/.exec(group || '')
  return m ? `Product bar › ${m[1]}` : group || ''
}

export const fetchSiteNavLinks = async () => {
  const { data, error } = await rpc('admin_list_site_nav_links')
  return { data: data || [], error }
}

export const saveSiteNavLink = (row) =>
  rpc('admin_upsert_site_nav_link', {
    p_id: row.id || null,
    p_link_key: row.link_key,
    p_nav_group: row.nav_group,
    p_label: row.label,
    p_description: row.description || null,
    p_page_slug: row.target === 'page' ? row.page_slug || null : null,
    p_url: row.target === 'url' ? row.url || null : null,
    p_sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    p_is_active: row.is_active !== false,
  })

export const deleteSiteNavLink = (id) => rpc('admin_delete_site_nav_link', { p_id: id })

export const fetchSitePages = async () => {
  const { data, error } = await rpc('admin_list_site_pages')
  return { data: data || [], error }
}

export const saveSitePage = (row) =>
  rpc('admin_upsert_site_page', {
    p_id: row.id || null,
    p_slug: row.slug,
    p_title: row.title,
    p_summary: row.summary || null,
    p_body_md: row.body_md || '',
    p_page_kind: row.page_kind || 'page',
    p_sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    p_is_active: row.is_active !== false,
  })

export const fetchSiteEnquiries = async () => {
  const { data, error } = await rpc('admin_list_site_enquiries')
  return { data: data || [], error }
}

export const setSiteEnquiryStatus = (id, status) => rpc('admin_set_site_enquiry_status', { p_id: id, p_status: status })

/** Short reference shown to the visitor after sending (same rule as site_submit_enquiry). */
export const siteEnquiryReference = (id) => String(id || '').replace(/-/g, '').slice(0, 8).toUpperCase()

export function validateSiteNavLink(row) {
  const errors = {}
  const key = String(row.link_key || '').trim().toLowerCase()
  if (!key) errors.link_key = 'Key is required'
  else if (!/^[a-z0-9_.-]+$/.test(key)) errors.link_key = 'Use lowercase letters, numbers, dots, dashes and underscores'
  const group = String(row.nav_group || '').trim()
  if (!group) errors.nav_group = 'Choose a menu'
  else if (!/^(solutions|resources|company|footer_(solutions|resources|company|legal)|product_[a-z0-9-]+)$/.test(group)) errors.nav_group = 'Unknown menu'
  if (!String(row.label || '').trim()) errors.label = 'Label is required'
  if (row.target === 'page') {
    if (!String(row.page_slug || '').trim()) errors.page_slug = 'Choose a page'
  } else {
    const url = String(row.url || '').trim()
    if (!url) errors.url = 'Address is required'
    else if (!/^(https?:\/\/\S+|\/\S*)$/i.test(url)) errors.url = 'Start with https:// (another app) or / (a page inside the product)'
  }
  return errors
}

export function validateSitePage(row) {
  const errors = {}
  const slug = String(row.slug || '').trim().toLowerCase()
  if (!slug) errors.slug = 'Slug is required'
  else if (!/^[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(slug)) errors.slug = 'Use lowercase letters, numbers and hyphens (one optional "/", e.g. solutions/pmo)'
  else if (['pricing', 'index', 'assets'].includes(slug)) errors.slug = 'This slug is reserved by the site'
  if (!String(row.title || '').trim()) errors.title = 'Title is required'
  return errors
}

// ── v213 (monorepo v1262): marketing sections — drafts, preview, publish (SQL v231) ──
// Replicates packages/shared/src/site/siteSections.js from the monorepo (rule 34.4).

export const SITE_SECTION_TYPES = [
  { value: 'hero', label: 'Hero' },
  { value: 'trust_strip', label: 'Trust strip (logos / figures)' },
  { value: 'value_points', label: 'Problem → value points' },
  { value: 'product_cards', label: 'Product cards' },
  { value: 'feature_grid', label: 'Feature highlights' },
  { value: 'steps', label: 'How it works (steps)' },
  { value: 'audience_links', label: 'Solutions by audience' },
  { value: 'testimonials', label: 'Testimonials' },
  { value: 'pricing_teaser', label: 'Pricing teaser' },
  { value: 'faq', label: 'Frequently asked questions' },
  { value: 'cta_band', label: 'Call-to-action band' },
]
export const siteSectionTypeLabel = (type) => SITE_SECTION_TYPES.find((t) => t.value === type)?.label || type

/** Item fields per type; labels are the item table's column headers. */
export const SITE_SECTION_ITEM_FIELDS = {
  hero: [],
  trust_strip: [{ key: 'title', label: 'Name or figure' }, { key: 'text', label: 'Caption' }, { key: 'image_url', label: 'Logo', image: true }, { key: 'image_alt', label: 'Logo description' }],
  value_points: [{ key: 'title', label: 'Title' }, { key: 'text', label: 'Text' }, { key: 'icon', label: 'Icon', icon: true }],
  product_cards: [],
  feature_grid: [{ key: 'title', label: 'Title' }, { key: 'text', label: 'Text' }, { key: 'icon', label: 'Icon', icon: true }],
  steps: [{ key: 'title', label: 'Step' }, { key: 'text', label: 'Text' }],
  audience_links: [{ key: 'title', label: 'Title' }, { key: 'text', label: 'Text' }, { key: 'icon', label: 'Icon', icon: true }, { key: 'href', label: 'Link' }],
  testimonials: [{ key: 'text', label: 'Quote' }, { key: 'title', label: 'Name' }, { key: 'subtitle', label: 'Role and organisation' }, { key: 'image_url', label: 'Photo', image: true }, { key: 'image_alt', label: 'Photo description' }],
  pricing_teaser: [],
  faq: [{ key: 'title', label: 'Question' }, { key: 'text', label: 'Answer' }],
  cta_band: [],
}

/** Which top-level fields each type uses in the editor. */
export const SITE_SECTION_FIELDS = {
  hero: ['heading', 'subheading', 'body', 'primary_cta', 'secondary_cta', 'image'],
  trust_strip: ['heading'],
  value_points: ['heading', 'subheading'],
  product_cards: ['heading', 'subheading'],
  feature_grid: ['heading', 'subheading'],
  steps: ['heading', 'subheading'],
  audience_links: ['heading', 'subheading'],
  testimonials: ['heading', 'subheading'],
  pricing_teaser: ['heading', 'subheading', 'body', 'primary_cta', 'secondary_cta'],
  faq: ['heading', 'subheading'],
  cta_band: ['heading', 'subheading', 'primary_cta', 'secondary_cta'],
}

export const SITE_ICON_KEYS = [
  'layout-dashboard', 'graduation-cap', 'calendar-range', 'shield-check', 'git-branch', 'bar-chart',
  'users', 'layers', 'workflow', 'smartphone', 'clipboard-check', 'target', 'briefcase', 'book-open',
  'sparkles', 'clock', 'link', 'alert-triangle', 'trending-up', 'repeat',
]

const SECTION_CONTENT_KEYS = ['heading', 'subheading', 'body', 'primary_cta', 'secondary_cta', 'image_url', 'image_alt', 'items', 'is_active', 'sort_order']

/** The section as it will look after publishing (published columns with the draft applied). */
export function effectiveSiteSection(row) {
  return { ...row, ...(row?.draft || {}) }
}

/** 'new' (never published), 'draft' (unpublished changes) or 'published'. */
export function siteSectionStatus(row) {
  if (!row?.published_at) return 'new'
  return row.draft ? 'draft' : 'published'
}

const SECTION_HREF_RE = /^(#[a-z0-9_-]+|\/[^\s]*|https?:\/\/\S+)$/i
export const isValidSiteSectionHref = (href) => SECTION_HREF_RE.test(String(href || '').trim())

/** Field checks before saving a draft (the database repeats the key/link checks). */
export function validateSiteSection(type, c = {}) {
  const errors = {}
  if (!SITE_SECTION_ITEM_FIELDS[type]) return { section_type: 'Unknown section type' }
  if (!['product_cards', 'trust_strip', 'testimonials'].includes(type) && !String(c.heading || '').trim()) errors.heading = 'Heading is required'
  for (const key of ['primary_cta', 'secondary_cta']) {
    const cta = c[key]
    if (!cta || (!String(cta.label || '').trim() && !String(cta.href || '').trim())) continue
    if (!String(cta.label || '').trim()) errors[key] = 'Button text is required'
    else if (!isValidSiteSectionHref(cta.href)) errors[key] = 'Link must start with / (this site), https:// (another app) or # (#get-started or a section)'
  }
  if (String(c.image_url || '').trim() && !String(c.image_alt || '').trim()) errors.image_alt = 'Describe the image (alt text)'
  const items = Array.isArray(c.items) ? c.items : []
  if (items.length > 24) errors.items = 'A section can have up to 24 items'
  items.forEach((item, i) => {
    const n = i + 1
    if (type === 'testimonials') {
      if (!String(item.text || '').trim() || !String(item.title || '').trim()) errors[`items.${i}`] = `Item ${n}: quote and name are required`
    } else if (type === 'faq') {
      if (!String(item.title || '').trim() || !String(item.text || '').trim()) errors[`items.${i}`] = `Item ${n}: question and answer are required`
    } else if (!String(item.title || '').trim()) {
      errors[`items.${i}`] = type === 'trust_strip' ? `Item ${n}: name or figure is required` : `Item ${n}: title is required`
    }
    if (item.href && !isValidSiteSectionHref(item.href)) errors[`items.${i}`] = `Item ${n}: link must start with /, https:// or #`
    if (item.image_url && !String(item.image_alt || '').trim()) errors[`items.${i}`] = `Item ${n}: describe the image`
  })
  return errors
}

/** Only the fields that differ from the effective section, so a save stays small. */
export function siteSectionChanges(before, after) {
  const changes = {}
  for (const k of SECTION_CONTENT_KEYS) {
    if (!(k in after)) continue
    if (JSON.stringify(after[k] ?? null) !== JSON.stringify(before?.[k] ?? null)) changes[k] = after[k] ?? null
  }
  return changes
}

export const fetchSiteSections = async () => {
  const { data, error } = await rpc('admin_list_site_sections')
  return { data: data || [], error }
}
export const saveSiteSectionDraft = (id, changes) => rpc('admin_save_site_section_draft', { p_id: id, p_changes: changes })
export const addSiteSection = ({ page_slug, section_key, section_type, changes = {} }) =>
  rpc('admin_add_site_section', { p_page_slug: page_slug, p_section_key: section_key, p_section_type: section_type, p_changes: changes })
export const discardSiteSectionDraft = (id) => rpc('admin_discard_site_section_draft', { p_id: id })
export const reorderSiteSections = (pageSlug, keys) => rpc('admin_reorder_site_sections', { p_page_slug: pageSlug, p_keys: keys })
export const publishSiteSections = (pageSlug) => rpc('admin_publish_site_sections', { p_page_slug: pageSlug })
export const createSitePreviewToken = () => rpc('admin_create_site_preview_token')

/** Brand-site address of a page with a preview link (brand.url from site_content). */
export function sitePreviewUrl(brandUrl, pageSlug, token) {
  const base = String(brandUrl || '').replace(/\/+$/, '')
  const path = pageSlug === 'home' ? '/' : `/${pageSlug}`
  return `${base}${path}?preview=${encodeURIComponent(token)}`
}

export const SITE_ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
export const SITE_ASSET_MAX_BYTES = 2 * 1024 * 1024

/** Upload an image to the public site-assets bucket; returns { data: { url } } (policies: SQL v231). */
export async function uploadSiteAsset(file) {
  if (!file) return { data: null, error: 'Choose an image' }
  if (!SITE_ASSET_TYPES.includes(file.type)) return { data: null, error: 'Use a PNG, JPG, WebP or SVG image' }
  if (file.size > SITE_ASSET_MAX_BYTES) return { data: null, error: 'Images can be up to 2 MB' }
  const client = getAdminStorageClient()
  if (!client) return { data: null, error: 'Database not configured' }
  const ext = (file.name.split('.').pop() || 'img').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `sections/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`
  const { error } = await client.storage.from('site-assets').upload(path, file, { contentType: file.type, upsert: false })
  if (error) return { data: null, error: error.message || String(error) }
  const { data } = client.storage.from('site-assets').getPublicUrl(path)
  return { data: { url: data.publicUrl }, error: null }
}

// ── v214 (monorepo v1263): blog posts, attachments, categories (SQL v232) ──
// Replicates packages/shared/src/site/siteBlog.js from the monorepo (rule 34.4).

export const BLOG_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const BLOG_ATTACHMENT_TYPES = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'image/png': 'PNG image',
  'image/jpeg': 'JPG image',
  'image/webp': 'WebP image',
}
export const BLOG_ATTACHMENT_ACCEPT = Object.keys(BLOG_ATTACHMENT_TYPES).join(',')
export const BLOG_POST_KEYS = ['slug', 'title', 'summary', 'body_md', 'cover_image_url', 'cover_image_alt', 'author_name', 'author_role', 'category_id']
const BLOG_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function checkBlogAttachmentFile(file) {
  if (!file) return 'Choose a file'
  if (!BLOG_ATTACHMENT_TYPES[file.type]) return 'Use a PDF, Word, Excel, PowerPoint, text, CSV or image file'
  if (file.size > BLOG_ATTACHMENT_MAX_BYTES) return 'Files can be up to 10 MB'
  return null
}

export function slugifyBlogTitle(title) {
  return String(title || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/, '')
}

export function formatBlogFileSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** 'draft' | 'scheduled' | 'published' | 'archived'. */
export function blogPostStatus(post, now = new Date()) {
  if (post?.archived_at) return 'archived'
  if (!post?.published_at) return 'draft'
  return new Date(post.published_at) > now ? 'scheduled' : 'published'
}

/** True when edits must wait for "Publish" (the post is live or scheduled). */
export const blogPostIsLive = (post) => Boolean(post?.published_at) && !post?.archived_at

/** The post as it will look after publishing. */
export const effectiveBlogPost = (post) => ({ ...post, ...(post?.draft || {}) })

export function validateBlogPost(c = {}) {
  const errors = {}
  if (!String(c.title || '').trim()) errors.title = 'Title is required'
  if (!BLOG_SLUG_RE.test(String(c.slug || ''))) errors.slug = 'Use lowercase letters, numbers and single hyphens'
  else if (c.slug.length > 80) errors.slug = 'Up to 80 characters'
  if (String(c.summary || '').length > 400) errors.summary = 'Up to 400 characters'
  if (String(c.cover_image_url || '').trim() && !String(c.cover_image_alt || '').trim()) errors.cover_image_alt = 'Describe the cover image (alt text)'
  return errors
}

/** Only fields that differ, so a save stays small. */
export function blogPostChanges(before, after) {
  const changes = {}
  for (const k of BLOG_POST_KEYS) {
    if (!(k in after)) continue
    if ((after[k] ?? '') !== (before?.[k] ?? '')) changes[k] = after[k] ?? ''
  }
  return changes
}

/** Delete storage files returned by publish / discard / delete / remove (best effort). */
export async function removeBlogFiles(files) {
  const client = getAdminStorageClient()
  if (!client || !Array.isArray(files) || !files.length) return { error: null }
  const byBucket = files.reduce((acc, f) => ({ ...acc, [f.bucket]: [...(acc[f.bucket] || []), f.path] }), {})
  for (const [bucket, paths] of Object.entries(byBucket)) {
    const { error } = await client.storage.from(bucket).remove(paths)
    if (error) return { error: error.message || String(error) }
  }
  return { error: null }
}

async function withFileCleanup(promise) {
  const { data, error } = await promise
  if (error) return { data, error }
  const cleanup = await removeBlogFiles(data?.removed_files)
  return { data, error: null, cleanupError: cleanup.error }
}

export const fetchBlogPosts = async () => {
  const { data, error } = await rpc('admin_list_blog_posts')
  return { data: data || [], error }
}
export const fetchBlogAttachments = async () => {
  const { data, error } = await rpc('admin_list_blog_attachments')
  return { data: data || [], error }
}
export const fetchBlogCategories = async () => {
  const { data, error } = await rpc('admin_list_blog_categories')
  return { data: data || [], error }
}
export const createBlogPost = (changes) => rpc('admin_create_blog_post', { p_changes: changes })
export const saveBlogPost = (id, changes) => rpc('admin_save_blog_post', { p_id: id, p_changes: changes })
export const publishBlogPost = (id, publishAt = null) => withFileCleanup(rpc('admin_publish_blog_post', { p_id: id, p_publish_at: publishAt }))
export const discardBlogPostDraft = (id) => withFileCleanup(rpc('admin_discard_blog_post_draft', { p_id: id }))
export const archiveBlogPost = (id) => rpc('admin_archive_blog_post', { p_id: id })
export const restoreBlogPost = (id) => rpc('admin_restore_blog_post', { p_id: id })
export const deleteBlogPost = (id) => withFileCleanup(rpc('admin_delete_blog_post', { p_id: id }))
export const updateBlogAttachment = (id, displayName, sortOrder) =>
  rpc('admin_update_blog_attachment', { p_id: id, p_display_name: displayName, p_sort_order: sortOrder })
export const keepBlogAttachment = (id) => rpc('admin_keep_blog_attachment', { p_id: id })

export async function removeBlogAttachment(id) {
  const { data, error } = await rpc('admin_remove_blog_attachment', { p_id: id })
  if (error) return { data, error }
  if (data?.deleted) await removeBlogFiles([{ bucket: data.bucket, path: data.path }])
  return { data, error: null }
}

/** Upload a document (open → public site-assets, gated → private site-downloads) and attach it to a post. */
export async function uploadBlogAttachment(postId, file, { displayName, gated }) {
  const problem = checkBlogAttachmentFile(file)
  if (problem) return { data: null, error: problem }
  if (!String(displayName || '').trim()) return { data: null, error: 'Give the document a name' }
  const client = getAdminStorageClient()
  if (!client) return { data: null, error: 'Database not configured' }
  const bucket = gated ? 'site-downloads' : 'site-assets'
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `blog/${postId}/${crypto.randomUUID()}.${ext}`
  const { error: upErr } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
  if (upErr) return { data: null, error: upErr.message || String(upErr) }
  const publicUrl = gated ? null : client.storage.from(bucket).getPublicUrl(path).data.publicUrl
  const { data, error } = await rpc('admin_add_blog_attachment', {
    p_post_id: postId, p_display_name: String(displayName).trim(), p_bucket: bucket, p_file_path: path,
    p_public_url: publicUrl, p_mime_type: file.type, p_size_bytes: file.size, p_is_gated: Boolean(gated),
  })
  if (error) {
    await client.storage.from(bucket).remove([path]) // do not leave an orphan file
    return { data: null, error }
  }
  return { data: { id: data }, error: null }
}

/** Cover / inline images for posts reuse the section image upload (public site-assets, ≤ 2 MB). */
export const uploadBlogImage = uploadSiteAsset

export const saveBlogCategory = (row) =>
  rpc('admin_upsert_blog_category', {
    p_id: row.id || null, p_slug: row.slug, p_name: row.name, p_description: row.description || null,
    p_sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0, p_is_active: row.is_active !== false,
  })
export const deleteBlogCategory = (id) => rpc('admin_delete_blog_category', { p_id: id })

// ── v233 (monorepo v1264): public header colours + primary button ───────────────
// contrastRatio() mirrors public.site_color_contrast() (monorepo SQL v1264) and the monorepo's
// @nidus/shared/site/siteColors.js — replicated, not imported (Admin rule: no cross-repo imports).

export const SITE_HEADER_MIN_CONTRAST = 4.5
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const isHexColor = (v) => HEX_COLOR.test(String(v || '').trim())

function relLuminance(hex) {
  const n = parseInt(hex.trim().slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1–21), 2 decimals; null for invalid colours. */
export function contrastRatio(a, b) {
  if (!isHexColor(a) || !isHexColor(b)) return null
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}

/** Header name for a scope: 'brand' → Brand site, else the product's name. */
export const siteHeaderLabel = (scope, products = []) =>
  scope === 'brand' ? 'Brand site' : products.find((p) => p.slug === scope)?.name || scope

export function validateSiteHeaderSettings(row) {
  const errors = {}
  for (const k of ['bg_color', 'text_color', 'accent_color', 'cta_text_color']) {
    if (!isHexColor(row[k])) errors[k] = 'Use a 6-digit hex colour such as #0B1220'
  }
  const text = contrastRatio(row.text_color, row.bg_color)
  if (text !== null && text < SITE_HEADER_MIN_CONTRAST) errors.text_color = `Text on the background is ${text}:1, it needs at least ${SITE_HEADER_MIN_CONTRAST}:1`
  const cta = contrastRatio(row.cta_text_color, row.accent_color)
  if (cta !== null && cta < SITE_HEADER_MIN_CONTRAST) errors.cta_text_color = `Button text on the accent is ${cta}:1, it needs at least ${SITE_HEADER_MIN_CONTRAST}:1`
  const label = String(row.cta_label || '').trim()
  if (!label) errors.cta_label = 'Button label is required'
  else if (label.length > 40) errors.cta_label = 'Up to 40 characters'
  const url = String(row.cta_url || '').trim()
  if (url && !/^(https?:\/\/\S+|\/\S*)$/i.test(url)) errors.cta_url = 'Start with https:// or / (a page inside the product)'
  return errors
}

export const fetchSiteHeaderSettings = async () => {
  const { data, error } = await rpc('admin_list_site_header_settings')
  return { data: data || [], error }
}

export const saveSiteHeaderSettings = (row) =>
  rpc('admin_upsert_site_header_settings', {
    p_scope_slug: row.scope_slug,
    p_bg_color: String(row.bg_color || '').trim(),
    p_text_color: String(row.text_color || '').trim(),
    p_accent_color: String(row.accent_color || '').trim(),
    p_cta_text_color: String(row.cta_text_color || '').trim(),
    p_cta_label: String(row.cta_label || '').trim(),
    p_cta_url: String(row.cta_url || '').trim() || null,
    p_is_active: row.is_active !== false,
  })
