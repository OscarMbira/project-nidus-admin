# v195 — ID Generation for Global Templates (+ seed / backfill)

## Decision (confirmed)
- **A only** — `admin.global_template_library` + `admin.global_template_versions`
- **Sequential** — `GTL-0001` / `GTV-0001` (4 digits, no date, no scope)

## Todo
- [x] Confirm scope A only + sequential
- [x] Infrastructure SQL (`display_id` + generate on create)
- [x] Seed SQL (rules + backfill)
- [x] UI: show display ID on list/detail
- [x] Tests + short doc
- [x] Review section after ship

## Deliverables
| Artifact | Path |
|----------|------|
| Infra SQL | `SQL/v193_global_template_id_generation.sql` |
| Seed SQL | `SQL/v193b_global_template_id_generation_seed.sql` |
| Guide | `Documentation/Global_Template_Display_IDs_Guide.md` |
| UI | `GlobalTemplateLibraryList.jsx`, `GlobalTemplateLibraryDetail.jsx` |
| Defaults | `idGenerationTableDefaults.js` prefers GTL/GTV |
| Tests | `globalTemplateServices.test.js` (v195 contract) |

## Apply (Supabase SQL Editor)
1. `SQL/v193_global_template_id_generation.sql`
2. `SQL/v193b_global_template_id_generation_seed.sql`

## Review
### What shipped
1. **`display_id`** on library + versions with unique partial indexes.
2. **`admin.trg_apply_admin_display_id`** AFTER INSERT triggers (skips quietly if no active rule yet — safe for content seeds before v193b).
3. **Sequential rules** GTL / GTV via create/update RPCs; backfill existing rows in stable order.
4. **`database_tables`** registry rows for both tables.
5. **UI** shows ID on list (column + cards), detail header, and success toasts; search placeholder mentions ID.
6. **Form defaults** prefer GTL/GTV when picking those target tables in ID Generation UI.

### Not in scope
Downstream `pm_template_nodes` / process document tables (option B declined).
