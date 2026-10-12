# v215 — Public site header settings (Admin) — plan

**Monorepo PRD / plan:** `E:\project-nidus\projectprd\v1264_product_led_site_headers_PRD.md` · `E:\project-nidus\projectplan\v1264_product_led_site_headers_plan.md` (slice S4)
**Status:** implemented 2026-10-12 (owner approved the v1264 plan).

## Scope
An Admin editor for each public header's colours and main button (Brand site, Platform, Simulator, Planner). It writes `public.site_header_settings` (monorepo SQL v1264) through new SECURITY DEFINER RPCs. This extends the v225/v230 narrow admin→public write exception.

## Tasks
- [x] `SQL/v233_site_header_settings_admin_rpc.sql`:
  - `admin_list_site_header_settings`, `admin_upsert_site_header_settings` (gated by `system.public_site.view` / `.edit`; validates scope, hex, WCAG AA 4.5:1, label, address; audited by `admin.log_admin_action`)
  - `nav_nodes` entry "Public Site Headers" (sort 166)
- [x] `packages/shared/src/publicSiteServices.js`: `contrastRatio`, `validateSiteHeaderSettings`, `fetchSiteHeaderSettings`, `saveSiteHeaderSettings`, `siteHeaderLabel` (contrast maths replicated from the monorepo's `siteColors.js`, not imported).
- [x] `packages/shared/src/defaultAdminNav.js`: menu fallback entry.
- [x] `modules/content`:
  - `SiteHeadersPage` (`/content/site-headers`): table with #, swatches, button, target, status; search; export; icon-only View/Edit.
  - `SiteHeaderFormPage` (`/content/site-header?scope=…[&view=1]`): live preview, colour picker + hex, contrast readouts, Save blocked below 4.5:1, unsaved-changes guard, Audit tab, back link.
  - Routes registered.
- [x] Tests: `packages/shared/src/__tests__/publicSiteHeaders.test.js`.

## Review
- Success feedback uses the Admin toast, matching every other public-site form here. Admin has no shared success modal yet (monorepo rule 16's "Admin-app equivalent").
- `p_admin_user_id` follows the existing pattern; the pre-existing finding is tracked in v210.
- Page-level component tests are not set up for Admin modules. The rules that block a save are covered by the service tests.
- Run order: monorepo v1264 (+ seed) first, then this v233.
