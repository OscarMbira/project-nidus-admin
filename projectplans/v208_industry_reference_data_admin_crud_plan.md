# v208 — Industry Reference Data: Admin CRUD

**Status: COMPLETE**

Companion to the monorepo's `E:\project-nidus\projectplan\v918_saas_industry_tenant_provisioning_plan.md`,
Phase 8 ("Admin governance"). See that plan for the full initiative's PRD/decisions. This file
covers only the Admin-side implementation.

## Scope

Admin CRUD for four monorepo-owned `public`-schema reference tables that had no admin surface:
`industry_categories`, `industry_segments`, `industry_packs` (+ `industry_pack_menu_items`
curation), `professional_roles`.

## Architecture decision (confirmed with user before implementation)

These tables live in the monorepo's `public` schema, not `admin`. Rather than proxying through
an `admin`-schema RPC (the Global Templates precedent), new RPCs live directly in `public`
(same place as `provision_organisation_tenant`), each internally gated by
`admin.check_admin_permission()` — the mirror image of `admin.publish_global_template` calling
`public.sync_global_template_node`. Chosen because these are pure reference-data tables with no
admin-specific business logic to layer on top; one RPC per action instead of two.

"Delete" is soft (`is_active = FALSE`) for all four tables, never a hard `DELETE` — other
tables' rows reference these (roles/project_roles/industry_segments/industry_packs/
account_industries/users.professional_role_id), so a hard delete would cascade-destroy
dependents or fail on FK violation. Matches the "disable-only" philosophy already established
for `organisation_disabled_capabilities`.

One shared permission pair (`system.industries.view` / `system.industries.edit`) covers all
four tables — one cohesive admin domain, matching the `system.currencies.edit` /
`system.id_generation.edit` precedent size.

## What was built

- `SQL/v208_industry_reference_admin_rpcs.sql` — permission keys + role grants +
  create/update/deactivate RPCs for all four tables, plus
  `admin_set_industry_pack_menu_items` (replace-all semantics for the pack curation picker).
- `SQL/v209_industry_reference_admin_nav.sql` — sidebar nav under a new `system-security:
  industries` group (sibling of the existing "ID Generation" group), one item per table.
- `packages/shared/src/industryReferenceServices.js` — reads via `getPublicDb()` direct
  queries, writes via the new RPCs. Exported from `packages/shared/src/index.js`.
- 8 new pages in `modules/system/src/pages/` (list + form pair per table, non-modal per rule
  18): `ProfessionalRolesPage`/`ProfessionalRoleFormPage`,
  `IndustryCategoriesPage`/`IndustryCategoryFormPage`,
  `IndustrySegmentsPage`/`IndustrySegmentFormPage`,
  `IndustryPacksPage`/`IndustryPackFormPage`. Routes registered in `modules/system/src/
  index.jsx` (`/system/professional-roles`, `/system/industry-categories`,
  `/system/industry-segments`, `/system/industry-packs`, plus each table's `-form` route).
- Industry Pack's form page includes the menu-item curation picker (searchable checkbox list
  over `public.menu_items`, replace-all save via `admin_set_industry_pack_menu_items`) — only
  available once the pack itself has been saved (needs a real `industry_pack_id`).
- Audit tab (rule 16.1) on every form page — Identity / Classification / Record history, using
  `DetailAuditTabList`/`AuditDetailsPanel`/`AuditCard`/`AuditField`/`AuditTimestampPair` from
  `@nidus-admin/ui`.
- `useUnsavedChangesGuard` (rule 6) on every form page.
- `PermissionGate permission="system.industries.edit"` (from `@nidus-admin/shared`, not
  `@nidus-admin/ui` — caught via an import-path mismatch during syntax checking) around every
  create/edit/deactivate action; `AdminIconActionButton` (rule 15) for row/detail-bar actions.
- Theme-aware (rule 8) — light/dark Tailwind pairs on every new element `AdminField`/
  `inputClass` didn't already cover.

## Known gaps / not done in this slice

- **No Playwright e2e coverage** and **no module documentation guide** added yet (Admin
  CLAUDE.md's "Documentation & Testing" section normally requires both for a new feature) —
  flagged rather than silently skipped; add when this surface is next touched or on explicit
  request.
- **Not yet run**: `v208_industry_reference_admin_rpcs.sql` and
  `v209_industry_reference_admin_nav.sql` need manual execution via the Supabase SQL editor
  (same as every SQL file this session) before the new pages will work end-to-end.
- No manual click-through testing performed (no browser/dev-server access in this
  environment) — needs verification once the SQL above has run.
