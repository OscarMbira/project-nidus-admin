# v212 — Public site pages, menus and enquiries (Admin)

Monorepo plan: `E:\project-nidus\projectplan\v1241_nidus_brand_site_plan.md` — Amendment A, task A6.
Monorepo SQL (run first): `E:\project-nidus\SQL\v1260_site_nav_pages_and_enquiries.sql` (+ `_seed.sql`).
Admin SQL: `SQL/v230_site_nav_pages_enquiries_admin_rpc.sql`.

## Goal

The brand site now owns the common pages (About, Contact, Blog, Resources, Solutions, Terms, Privacy)
and the shared header/footer menus used by the brand site, Platform, Simulator and Planner. Admins
need to edit those pages and links, keep each product's Pricing/Documentation addresses, and read
the messages sent from the Contact page, without a code deploy (rule 25.1).

## Decisions

- Same narrow admin→public write pattern as v210/v225: `public.admin_*` SECURITY DEFINER RPCs gated by
  `system.public_site.view` / `.edit`, audited via `admin.log_admin_action`. No new permission keys.
- Pages are hidden, never deleted (links to hidden pages are hidden by the site). Renaming a page's
  slug moves the links that point at it.
- Menu links may be deleted (confirm first); they hold no content.
- A link goes to a brand-site page **or** an address (https://… opens in a new window; `/…` is an
  in-app path, used by product bars).
- Enquiries: read + status only (new → in progress → answered / closed / spam). Reply happens by
  email (`mailto:`). **Default sort exception (rule 12.1):** newest first, because it is an inbox.
- Friendly URLs: `?slug=` for pages, `?key=` for links, `?ref=` (8-character reference the visitor
  saw) for enquiries.
- `admin_upsert_site_product` is replaced (old signature dropped) to also save `pricing_url` /
  `docs_url`.

## Tasks

- [x] SQL v230: product upsert + nav link list/upsert/delete + page list/upsert + enquiry list/status + 2 nav nodes + check SELECT
- [x] `publicSiteServices.js`: nav/page/enquiry services, validators, `siteNavGroupLabel`, `siteEnquiryReference`; product pricing/docs
- [x] Pages: `PublicSitePagesPage`, `PublicSitePageFormPage`, `PublicSiteLinkFormPage`, `SiteEnquiriesPage`, `SiteEnquiryDetailPage` (Audit tab on each record page)
- [x] Product form: Pricing page URL + Documentation URL fields; "family bar" wording → shared header
- [x] Routes in `modules/content/src/index.jsx`; fallback nav entries in `defaultAdminNav.js`
- [x] Tests: `packages/shared/src/__tests__/publicSiteNavPages.test.js` (8) + existing service tests (6) pass
- [x] Build: `pnpm turbo build --filter=@nidus-admin/content` passes

## Run order

1. Monorepo `SQL/v1260_site_nav_pages_and_enquiries.sql`, then `SQL/v1260_site_nav_pages_and_enquiries_seed.sql`
2. Admin `SQL/v230_site_nav_pages_enquiries_admin_rpc.sql` (expects `functions_present_of_7 = 7`, `menu_items_of_2 = 2`)
3. Sidebar: Content & Localization → Content → **Public Site Pages & Menus** and **Site Enquiries**

## Review

Admin can now edit every piece of the shared header/footer and the brand site's common pages, and
works the Contact inbox. All writes stay behind the v225 permission helper; no client table
privileges were added. Badge colours reuse the existing `AdminBadge` variants. Remaining risk:
brand-site visitors see page/link edits on their next page load, but the prerendered HTML search
engines read updates only on the next site build; the
product apps pick them up within the 10-minute header cache.
