/**
 * v214 (monorepo v1263) — Create / view / edit one blog post. Route:
 * /content/blog-post[?slug=<slug>[&view=1]] (friendly slug in the URL, Admin rule 13.1).
 *
 * Never-published posts are edited in place. Once published (or scheduled), saves become drafts
 * and visitors keep the published version until "Publish". Attachments: open files go to the
 * public site-assets bucket, gated files (email required) to the private site-downloads bucket.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BLOG_ATTACHMENT_ACCEPT,
  BLOG_ATTACHMENT_TYPES,
  archiveBlogPost,
  blogPostChanges,
  blogPostIsLive,
  blogPostStatus,
  createBlogPost,
  createSitePreviewToken,
  deleteBlogPost,
  discardBlogPostDraft,
  effectiveBlogPost,
  fetchBlogAttachments,
  fetchBlogCategories,
  fetchBlogPosts,
  fetchSiteContent,
  fetchSitePages,
  formatBlogFileSize,
  keepBlogAttachment,
  publishBlogPost,
  removeBlogAttachment,
  restoreBlogPost,
  saveBlogPost,
  slugifyBlogTitle,
  updateBlogAttachment,
  uploadBlogAttachment,
  uploadBlogImage,
  validateBlogPost,
  fileFromClipboardData,
  normalizeImageFile,
  useUnsavedChangesGuard,
  PermissionGate,
} from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminField,
  AdminForm,
  AdminIconActionButton,
  AuditCard,
  AuditDetailsPanel,
  AuditField,
  AuditTimestampPair,
  DetailAuditTabList,
  EmptyState,
  LoadingState,
  MarkdownView,
  inputClass,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'
import { BLOG_STATUS_BADGE } from './BlogPostsPage.jsx'
import PasteImageButton from '../components/PasteImageButton.jsx'

const EMPTY = { title: '', slug: '', summary: '', body_md: '', cover_image_url: '', cover_image_alt: '', author_name: '', author_role: '', category_id: '' }
const toForm = (p) => Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p?.[k] ?? '']))
const fmt = (ts) => (ts ? new Date(ts).toLocaleString() : '—')
const btn = 'rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50'

// Markdown toolbar: wrap the selection, or prefix the current lines.
const TOOLBAR = [
  { label: 'H2', title: 'Heading', prefix: '## ' },
  { label: 'B', title: 'Bold', wrap: ['**', '**'], placeholder: 'bold text' },
  { label: 'I', title: 'Italic', wrap: ['_', '_'], placeholder: 'italic text' },
  { label: '• List', title: 'Bullet list', prefix: '- ' },
  { label: '1. List', title: 'Numbered list', prefix: '1. ' },
  { label: 'Link', title: 'Link', wrap: ['[', '](https://)'], placeholder: 'link text' },
  { label: 'Quote', title: 'Quote', prefix: '> ' },
]

function applyMarkdown(text, start, end, tool) {
  const selected = text.slice(start, end)
  if (tool.wrap) {
    const inner = selected || tool.placeholder
    const out = `${tool.wrap[0]}${inner}${tool.wrap[1]}`
    return { text: text.slice(0, start) + out + text.slice(end), cursor: start + tool.wrap[0].length + inner.length }
  }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const block = text.slice(lineStart, end) || ''
  const out = block.split('\n').map((l) => `${tool.prefix}${l}`).join('\n')
  return { text: text.slice(0, lineStart) + out + text.slice(end), cursor: lineStart + out.length }
}

function MarkdownEditor({ value, onChange, disabled, onError }) {
  const ref = useRef(null)
  const [mode, setMode] = useState('write')
  const [uploading, setUploading] = useState(false)
  const insert = (tool) => {
    const el = ref.current
    const { text, cursor } = applyMarkdown(value, el?.selectionStart ?? value.length, el?.selectionEnd ?? value.length, tool)
    onChange(text)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(cursor, cursor) })
  }
  const insertImageFile = async (file) => {
    const pos = ref.current?.selectionStart ?? value.length
    setUploading(true)
    const { data, error } = await uploadBlogImage(normalizeImageFile(file, 'article-image.png'))
    setUploading(false)
    if (error) { onError(String(error)); return }
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ')
    onChange(`${value.slice(0, pos)}\n\n![${alt}](${data.url})\n\n${value.slice(pos)}`)
  }
  const insertImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) insertImageFile(file)
  }
  // Ctrl+V with an image on the clipboard uploads it and inserts it at the cursor; text pastes normally.
  const onPaste = async (e) => {
    const hasImage = [...(e.clipboardData?.items || [])].some((i) => i.kind === 'file' && String(i.type).startsWith('image/'))
    if (!hasImage) return
    e.preventDefault()
    const file = await fileFromClipboardData(e.clipboardData, 'article-image')
    if (file) insertImageFile(file)
  }
  const tab = (id, label) => (
    <button type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
      className={`px-3 py-1.5 text-sm ${mode === id ? 'border-b-2 border-blue-600 font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{label}</button>
  )
  return (
    <div className="rounded border border-gray-300 dark:border-gray-600">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-2 dark:border-gray-700">
        <div className="flex">{tab('write', 'Write')}{tab('preview', 'Preview')}</div>
        {mode === 'write' && !disabled && (
          <div className="flex flex-wrap gap-1 py-1">
            {TOOLBAR.map((t) => (
              <button key={t.label} type="button" title={t.title} aria-label={t.title} onClick={() => insert(t)}
                className="rounded px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">{t.label}</button>
            ))}
            <label className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800" title="Insert image">
              {uploading ? 'Uploading…' : 'Image'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={insertImage} disabled={uploading} />
            </label>
          </div>
        )}
      </div>
      {mode === 'write' ? (
        <textarea ref={ref} className={`${inputClass} min-h-[22rem] rounded-none border-0 font-mono text-sm`} value={value} onChange={(e) => onChange(e.target.value)} onPaste={onPaste} disabled={disabled}
          placeholder={'## A heading\n\nWrite the article here. Use the toolbar for headings, lists, links and images — or paste an image with Ctrl+V.'} />
      ) : (
        // Rendered with the Admin documentation viewer (sanitised Markdown, dark preview canvas).
        <div className="min-h-[22rem] bg-gray-950 p-4">
          {value.trim() ? <MarkdownView content={value} fileName="post.md" /> : <p className="text-sm text-gray-500">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  )
}

function CoverPicker({ url, onChange, disabled, onError }) {
  const [busy, setBusy] = useState(false)
  const applyFile = async (file) => {
    setBusy(true)
    const { data, error } = await uploadBlogImage(normalizeImageFile(file, 'cover-image.png'))
    setBusy(false)
    if (error) onError(String(error))
    else onChange(data.url)
  }
  const pick = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) applyFile(file)
  }
  return (
    <div className="flex flex-wrap items-start gap-3">
      {url && <img src={url} alt="" className="h-16 w-28 rounded border border-gray-200 object-cover dark:border-gray-700" />}
      {!disabled && (
        <label className={`${btn} cursor-pointer`}>
          {busy ? 'Uploading…' : url ? 'Replace image' : 'Upload cover image'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} disabled={busy} />
        </label>
      )}
      {!disabled && <PasteImageButton onFile={applyFile} disabled={busy} label={url ? 'Paste new image' : 'Paste image'} fileName="cover-image" />}
      {url && !disabled && <button type="button" onClick={() => onChange('')} className="text-sm text-red-600 hover:underline dark:text-red-400">Remove</button>}
    </div>
  )
}

function Attachments({ post, attachments, privacyActive, canEdit, onChanged, confirm, showError, showSuccess }) {
  const [file, setFile] = useState(null)
  const [name, setName] = useState('')
  const [gated, setGated] = useState(false)
  const [busy, setBusy] = useState(false)
  const live = blogPostIsLive(post)
  const list = attachments.filter((a) => a.post_id === post.id).sort((a, b) => a.sort_order - b.sort_order)

  const upload = async () => {
    setBusy(true)
    const { error } = await uploadBlogAttachment(post.id, file, { displayName: name, gated })
    setBusy(false)
    if (error) { showError(String(error)); return }
    showSuccess(`${name} uploaded${live ? ' — it appears on the site when you publish' : ''}.`)
    setFile(null); setName(''); setGated(false)
    onChanged()
  }
  const move = async (i, d) => {
    const a = list[i]; const b = list[i + d]
    if (!a || !b) return
    const r1 = await updateBlogAttachment(a.id, a.display_name, b.sort_order)
    const r2 = await updateBlogAttachment(b.id, b.display_name, a.sort_order)
    if (r1.error || r2.error) showError(String(r1.error || r2.error))
    onChanged()
  }
  const remove = (a) => confirm({
    title: `Remove "${a.display_name}"?`,
    message: live && a.state === 'live' ? 'It stays on the site until you publish the post, then the file is deleted.' : 'The file is deleted now.',
    confirmLabel: 'Remove',
    danger: true,
    onConfirm: async () => {
      const { error } = await removeBlogAttachment(a.id)
      if (error) { showError(String(error)); return }
      showSuccess(`${a.display_name} removed.`)
      onChanged()
    },
  })
  const keep = async (a) => {
    const { error } = await keepBlogAttachment(a.id)
    if (error) showError(String(error))
    onChanged()
  }
  const stateLabel = { live: null, draft_add: 'added — publish to show', draft_remove: 'will be removed when you publish' }

  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 md:p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Downloads ({list.length})</h2>
      {list.some((a) => a.is_gated) && !privacyActive && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
          This post has email-gated downloads, but the Privacy page is not published. Publish it under Public Site Pages &amp; Menus before using gated downloads publicly.
        </p>
      )}
      {!list.length && <p className="text-sm text-gray-500 dark:text-gray-400">No downloads yet.</p>}
      {list.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {list.map((a, i) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                <span className={`font-medium text-gray-900 dark:text-gray-100 ${a.state === 'draft_remove' ? 'line-through' : ''}`}>{a.display_name}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {BLOG_ATTACHMENT_TYPES[a.mime_type] || 'File'} · {formatBlogFileSize(a.size_bytes)} · {a.is_gated ? 'email required' : 'open'}
                  {stateLabel[a.state] ? ` · ${stateLabel[a.state]}` : ''}
                </span>
              </span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  <button type="button" className={btn} aria-label="Move up" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className={btn} aria-label="Move down" title="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
                  {a.state === 'draft_remove'
                    ? <button type="button" className={btn} onClick={() => keep(a)}>Keep</button>
                    : <AdminIconActionButton variant="delete" label="Remove" onClick={() => remove(a)} />}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid gap-2 rounded border border-dashed border-gray-300 p-3 dark:border-gray-600 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-sm text-gray-700 dark:text-gray-300">File (PDF, Office, text, CSV or image; up to 10 MB)
            <input type="file" accept={BLOG_ATTACHMENT_ACCEPT} className={`${inputClass} mt-1`}
              onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, '')) }} />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">Name shown to readers
            <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={gated} onChange={(e) => setGated(e.target.checked)} /> Require email to download
          </label>
          <button type="button" onClick={upload} disabled={!file || !name.trim() || busy}
            className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">{busy ? 'Uploading…' : 'Upload'}</button>
          <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-4">To switch a document between open and email-required, upload it again with the new setting and remove the old one.</p>
        </div>
      )}
    </section>
  )
}

export default function BlogPostFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const key = searchParams.get('slug') || searchParams.get('id')
  const isEdit = Boolean(key)
  const isViewOnly = isEdit && searchParams.get('view') === '1'
  const { showSuccess, showError } = useToast()
  const { confirm, modal } = useConfirmAction()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [record, setRecord] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [categories, setCategories] = useState([])
  const [brandUrl, setBrandUrl] = useState('')
  const [privacyActive, setPrivacyActive] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [baseline, setBaseline] = useState(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [publishAt, setPublishAt] = useState('')
  const [tab, setTab] = useState('details')

  const load = async () => {
    const [p, a, c, content, pages] = await Promise.all([fetchBlogPosts(), fetchBlogAttachments(), fetchBlogCategories(), fetchSiteContent(), fetchSitePages()])
    const err = p.error || a.error || c.error || content.error || pages.error
    if (err) showError(String(err))
    setAttachments(a.data || [])
    setCategories(c.data || [])
    setBrandUrl((content.data || []).find((r) => r.content_key === 'brand.url')?.content_value || '')
    setPrivacyActive((pages.data || []).some((pg) => pg.slug === 'privacy' && pg.is_active))
    if (isEdit) {
      const row = (p.data || []).find((r) => r.slug === key || r.id === key) || null
      setRecord(row)
      if (row) {
        const f = toForm(effectiveBlogPost(row))
        setForm(f)
        setBaseline(f)
        setSlugTouched(true)
      }
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [key])

  const isDirty = useMemo(() => !isViewOnly && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline, isViewOnly])
  const { requestNavigation } = useUnsavedChangesGuard(isDirty, 'You have unsaved post changes.')
  const goBack = () => requestNavigation('/content/blog-posts')

  if (loading) return <LoadingState message="Loading post..." />
  if (isEdit && !record) {
    return (
      <div className="space-y-4 p-6">
        <EmptyState title="Post not found" description={`No post at /blog/${key}.`} />
        <button type="button" onClick={goBack} className={btn}>Back to blog posts</button>
      </div>
    )
  }

  const status = record ? blogPostStatus(record) : 'draft'
  const live = blogPostIsLive(record)
  const slugLocked = Boolean(record?.first_published_at)
  const set = (field) => (e) => {
    const value = e.target.value
    setForm((f) => {
      const next = { ...f, [field]: value }
      if (field === 'title' && !slugTouched && !slugLocked) next.slug = slugifyBlogTitle(value)
      return next
    })
    if (field === 'slug') setSlugTouched(true)
  }
  const setValue = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const found = validateBlogPost(form)
    setErrors(found)
    if (Object.keys(found).length) { showError('Please fix the highlighted fields.'); return }
    setBusy('save')
    if (!record) {
      const { error } = await createBlogPost(form)
      setBusy('')
      if (error) { showError(String(error)); return }
      setBaseline(form)
      showSuccess(`Post /blog/${form.slug} created as a draft. Add downloads, preview, then publish.`)
      navigate(`/content/blog-post?slug=${encodeURIComponent(form.slug)}`, { replace: true })
      return
    }
    const changes = blogPostChanges(baseline, form)
    if (slugLocked) delete changes.slug
    const { error } = await saveBlogPost(record.id, changes)
    setBusy('')
    if (error) { showError(String(error)); return }
    setBaseline(form)
    showSuccess(live ? 'Changes saved as a draft. Publish to show them on the site.' : 'Post saved.')
    if (changes.slug) navigate(`/content/blog-post?slug=${encodeURIComponent(changes.slug)}`, { replace: true })
    else await load()
  }

  const run = async (label, fn, ok) => {
    setBusy(label)
    const res = await fn()
    setBusy('')
    if (res.error) { showError(String(res.error)); return false }
    if (res.cleanupError) showError(`Done, but some old files could not be deleted: ${res.cleanupError}`)
    if (ok) showSuccess(ok)
    return true
  }

  const publish = () => {
    const when = publishAt ? new Date(publishAt) : null
    const future = when && when > new Date()
    confirm({
      title: future ? `Schedule this post for ${when.toLocaleString()}?` : live ? 'Publish these changes?' : 'Publish this post?',
      message: future ? 'It appears on the blog automatically at that time.' : 'Visitors will see it straight away.',
      confirmLabel: future ? 'Schedule' : 'Publish',
      onConfirm: async () => {
        if (await run('publish', () => publishBlogPost(record.id, when ? when.toISOString() : null), future ? 'Post scheduled.' : 'Post published.')) {
          setPublishAt('')
          await load()
        }
      },
    })
  }
  const discard = () => confirm({
    title: 'Discard unpublished changes?', message: 'The post goes back to its published version. Downloads added since then are deleted.',
    confirmLabel: 'Discard', danger: true,
    onConfirm: async () => { if (await run('discard', () => discardBlogPostDraft(record.id), 'Changes discarded.')) await load() },
  })
  const archive = () => confirm({
    title: 'Archive this post?', message: 'It disappears from the blog. Its address shows "no longer available". You can restore it later.',
    confirmLabel: 'Archive', danger: true,
    onConfirm: async () => { if (await run('archive', () => archiveBlogPost(record.id), 'Post archived.')) await load() },
  })
  const restore = () => confirm({
    title: 'Restore this post?', message: 'It comes back as an unpublished draft. Publish it to show it again.',
    confirmLabel: 'Restore',
    onConfirm: async () => { if (await run('restore', () => restoreBlogPost(record.id), 'Post restored as a draft.')) await load() },
  })
  const remove = () => confirm({
    title: 'Delete this draft permanently?', message: 'The post and its downloads are deleted. This cannot be undone.',
    confirmLabel: 'Delete', danger: true,
    onConfirm: async () => { if (await run('delete', () => deleteBlogPost(record.id), 'Draft deleted.')) navigate('/content/blog-posts') },
  })
  const preview = async () => {
    if (!brandUrl) { showError('Set brand.url under Public Site Products → Brand copy first.'); return }
    const win = window.open('', '_blank')
    const { data, error } = await createSitePreviewToken()
    if (error || !data) { win?.close(); showError(String(error || 'Could not create a preview link')); return }
    const url = `${brandUrl.replace(/\/+$/, '')}/blog/${encodeURIComponent(record.slug)}?preview=${encodeURIComponent(data)}`
    if (win) win.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  }

  const field = (name, label, props = {}) => (
    <AdminField label={label} required={props.required} error={errors[name]}>
      {props.multiline
        ? <textarea className={inputClass} rows={props.rows || 2} value={form[name]} onChange={set(name)} maxLength={props.maxLength} placeholder={props.placeholder} />
        : <input className={inputClass} value={form[name]} onChange={set(name)} maxLength={props.maxLength} placeholder={props.placeholder} disabled={props.disabled} />}
      {props.help && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{props.help}</p>}
      {errors[name] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>}
    </AdminField>
  )
  const hasDraftFiles = attachments.some((a) => a.post_id === record?.id && a.state !== 'live')

  return (
    <div className="flex flex-col gap-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <button type="button" onClick={goBack} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Back to blog posts</button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{isViewOnly ? 'View Post' : record ? 'Edit Post' : 'New Post'}</h1>
          {record && <p className="font-mono text-xs text-gray-500">/blog/{record.slug}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record && <AdminBadge label={BLOG_STATUS_BADGE[status].label} variant={BLOG_STATUS_BADGE[status].variant} />}
          {record?.draft && <AdminBadge label="unpublished changes" variant="pending" />}
          {isViewOnly ? (
            <PermissionGate permission="system.public_site.edit">
              <AdminIconActionButton variant="edit" label="Edit" onClick={() => navigate(`/content/blog-post?slug=${encodeURIComponent(record.slug)}`)} />
            </PermissionGate>
          ) : (
            <>
              {record && <button type="button" className={btn} onClick={preview}>Preview</button>}
              <button type="button" onClick={goBack} className={btn}>Cancel</button>
              <button type="submit" form="blog-post-form" disabled={busy === 'save' || !isDirty}
                className="rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60">
                {busy === 'save' ? 'Saving...' : record ? (live ? 'Save draft' : 'Save') : 'Create post'}
              </button>
            </>
          )}
        </div>
      </div>

      <DetailAuditTabList activeTab={tab} onChange={setTab} />

      {tab === 'audit' && !record && <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this post is saved.</p>}
      {tab === 'audit' && record && (
        <AuditDetailsPanel description="Who created, changed and published this post.">
          <AuditCard title="Identity" description="How this post is identified.">
            <AuditField label="Address" value={`/blog/${record.slug}`} />
            <AuditField label="Title" value={record.title} />
          </AuditCard>
          <AuditCard title="Classification" description="Status and grouping.">
            <AuditField label="Status" value={BLOG_STATUS_BADGE[status].label} />
            <AuditField label="Category" value={categories.find((c) => c.id === record.category_id)?.name || null} />
            <AuditField label="Unpublished changes" value={record.draft || hasDraftFiles ? 'Yes' : 'No'} />
          </AuditCard>
          <AuditCard title="Record history" description="When this post was created, changed and published.">
            <AuditField label="Created by" value={record.created_by || null} />
            <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
            <AuditField label="Updated by" value={record.updated_by || null} />
            <AuditTimestampPair dateLabel="Last updated" value={record.updated_at} />
            <AuditField label="Published by" value={record.published_by || null} />
            <AuditTimestampPair dateLabel="First published" value={record.first_published_at} />
            <AuditTimestampPair dateLabel="Publish date" value={record.published_at} />
            <AuditTimestampPair dateLabel="Archived" value={record.archived_at} />
          </AuditCard>
        </AuditDetailsPanel>
      )}

      {tab === 'details' && (
        <>
          <AdminForm id="blog-post-form" onSubmit={isViewOnly ? (e) => e.preventDefault() : handleSubmit}>
            <fieldset disabled={isViewOnly} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 md:p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {field('title', 'Title', { required: true, maxLength: 160 })}
                {field('slug', 'Address (/blog/…)', {
                  required: true, maxLength: 80, disabled: slugLocked,
                  help: slugLocked ? 'Locked: the post has been published and people may have shared the link.' : 'Suggested from the title. Lowercase letters, numbers and hyphens.',
                })}
              </div>
              {field('summary', 'Summary (shown in the list and to search engines)', { multiline: true, maxLength: 400 })}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <AdminField label="Category">
                  <select className={inputClass} value={form.category_id} onChange={set('category_id')}>
                    <option value="">No category</option>
                    {categories.filter((c) => c.is_active || c.id === form.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </AdminField>
                {field('author_name', 'Author name', { maxLength: 120, placeholder: 'e.g. Project Nidus Team' })}
                {field('author_role', 'Author role (optional)', { maxLength: 120 })}
              </div>
              <AdminField label="Cover image (PNG, JPG or WebP, up to 2 MB)" error={errors.cover_image_alt}>
                <CoverPicker url={form.cover_image_url} onChange={(u) => setValue('cover_image_url', u)} disabled={isViewOnly} onError={showError} />
                {form.cover_image_url && <input className={`${inputClass} mt-2`} placeholder="Describe the cover image for screen readers" value={form.cover_image_alt} onChange={set('cover_image_alt')} />}
                {errors.cover_image_alt && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.cover_image_alt}</p>}
              </AdminField>
              <AdminField label="Article">
                <MarkdownEditor value={form.body_md} onChange={(v) => setValue('body_md', v)} disabled={isViewOnly} onError={showError} />
              </AdminField>
            </fieldset>
          </AdminForm>

          {record && (
            <Attachments post={record} attachments={attachments} privacyActive={privacyActive} canEdit={!isViewOnly}
              onChanged={load} confirm={confirm} showError={showError} showSuccess={showSuccess} />
          )}

          {record && !isViewOnly && (
            <PermissionGate permission="system.public_site.edit">
              <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 md:p-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Publishing</h2>
                {status !== 'archived' ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-sm text-gray-700 dark:text-gray-300">Publish date (leave empty for now{live ? ' / keep the current date' : ''})
                      <input type="datetime-local" className={`${inputClass} mt-1 w-60`} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
                    </label>
                    <button type="button" onClick={publish} disabled={isDirty || busy === 'publish'}
                      title={isDirty ? 'Save your changes first' : undefined}
                      className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50">
                      {publishAt && new Date(publishAt) > new Date() ? 'Schedule' : live ? 'Publish changes' : 'Publish'}
                    </button>
                    {(record.draft || hasDraftFiles) && live && <button type="button" className={btn} onClick={discard}>Discard changes</button>}
                    {record.first_published_at && <button type="button" className={btn} onClick={archive}>Archive</button>}
                    {!record.first_published_at && <AdminIconActionButton variant="delete" label="Delete draft" onClick={remove} />}
                  </div>
                ) : (
                  <button type="button" className={btn} onClick={restore}>Restore as draft</button>
                )}
                {isDirty && <p className="text-xs text-gray-500 dark:text-gray-400">Save your changes before publishing.</p>}
                {record.published_at && <p className="text-xs text-gray-500 dark:text-gray-400">Publish date: {fmt(record.published_at)}</p>}
              </section>
            </PermissionGate>
          )}
        </>
      )}
      {modal}
    </div>
  )
}
