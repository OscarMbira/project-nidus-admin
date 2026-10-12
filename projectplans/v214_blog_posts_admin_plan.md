# v214 — Blog Posts and Blog Categories (Admin)

Monorepo PRD/plan: `E:\project-nidus\projectprd\v1263_brand_site_blog_PRD.md` /
`E:\project-nidus\projectplan\v1263_brand_site_blog_plan.md` (slices S2–S5).
Admin SQL: `SQL/v232_blog_posts_admin_rpc.sql`. Prerequisite: monorepo SQL v1263, Admin v225/v231.
Status: **IMPLEMENTED** (approved 2026-10-12).

## Decisions

- Same narrow admin→public pattern as v225/v230/v231 (`system.public_site.view` / `.edit`, audited).
- Posts: draft → preview → publish now / scheduled; edits to live posts are drafts; archive/restore;
  hard delete only for never-published drafts (files removed too). Slug locked after first publish.
- Attachments: PDF/DOCX/XLSX/PPTX/TXT/CSV/PNG/JPG/WebP ≤ 10 MB; open → `site-assets/blog/…`,
  gated → private `site-downloads`; replaced/removed files deleted on publish.
- Body: Markdown textarea with toolbar (H2, bold, italic, bullet, numbered, link, image, quote) + Preview tab.
- Lists: sortable headers, Card/Table toggle (default Table), search, row numbers, export (Admin rules 11–14).
  **Default sort exception:** Blog Posts newest publish date first (publication list); categories by order.
- Site Enquiries: show topic *Download* with document/post and marketing opt-in.

## Tasks

- [x] SQL v232: post list (with drafts), create, save (in place or draft), publish/schedule, discard, archive, restore, delete-draft; attachment add/update/remove/keep; category upsert/delete (refused when used); private-bucket policies; nav nodes; check SELECT
- [x] Services + validators + tests
- [x] Pages: `BlogPostsPage`, `BlogPostFormPage`, `BlogCategoriesPage`; Site Enquiries download columns
- [x] Routes, fallback nav entries
- [x] Build `@nidus-admin/content`; plan review

## Review (2026-10-12)

**Delivered**
- **SQL v232:** 16 RPCs plus three storage policies on `site-downloads`.
  - The check SELECT expects `functions_present_of_16 = 16`, `download_policies_of_3 = 3`, `menu_items_of_2 = 2`.
  - Publish, discard and delete return the storage files to remove. The services delete them afterwards.
  - An upload the database refuses is removed straight away.
- **BlogPostFormPage:** Markdown editor (toolbar, image upload into the text, Preview tab), cover image, attachments (upload, reorder, remove/keep), publishing panel (publish now or schedule, discard changes, archive, restore, delete draft), preview link, Audit tab, unsaved-changes guard.
- **BlogPostsPage:** status and category filters, search, Card/Table, row numbers, export.
- **BlogCategoriesPage:** inline editor with Details and Audit tabs, hide/show, delete only when unused.
- **Site Enquiries:** shows the document name and marketing opt-in (with date) for download leads.

**Validation:** 10 new service tests, 33/33 in the public-site suites. `@nidus-admin/content` builds and lint is clean.

**Notes**
- Admin has no success-modal equivalent yet. Saves use the toast, consistent with the neighbouring Public Site pages.
- The article preview reuses `MarkdownView` (`DocumentationContentView`), which only has dark styles. The preview pane is a dark canvas in both themes.

**Follow-up (2026-10-12, owner request): paste images.** A new `PasteImageButton` (`modules/content/src/components/`) gives the same paste behaviour as the Admin profile picture: click Paste, then Ctrl+V. It uses the shared `fileFromClipboardData`. It appears on:
- the blog cover image;
- the Site Sections image and logo/photo pickers.

The article editor also accepts Ctrl+V with an image: the image is uploaded and inserted at the cursor, while text pastes normally.

**Owner steps:** monorepo v1263 + seed → re-run v1251 → this v232 → `supabase functions deploy site-download` → publish the Privacy page before using email-required downloads.
