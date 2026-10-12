# v210 — Public Site Products (Admin editing of the Nidus brand site)

Monorepo plan: `E:\project-nidus\projectplan\v1241_nidus_brand_site_plan.md` (Slice 4) ·
PRD: `E:\project-nidus\projectprd\v1241_nidus_brand_site_PRD.md`.
Status: **Implemented 2026-10-11. Awaiting SQL run and owner test.**

## Scope

Admin screen to edit the product cards and brand copy shown on the public Nidus brand site
(`apps/site` in the monorepo). Data: `public.site_products` and `public.site_content` (monorepo
`SQL/v1241_*.sql`). The Admin app is never listed publicly.

## Todo

- [x] **SQL v225** `SQL/v225_site_products_admin_rpc.sql`
  - Permission keys `system.public_site.view` / `.edit` (super_admin, system_admin).
  - RPCs `public.admin_list_site_products`, `admin_upsert_site_product`, `admin_set_site_product_active`, `admin_list_site_content`, `admin_upsert_site_content` (SECURITY DEFINER, permission-gated, audited via `admin.log_admin_action`).
  - The acting admin is taken from the session. A passed `p_admin_user_id` is honoured only for `service_role`.
  - The `admin` slug is refused.
  - Nav node under Content & Localization → Content: "Public Site Products" → `/content/public-site`.
- [x] **Service** `packages/shared/src/publicSiteServices.js`: list/save/toggle + `validateSiteProduct`. Tests: `packages/shared/src/__tests__/publicSiteServices.test.js` (6/6).
- [x] **Pages** (`modules/content`):
  - `PublicSiteProductsPage` (`/content/public-site`): product table/card toggle (default table, remembered), search, sortable headers, `#` row numbers, icon-only View/Edit, Show/Hide with confirm, export, default sort name A→Z then created. Plus a "Brand copy" table.
  - `PublicSiteProductFormPage` (`/content/public-site-product?slug=<slug>[&view=1]`): routed create/view/edit, friendly slug URL (rule 13.1), Details/Audit tabs, unsaved-changes guard, success toast with the slug.
  - `PublicSiteContentFormPage` (`/content/public-site-content?key=<key>[&view=1]`): view/edit one copy entry, Details/Audit tabs.
- [x] **Theme fixes found while building** (Admin rule 28.1 equivalent): `AdminTable` and `ViewToggle` were dark-only (unreadable in light mode). Light-mode pairs added; dark mode unchanged. Admin UI tests 42/42.
- [x] **Docs:** cross-schema exception added to Admin `CLAUDE.md` and monorepo `CLAUDE.md` rule 34.5.
- [x] **Build:** `@nidus-admin/content` builds.

## Owner steps

1. Run monorepo `SQL/v1241_site_products_and_content.sql`, then `SQL/v1241_site_products_and_content_seed.sql`.
2. Run Admin `SQL/v225_site_products_admin_rpc.sql`.
3. In Admin → Content → Public Site Products:
   - set the production URLs for each card;
   - set the `brand.url` copy entry.

## Findings outside this scope (reported to the owner)

- **Security:** `COALESCE(p_admin_user_id, admin.current_admin_user_id())` appears 276 times in 67 Admin SQL files, including user management, impersonation (v12), subscriptions and billing.
  - These RPCs are executable by any authenticated Supabase user, Platform and Simulator users included.
  - A caller who knows an active admin's `admin_users.id` can act with that admin's permissions.
  - Recommended: a central check that rejects a supplied `p_admin_user_id` that differs from the session admin unless the caller is `service_role`, as v225 does, applied to all existing RPCs in one migration.
- Pre-existing test failures in `packages/shared`: `shared.test.js` imports a non-existent `../src/index.js`; one `documentationContentUtils` Markdown assertion.
