# v167 — Global Template Library: Industry Plan Bulk Population & Sidebar Reorganisation

**Status:** COMPLETE  
**Repo:** `E:\project-nidus-admin` (this plan). No monorepo changes needed — `SQL/v773_global_industry_template_sync.sql` (monorepo) already provides everything this plan calls into; confirmed by direct read.  
**Cross-reference:** `E:\project-nidus\projectplan\v772_industry_template_springboard_content_plan.md` (monorepo) — this closes the gap it left open (mechanism built, zero content ever pushed through it).

## Diagnosis this plan addresses
1. `admin.global_template_library` has exactly one row ("Project Charter Core Fields", `domain='fields'`). The `domain='industry_plan'` authoring/publish path (`SQL/v166_global_industry_template_domain.sql`) is real and functional, but **nothing has ever been created through it** — the 30 (soon 50) industries live entirely in the monorepo's `public.pmo_industry_templates`, authored directly in Platform, with zero relationship to this table.
2. "Global Template Library" is currently buried three levels deep (`Content & Localization` → `Content` → `Global Template Library`), and its `nav_nodes.sort_order` (40) doesn't match its siblings (103–106) — a live DB-driven render would put it first in that group unexpectedly, not third as currently seen (the screenshot reflects the hardcoded JS fallback order, not the DB order).
3. **Audit result — no redundant "Global Template" pointers exist to remove.** I grepped every admin SQL file that touches `nav_nodes` for "template": the only other matches are **"Email Templates"** (`/content/email-templates`, email content templating) and **"Notification Templates"** (`/system/notification-templates`, system notification templating) — both are legitimately distinct features, not stale/duplicate Global Template Library pointers. Nothing to remove here; this item of the request is confirmed clean.

---

## Part A — Bulk-populate `industry_plan` domain from existing Platform content

**Status: COMPLETE**

**File:** `SQL/v167_global_template_industry_bulk_populate.sql`

For every active row in `public.pmo_industry_templates`:

1. Builds the JSON payload shape `public.sync_global_template_node` expects for `domain='industry_plan'`.
2. `INSERT`s one `admin.global_template_library` row per industry (`domain='industry_plan'`, `category = 'international best practice'`, `record_status = 'live'`).
3. Idempotent via `payload->>'industry_code'` — re-run picks up new industries only.
4. Calls `admin.publish_global_template` for every **unsynced** `industry_plan` row (heals partial prior runs).
5. Also publishes **Project Charter Core Fields** when `synced_at IS NULL` (covers the former manual todo).

---

## Part B — Sidebar reorganisation

**Status: COMPLETE**

**File:** `SQL/v168_global_template_library_nav_reorg.sql`

- Top-level section **Global Templates** (`sort_order` 100).
- Group **Library** (required by `buildAdminNavTree`: section → group → item).
- Existing item re-parented under that group; `sort_order = 10`; route unchanged.
- Mirrored in `packages/shared/src/defaultAdminNav.js`.
- Unit test: `packages/shared/src/__tests__/defaultAdminNav.globalTemplates.test.js`.
- Guide updated: `modules/content/docs/Global_Template_Library_Guide.md`.

## Apply order
1. Monorepo `SQL/v773_global_industry_template_sync.sql` (if not already)
2. Monorepo **`SQL/v774_pm_template_nodes_multi_document_current_scope.sql`** (required before bulk publish — allows many current `industry_plan` nodes per account)
3. Admin `SQL/v166_…` (if not already)
4. **`SQL/v167_global_template_industry_bulk_populate.sql`**
5. **`SQL/v168_global_template_library_nav_reorg.sql`**

## Todo
- [x] `SQL/v167_global_template_industry_bulk_populate.sql`
- [x] `SQL/v168_global_template_library_nav_reorg.sql`
- [x] Update `packages/shared/src/defaultAdminNav.js`
- [x] Publish "Project Charter Core Fields" when unsynced (scripted in v167)
- [x] Docs + nav unit test; verify checklist left for operator after SQL apply

## Review

### Completed 2026-07-16

| Item | Outcome |
|------|---------|
| Part A | Bulk insert + publish from `public.pmo_industry_templates`; charter publish if needed |
| Part B | Top-level Global Templates nav (DB + JS fallback) |
| Docs/tests | Guide + `defaultAdminNav.globalTemplates.test.js` |

**Operator verify after apply:** sidebar shows **Global Templates**; library list includes industry_plan rows matching the Platform catalog.
