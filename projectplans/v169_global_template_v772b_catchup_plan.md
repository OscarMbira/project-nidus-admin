# v169 — Global Template Library catch-up for v772b industries

**Status:** COMPLETE  
**Repo:** `E:\project-nidus-admin`  
**Companion monorepo:** `SQL/v772b_seed/` + draft `projectplan/v772c_new_industry_content_draft.md`

## Problem

Admin Global Template Library showed only the original ~30 `industry_plan` rows (e.g. Construction, Financial Services). New v772c industries such as **Insurance & Underwriting Transformation** were missing because:

1. `SQL/v772b_industry_template_catalog_expansion.sql` is a pointer (no data), and/or  
2. `SQL/v772b_seed/batches/*` were never applied to `public.pmo_industry_templates`, and/or  
3. Admin `v167` ran **before** the catalog expansion — it only mirrors what exists in `public` at run time.

## Fix

| Step | File |
|------|------|
| Seed public catalog (20 industries) | Monorepo `SQL/v772b_seed/batches/batch_01…05.sql` |
| Insert + publish missing Admin rows | Admin `SQL/v169_global_template_v772b_industries_catchup.sql` |

`v169` fails with a clear error if the public catalog still has zero of the 20 codes.

## Todo

- [x] `SQL/v169_global_template_v772b_industries_catchup.sql`
- [x] Update `SQL/v772b_seed/README.md` apply order (Admin step)
- [x] Guide note

## Review

Operator must apply monorepo batches **then** Admin `v169`. Re-run safe.
