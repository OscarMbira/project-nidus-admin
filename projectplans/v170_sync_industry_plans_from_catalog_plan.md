# v170 — Sync industry plans from Platform catalog into Global Template Library

**Status:** COMPLETE  
**Problem:** Running `SQL/v772b_seed/batches/*` fills `public.pmo_industry_templates` only. Admin UI lists `admin.global_template_library`. Without an explicit sync step, new industries (e.g. Insurance & Underwriting Transformation) never appear.

## Deliverables

| Item | Location |
|------|----------|
| Status + sync RPCs | `SQL/v170_sync_industry_plans_from_catalog_rpc.sql` |
| List UI banner + **Sync from Platform catalog** | `modules/content/src/pages/GlobalTemplateLibraryList.jsx` |
| Client helpers | `packages/shared/src/globalTemplateServices.js` |
| v169 becomes thin wrapper | `SQL/v169_global_template_v772b_industries_catchup.sql` |

## Apply

1. Monorepo `v772b_seed/batches` (if not already)
2. Admin `v170_sync_industry_plans_from_catalog_rpc.sql`
3. Refresh Global Template Library — or click Sync if anything still missing

## Review

Auto-sync on v170 apply inserts/publishes missing `industry_code`s. UI exposes the same RPC for future catalog expansions.

**Superseded UX (v171):** Steady-state parent is Global Template Library → Publish to Platform/Simulator. The list button is now **Import missing from Platform (bootstrap only)** and only when `missing_count > 0`. See `v171_global_template_library_parent_ux_plan.md`.
