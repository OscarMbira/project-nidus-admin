# v216 — Register custom-field limit setting (Admin)

**Monorepo PRD/plan:** `E:\project-nidus\projectprd\v1311_local_register_custom_fields_PRD.md` / `E:\project-nidus\projectplan\v1311_local_register_custom_fields_plan.md` (decisions D6, D15)
**Status:** Approved 2026-10-21 · Implemented 2026-10-22 · SQL not yet run

## Goal

System Admin can set the maximum number of custom fields an organisation may attach to any one local register: a global default (initially 30) and optional per-organisation overrides.

## SQL (`SQL/v242_local_register_custom_field_limit_admin_rpc.sql`)

Narrow Admin → public write exception (same shape as v227/v236), gated by a new permission `system.register_custom_fields.edit` (view: `system.register_custom_fields.view`), every change written to `admin.log_admin_action` with a reason:

- `public.admin_register_custom_field_get_settings()` → default limit + overrides (with organisation names).
- `public.admin_register_custom_field_set_default(p_limit, p_reason)` — 1–200.
- `public.admin_register_custom_field_set_override(p_account_id, p_limit, p_reason)` — upsert.
- `public.admin_register_custom_field_remove_override(p_account_id, p_reason)`.
- Permission seed rows for the two new permissions.

Requires monorepo `SQL/v1311` (tables) first.

## UI

- New page `modules/system/src/pages/RegisterCustomFieldLimitsPage.jsx` (follows `PlannerMenuAvailabilityPage.jsx`): default limit card (number input + reason + Save), overrides table (organisation, limit, edit/remove icon actions, search, row numbers, sort), "Add override" with searchable organisation picker.
- Register route + System sidebar menu entry; theme-aware; success modal on save (rule equivalents in Admin CLAUDE.md).

## CLAUDE.md

Add the v1311 / Admin v242 narrow write exception to both `E:\project-nidus\CLAUDE.md` (rule 34.5 list) and the Admin `CLAUDE.md`.

## Checklist

- [x] v242 SQL + permissions
- [x] Page + route + menu
- [x] Tests — `packages/shared/src/__tests__/registerCustomFieldLimitServices.test.js` (limit validation + nav entry). RPC permission gate and page interactions are **not** covered by automated tests yet (see Review).
- [x] CLAUDE.md lines (both repos)
- [x] Review section

## Review (2026-10-22)

**Delivered:** `SQL/v242_local_register_custom_field_limit_admin_rpc.sql` (2 permissions → super_admin/system_admin, 5 RPCs, nav node `/system/register-custom-fields`); `packages/shared/src/registerCustomFieldLimitServices.js` (+ export); `modules/system/src/pages/RegisterCustomFieldLimitsPage.jsx` + route; fallback nav entry in `defaultAdminNav.js`; CLAUDE.md exception (both repos); `Documentation/Register_Custom_Field_Limits_v216_Guide.md`.

**Deviations:** confirmations use the Admin `useToast` + `useConfirmAction` (reason-required) pattern of `PlannerMenuAvailabilityPage`, not a success modal — Admin has no success-modal component. Organisation picker is a debounced server search (25 results) rather than `SearchableSelect`, so it scales to any number of organisations.

**Validation:** SQL parsed with the PostgreSQL parser (libpg-query); page/services compile (esbuild); 3 unit tests pass. The Admin `system` module has no lint config, so it was not linted.

**Not verified:** SQL not executed (owner runs it after monorepo v1311); permission gate and audit rows not exercised against a database; page not opened in a browser.
