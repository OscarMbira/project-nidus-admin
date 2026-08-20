# v179 — System-wide curated offline completion instructions (Admin Global Templates)

**Repo:** `E:\project-nidus-admin`  
**Companion:** `E:\project-nidus\projectplan\v781_systemwide_form_template_curated_offline_guidance_plan.md`  
**Related:** `v174`, `v178` (generics — superseded)  
**Status:** ✅ Complete — all F001–F068 form_template fields

## Problem

v178 filled missing help with generic “Briefly complete…” text. Offline PDFs (e.g. F004, F050) were self-explanatory in layout only.

## What shipped

| Artifact | Purpose |
|----------|---------|
| `SQL/v179_global_form_template_curated_guidance_seed.sql` | Overwrite `payload.schema` `help`/`sample` for all form templates |
| `SQL/v179b_curated_guidance_boilerplate_smoke.sql` | Count leftover boilerplate (expect 0) |
| Docs | `Documentation/Global_Template_Export_Guide.md` updated |

Generated via monorepo `scripts/v781_build_curated_guidance_seeds.mjs` (shared catalog with Platform/Sim).

## Apply

1. Run `SQL/v179_global_form_template_curated_guidance_seed.sql`
2. Run `SQL/v179b_…` smoke (expect 0)
3. **Publish** affected / all form_templates so synced orgs pick up schema help
4. Apply monorepo `SQL/v781_…` so org Default Content boilerplate is replaced
5. Re-export F004 / F050 Plain PDF to verify

## Review

Admin Global Template Library now carries curated offline guidance and samples for the full F001–F068 catalog. v178 generic filler is superseded.
