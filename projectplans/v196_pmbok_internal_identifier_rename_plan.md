# v196 — Rename internal `pmbok` identifier to `standards_based`

**STATUS: COMPLETE.** Companion: `project-nidus/projectplan/v797_pmbok_internal_identifier_rename_plan.md` (monorepo SQL is **v798** — v797 was already used for display-label-only rename).

## Why
Companion to monorepo identifier rename. Follow-up to v194 (display-label rename). Renames the underlying data value itself — `admin.global_template_library.methodology = 'pmbok'` and URL query `?methodology=pmbok` → `standards_based`.

## Rename table
`pmbok` → `standards_based` everywhere it is a stored/matched value (not display text — already done in v194).

## Code files
- `packages/shared/src/defaultAdminNav.js` — all `methodology=pmbok` query strings → `methodology=standards_based`
- `modules/content/src/pages/GlobalTemplateLibraryList.jsx` — chip value + `CATEGORIES_BY_METHODOLOGY.standards_based`
- `modules/content/src/pages/DefaultContentLibraryPage.jsx` — same
- `modules/content/src/pages/GlobalTemplateLibraryForm.jsx` — dropdown value
- Tests: `defaultAdminNav.globalTemplates.test.js`, `globalTemplateServices.test.js`, `globalTemplateMethodologyFilters.test.js`, `navServices.test.js`

## Database
`SQL/v196_rename_pmbok_methodology_to_standards_based.sql`:
1. Drop/re-add `chk_gtl_methodology` with `'standards_based'`
2. `UPDATE ... SET methodology = 'standards_based' WHERE methodology = 'pmbok'`
3. Re-issue `admin.create_global_template` + `admin.update_global_template` (bodies from v185) with validation list swapped
4. `admin.publish_global_template` unchanged (passes row.methodology through to `public.sync_*` — requires monorepo **v798**)

**Note:** Admin mirror `SQL/v191_fix_level_template_sync_domain_ref.sql` contains `public.sync_global_template_node` validation — that live function is superseded by monorepo v798, not by editing v191.

## Todo
- [x] Confirm this plan before executing
- [x] Re-check `v191_fix_level_template_sync_domain_ref.sql` — it superseded v185's *public* sync body for domain_ref; create/update still from v185; monorepo v798 re-issues sync from v795 base
- [x] Update JS files (defaultAdminNav.js + 3 pages)
- [x] Update test fixtures
- [x] Write new SQL migration: constraint + create/update re-issues + data UPDATE
- [x] Re-run `@nidus-admin/shared` test suite (30 tests passed: nav + services + methodology filters)
- [x] Coordinate apply order with monorepo v798

## Review
**Completed 2026-07-22.**

### Delivered
| Area | Artifact |
|---|---|
| Nav / filters | `defaultAdminNav.js` + List / Default Content / Form pages use `standards_based` |
| Tests | Admin shared suite updated; 30/30 passed |
| SQL | `SQL/v196_rename_pmbok_methodology_to_standards_based.sql` |
| Docs | `Documentation/Global_Template_Library_Methodology_Guide.md` |
| Companion | Monorepo JS rename + `SQL/v798_rename_pmbok_identifier_standards_based.sql` |

### Apply order (Supabase SQL Editor)
1. Monorepo **`SQL/v798_rename_pmbok_identifier_standards_based.sql`** (public/sim CHECKs, menu_codes, sync functions)
2. Admin **`SQL/v196_rename_pmbok_methodology_to_standards_based.sql`** (admin GTL + create/update RPCs)

### Smoke
After apply: open Admin Global Template Library → Standards-Based leaf (`?methodology=standards_based`); publish a template to Platform/Simulator should accept the new methodology value.
