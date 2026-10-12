# v213 — Site Sections editor (Admin)

Monorepo PRD/plan: `E:\project-nidus\projectprd\v1262_brand_site_marketing_homepage_PRD.md` /
`E:\project-nidus\projectplan\v1262_brand_site_marketing_homepage_plan.md` (slices S4–S6).
Admin SQL: `SQL/v231_site_sections_admin_rpc.sql`. Prerequisite: monorepo SQL v1262, Admin v225.
Status: **IMPLEMENTED** (approved 2026-10-12).

## Decisions

- Same narrow admin→public pattern as v225/v230: `public.admin_*` SECURITY DEFINER RPCs gated by
  `system.public_site.view` / `.edit`, audited. CLAUDE.md exception text extended to `site_sections`
  and the `site-assets` bucket.
- Edits save to the row's `draft`; **Publish** (per page, confirm first) copies drafts live in one
  transaction; **Discard draft** per section. Hide instead of delete.
- **Preview drafts** mints a 60-minute token (stored hashed) and opens the brand site with `?preview=`.
- Item lists (features, steps, FAQ, logos, quotes, value points, audience links) edited as a table:
  add / edit / delete (confirm) / move up/down. Fields per type follow the PRD.
- Image upload to bucket `site-assets` (PNG/JPG/WebP/SVG, ≤ 2 MB), alt text required.
- Default sort: the page's section order (sort_order) — the order is the content (documented exception to rule 12.1).

## Tasks

- [x] SQL v231: list (with drafts), save draft, discard draft, add section, reorder, show/hide, publish page, mint preview token; nav node "Site Sections"; check SELECT
- [x] Services + validators in `publicSiteServices.js`; tests
- [x] Pages: `SiteSectionsPage` (page picker, ordered list, status, Preview, Publish) and `SiteSectionFormPage` (`?page=&key=`, fields by type, item table, image upload, Audit tab)
- [x] Routes, fallback nav entry
- [x] Build `@nidus-admin/content`; plan review

## Review (2026-10-12)

**Delivered**
- **SQL v231**
  - `admin_check_site_section_changes` checks allowed keys, button links, items and https images.
  - RPCs for list, save draft, add, discard, reorder, publish and preview link.
  - `auth_can_edit_public_site()` plus three storage policies on `site-assets`.
  - A "Site Sections" nav node.
  - Ends with a check SELECT. Expect `functions_present_of_7 = 7`, `upload_policies_of_3 = 3`, `menu_items_of_1 = 1`.
- **Services** replicate the monorepo section types and validator. `uploadSiteAsset` checks type and size before upload; the bucket enforces both too.
- **Pages**
  - `SiteSectionsPage`: page picker, ordered list, move ↑↓, show/hide, add, Preview, and Publish with a confirmation.
  - `SiteSectionFormPage`: fields per type, item table with confirm-before-delete, image upload, Discard draft, and an Audit tab.

**Validation:** 9 new tests; the public-site suites pass 23/23. `@nidus-admin/content` builds and lint is clean.

**Notes**
- `lucide-react` is not a dependency of the content module, so the move buttons use ↑ ↓ text.
- Admin has no success-modal equivalent yet. Saves use the toast, consistent with the neighbouring Public Site pages.

**Owner steps:** monorepo v1262 + seed → re-run v1251 → this v231 → Admin → Content & Localization → Content → Site Sections → Preview → Publish.
