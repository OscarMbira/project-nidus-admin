# v173 — Global Template Library: Domain Coverage Investigation & Fix

**Status:** COMPLETE (100%)  
**Date completed:** 2026-07-17  
**Repo:** `E:\project-nidus-admin` (this plan) + monorepo `SQL/v777_form_opa_process_global_template_sync.sql`  
**Trigger:** Library showed mostly `industry_plan` rows; user asked why other template types were missing.

## Versioning note

- Plan id remains **v173**, but Admin SQL for this work is **`v174` / `v174b` / `v174c`** because **`v173_global_legacy_template_domains.sql`** already existed (legacy upload).
- Monorepo sync is **`v777`** (not `v776_form_opa…`) because **`v776*`** was used for legacy document/structured-list upload.

## Investigation (confirmed)

1. **Not a bug** — the one `fields` row is present; 50:1 skew made it hard to see. Fixed by Part A domain tabs.
2. **Real gap** — `form_template`, `opa`, and `process_template` were never wired for Global authoring/publish/sync (same class of gap `industry_plan` had before v166).

---

## Todo

- [x] **Part A:** domain filter/tabs on `GlobalTemplateLibraryList.jsx`, reading `domain`/`category`/`ka` from URL query params; Planning knowledge-area chips
- [x] **Part B:** Admin `SQL/v174_form_opa_process_global_domains.sql` + monorepo `SQL/v777_form_opa_process_global_template_sync.sql` — `form_template` fans out to public+sim; `opa` + `process_template` catalogs
- [x] **Part B:** Form payload editors (`FormTemplatePayloadEditor`, `OpaPayloadEditor`, `ProcessTemplatePayloadEditor`) on `GlobalTemplateLibraryForm.jsx`
- [x] **Part C:** `SQL/v174b_global_form_templates_seed.sql` (F001–F068 → GTL by `template_code`, category = process group); Forms nav (`v174c` + `defaultAdminNav.js`)
- [x] **Part D:** Process Docs nav + dynamic-dispatch sync; **nullable `project_id` for masters already shipped in monorepo `v632`** (no re-migration needed)

## Apply order

1. Monorepo: `SQL/v777_form_opa_process_global_template_sync.sql`
2. Admin: `SQL/v174_form_opa_process_global_domains.sql`
3. Admin: `SQL/v174b_global_form_templates_seed.sql` (requires Platform `form_templates` / v506)
4. Admin: `SQL/v174c_forms_process_docs_nav.sql`

## Review

### Completed 2026-07-17

| Part | Outcome |
|------|---------|
| A | Domain tabs with counts; URL `?domain=&category=&ka=`; Planning KA chips |
| B | Create/update/publish accept `form_template` / `opa` / `process_template`; sync materialises catalogs + per-account nodes |
| C | Seed copies live F0xx into Global library with process-group categories; sidebar Forms group (6 items) |
| D | Process Docs nav (5 items); sync dispatches across 24 tables; v632 already nullable masters |

**Follow-up seed (2026-07-17):** Empty OPA / Process Template / Legacy Document / Structured List tabs were expected — only Forms (`v174b`) and Industry Plans were seeded. Apply Admin `SQL/v176_global_opa_process_legacy_seeds.sql` for sample rows (6 OPA, 24 process masters, 4 legacy stubs, 4 structured lists). Legacy stubs use placeholder storage paths; replace via **Upload legacy** when real files are needed.
