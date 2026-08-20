# v173 — Legacy Template Upload (Admin / Global tier)

**Status:** COMPLETE  
**Companion monorepo plan:** `E:\project-nidus\projectplan\v775_legacy_template_upload_plan.md` (implemented as monorepo SQL **v776**)

## Deliverables

| Item | Location |
|------|----------|
| Domain CHECK + create/update/publish RPCs | `SQL/v173_global_legacy_template_domains.sql` |
| Upload UI | `modules/content/src/pages/LegacyGlobalTemplateUpload.jsx` |
| Route | `/content/legacy-template-upload` |
| Storage helper | `getAdminStorageClient()` in `packages/shared/src/supabase.js` |

## Apply

1. Monorepo `v776` → `v776e` (schema + sync)
2. This Admin `v173`
3. Upload legacy → Publish notes → fans out via `public.sync_global_template_node`

## Review

Admin Global Template Library is parent for Global-tier legacy documents and structured lists. Track A (schedules) continues to use `industry_plan` authoring/publish already in place.
