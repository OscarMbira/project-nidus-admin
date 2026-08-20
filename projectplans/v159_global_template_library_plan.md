# v159 — Global Template Library (Admin app)

**Status:** COMPLETE (Phase 1)
**Repo:** `E:\project-nidus-admin` (this plan) — companion to the monorepo's `E:\project-nidus\projectplan\v764_project_management_template_hierarchy_plan.md`, Phase 1
**Depends on:** monorepo Phase 0 (complete) + monorepo `SQL/v765_global_template_sync_rpc.sql`

## Scope for this phase

Nidus staff author, version, and publish **Global Templates** here. On publish, published content is synced into the monorepo's `public`/`sim` schemas as `pm_template_nodes` rows (`tier='pmo'`, `is_system_synced=true`) that PMO Admins then inherit from.

**Domain scope for this phase: `domain='fields'` only.**

## Key decisions

1. **No new Admin module** — lives in **`content`** module (port 5189), role **`content_admin`**.
2. **Reuse Record Lifecycle** — `admin.global_template_library` registered via `record_lifecycle_config`.
3. **Sync via same-DB SECURITY DEFINER RPC** — `admin.publish_global_template` → `public.sync_global_template_node` (monorepo `v765`).
4. **Monorepo owns sync RPC SQL**; Admin owns authoring + publish wrapper.

## Todo
- [x] `SQL/v160`–`v163` — tables, RLS/CRUD RPCs, lifecycle seed, nav seed
- [x] Monorepo: `public.sync_global_template_node` / `sim.sync_global_template_node` (`SQL/v765_global_template_sync_rpc.sql`)
- [x] `SQL/v164` — `admin.publish_global_template`
- [x] `modules/content/src/pages/GlobalTemplateLibrary{List,Form,Detail}.jsx`
- [x] Routes in `modules/content/src/index.jsx`
- [x] Nav seed + `defaultAdminNav.js` fallback
- [x] Document cross-schema write exception in both `CLAUDE.md` files
- [x] Update monorepo `v764` plan Phase 1 status
- [x] Module guide `modules/content/docs/Global_Template_Library_Guide.md`
- [x] Unit tests for sync-status helpers

## Review

### Completed 2026-07-16

**Admin SQL:** `v160` tables + permissions · `v161` RLS + create/update/archive RPCs · `v162` lifecycle config/authoriser · `v163` nav · `v164` publish wrapper.

**UI:** List (search, card/table, row numbers, sync badges), Form (fields builder, unsaved-changes guard, field-lock when `unauthorised`), Detail (lifecycle panel, publish with required notes, archive, version snapshots).

**Services:** `packages/shared/src/globalTemplateServices.js`.

**Apply order:** monorepo `v764`→`v765`, then Admin `v160`→`v164`.
