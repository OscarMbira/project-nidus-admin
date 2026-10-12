# project-nidus-admin — Development Guide

## Quick start

```bash
cd "E:\project-nidus-admin"
pnpm install
pnpm run dev
```

Shell: http://localhost:5175 | Modules: 5180–5198

`pnpm run dev` starts the light set (shell, platform, users, admin-mgmt) — the low-disk-I/O default. Use `pnpm run dev:full` to start shell + every module (needed when working on a module outside the light set, e.g. docs-centre, testing-centre, email-centre).

**Module federation dev:** Remote modules run `vite build` + `vite preview` (not `vite dev`) so `remoteEntry.js` is served correctly.

## Documentation & Testing (required for all features)

Every **new or amended** admin feature must include:

1. **Module documentation** — Add or update Markdown in `modules/{module}/docs/` (one guide per major workflow). General guides live in `modules/docs-centre/docs/general/`. Include a short `README.md` in the module `docs/` folder listing guides.
2. **DB guide index** — Register guides in `admin.documentation_guides` via seed SQL (`SQL/v{N}_*_seed_data.sql`) when adding new guides.
3. **CI doc sync** — Docs sync to Supabase Storage on push to `main` via each module’s GitHub Actions workflow (`scripts/sync-module-docs.js`). No redeploy needed for doc-only changes.
4. **Testing** — New UI flows need Playwright coverage under `e2e/tests/admin/` where practical; complex features should note manual test steps in the module guide. Use the **Testing Centre** (`/testing-centre`) for runs, evidence, and defect linking.
5. **Sidebar** — Add nav entries in `SQL` seed (`admin.nav_nodes`). **DB is the source of truth** for labels and structure (see **No hardcoding** below). Do **not** hardcode live nav labels in the shell or modules, and do **not** update `packages/shared/src/defaultAdminNav.js` unless I explicitly ask for a static/fallback mirror.
6. **Unsaved changes guard** — Every **new or amended** create/edit form must call `useUnsavedChangesGuard(isDirty, message?)` from `@nidus-admin/shared` (provider is mounted in `shell/src/App.jsx`). Compute `isDirty` by diffing loaded record vs current form state; use `requestNavigation()` for back/cancel navigation and `confirmDiscard()` for close actions without route changes. Existing forms adopt opportunistically when touched.
7. **Approval justification & field lock (Record Lifecycle)** — Every decision surface for a governed record (Approve/Reject, whether from the record's own governance panel or the My Approvals queue) must require a mandatory justification/comments field before the decision can be confirmed — use `useConfirmAction({ requireReason: true, ... })` from `@nidus-admin/ui`, which blocks confirmation while the reason is empty/whitespace-only. Label the field for its purpose (e.g. "Approval justification (required)" / "Rejection reason (required)"), not a generic "Reason". While a record's `record_status === 'unauthorised'`, its data-entry form must render read-only (wrap the field block in `<fieldset disabled>`) so the approver can review the pending change but not alter the underlying data — pair with a pending-approval banner/ribbon. See `projectplans/v19.0_approval_justification_and_field_lock_plan.md`.
8. **Theme-aware UI (mandatory for all NEW and AMENDED components)** — Match monorepo rule 28.1: every page/form/card/table/modal/panel must support light and dark via Tailwind `dark:` pairs (e.g. `bg-white dark:bg-gray-900`, `text-gray-900 dark:text-gray-100`, `border-gray-200 dark:border-gray-700`). Do not ship dark-only surfaces. Solid CTAs (`bg-blue-600 text-white`) may stay single-tone. When amending a component, fix any dark-only classes in that same change.
9. Always draft a plan if the change or new feature is non-trivial.
10. Check if the new feature or change is applicable to the other systems(Platform ans Simulator) and apply the same solution where it is applicable.
11. All new tables/list should have the full export features as currently exisiting
12. **Card ⊞ / Table-List ≡ toggle, defaulting to table (monorepo rule 41).** Every new or amended table/list page needs the Card/Table view toggle with a search bar in both views. **Default to Table-List ≡, not Card ⊞, where applicable** — most registers/lists read better as a table on first visit; card view stays available via the toggle. The user's last-chosen view is remembered per page (e.g. `localStorage`) and overrides the default on return visits.
12.1. **Default list sort (mandatory for NEW and AMENDED tables/lists — matches monorepo rule 40.1).** Until I explicitly override it for a named table/list, the **initial / default** row order (before the user clicks a column header) must be: (1) **Alphabetically** A→Z (case-insensitive) on the primary display label for that list (name/title/`display_id`/main human-readable column — not `#` and not a raw UUID); (2) **then by date created** (`created_at` ascending = oldest first) as the tie-breaker. Prefer `ORDER BY` in the query; otherwise apply the same multi-key sort client-side for both Card and Table-List views. User column sorts still override for the session; clearing sort returns to this default. **Exceptions only when I say so** for a specific table/list (document in the plan/PRD). Same rule applies when Platform/Simulator lists are amended for parity.
13. **Display ID in URLs (mandatory)** — When a record has a human-readable `display_id` from ID Generation (e.g. `GTL-0001`), **all detail/edit/view deep links must use that ID in the URL query** (`?id=GTL-0001`), not the UUID primary key. Resolve loads by `display_id` or UUID (backward compatible). Mutations (update/publish/archive) still use the UUID internally after load. Prefer `display_id` in success toasts. Apply the same convention to every Admin screen that has ID Generation display IDs — adopt opportunistically when touching a flow. **Cross-module links too (v205):** this also covers a page linking to *another* module's detail page (e.g. Errors → Support Ticket, Support → Error Detail, Invoices → Refund) — not just a page's own row links. Build a `useDisplayIdMap('admin.<target_table>', [...referencedIds])` for the foreign ids being linked to, same as for the page's own rows. Before adding `navId()` to a new page, confirm the target table actually has an active `admin.id_generation_rules` row — some tables (e.g. subscriptions, payment gateways, plan catalog, email/notification templates as of v205) don't yet, and need a rule seed (rule 14) before their URLs can carry a display id.
13.1. **Friendly URLs even without ID Generation (mandatory, matches monorepo rule 16.3).** When a record has no `display_id` (rule 13/14 don't apply yet) but does have some other column that's unique, stable, and human-readable, use that in the URL instead of the raw UUID. Loader resolves by the friendly key or UUID (same backward-compat rule as 13); if the friendly key is only unique within a scope narrower than global, resolve within the caller's own scope. Mutations still use the UUID after load. Adopt when creating or next amending a record flow.

14. **ID Generation rules for new tables (mandatory)** — Matches monorepo rule **16.2**. When Platform/Simulator (or Admin) introduces a new application table with a human-readable reference/identifier column:
   - Check `admin.id_generation_rules` for an active rule on the qualified target (`public.<table>`, `sim.<table>`, or `admin.<table>`).
   - If **missing**, create a versioned seed under **`E:\project-nidus-admin\SQL\`** that inserts the rule (follow `v156_id_generation_sequential_entity_rules_seed.sql`: abbreviation, description, sequential/date/scope/pad). Do **not** leave new identifiable tables without a rule.
   - Seed/sample data for those tables (in either repo) must leave the display-ID column blank so `admin.generate_display_id` / the AFTER INSERT trigger assigns the real ID — never hand-mint UUID-hex or invent local reference formats.
   - Coordinate with the monorepo migration that wires `trg_apply_admin_display_id` (or the Admin equivalent) on the column.
15. **Icon-only row/detail-bar actions for View/Edit/Delete (mandatory for NEW and AMENDED list/detail pages) — matches monorepo rule 61.** Every table/card row-actions column and every record-detail top action bar must render View/Edit/Delete as icon-only buttons — no visible text label — via `AdminIconActionButton` from `@nidus-admin/ui` (`variant="view"|"edit"|"delete"`, blue/amber/red respectively, `Eye`/`Pencil`/`Trash2` from `lucide-react`). Each button carries a `title`/`aria-label` (the `label` prop) and shows a themed hover/focus tooltip via the paired `AdminTooltip` component — never ship an icon button with no accessible name. `AdminActionButton` (text-pill) stays in use for other action types (Assign, Priority, etc.) — this rule only converts View/Edit/Delete. Does not apply to Export format dropdown menus. Existing pages retrofit opportunistically when next touched, per the batched migration referenced in `E:\project-nidus\projectplan\v840_icon_only_row_actions_plan.md`.
15. **No hardcoding unless I explicitly say so (Admin — matches monorepo rule 25.1).** User-facing and configuration content must be loaded from the database — not baked into React/JS/config as the live source of truth. This includes (non-exhaustive): sidebar/nav labels and hierarchy (`admin.nav_nodes` and related grants), documentation guide index rows, dropdown/select options and lookup lists, status/type enumerations stored as tables or reference data, permissions/feature configuration, and any copy or structure that operators may change without a code deploy. Prefer versioned SQL under `E:\project-nidus-admin\SQL\` to create or update that data; the UI/services only query and render it. **Allowed without asking:** true UI chrome (layout, icons as presentation, Tailwind theme classes), route path constants that match registered routes, and validation regexes. **Forbidden unless I explicitly request it:** hardcoded nav/menu labels, static nav trees used *instead of* DB nav, client “force label” overrides, mock/dummy rows, and silent fallback datasets when a query fails — show an error/empty state instead. Same rule when amending existing code: do not introduce new hardcoding; prefer fixing the DB row or fetch path. **Platform/Simulator parity:** see `E:\project-nidus\CLAUDE.md` rule **25.1**.
16. **Audit details tab on Template / Form detail surfaces (mandatory for NEW and AMENDED — matches monorepo rule 63).** Any **new or amended** Global Template (or Admin form-template) **detail / view / builder** page must expose **Template details | Audit details** tabs (Details default). Use shared Admin UI from `@nidus-admin/ui` (`AuditField`, `AuditCard`, `AuditDetailsPanel`, `DetailAuditTabList`). Cards: Identity, Classification, Record history (+ optional publish/content history). **Never** show a Technical reference card (internal UUID / storage table). Prefer friendly labels over raw UUIDs. Apply on `GlobalTemplateLibraryDetail` and `GlobalTemplateLibraryForm` (view and edit). See monorepo `projectplan/v866_template_form_audit_details_tab_plan.md`.
16.1. **Audit tab is mandatory on every record-CRUD page, not just Template/Form surfaces (system-wide, matches monorepo rule 63.1 — v871/v203).** Rule 16's requirement extends to **any new or amended page that creates, edits, or views a single persisted `admin.*` (or narrow-exception cross-schema) record** — user accounts, subscriptions, affiliates, support tickets, and simple reference/lookup/config pages (countries, currencies, feature flags, etc.) alike.
   - Same fixed 3-card structure as rule 16: Identity / Classification / Record history, fields adapted per record type.
   - Tab always visible, even for a brand-new unsaved record, with a "Audit details appear after this record is saved" placeholder until then.
   - Use `DetailAuditTabList`'s generalised `tabs` prop (`{ value, label }[]`) for pages with more than two content tabs (e.g. `SubscriptionDetailPage`, `UserDetailPage`) rather than a hand-rolled tab mechanism — fully backward compatible with the simpler 2-tab shape.
   - **Migrate existing ad-hoc audit/history widgets** (`AuditTrailWidget`, `RecordLifecyclePanel`/`RecordVersionHistory`, bespoke "Activity" tabs) to this standardised component set when that page is next touched — don't leave two different audit UI patterns coexisting on similar pages.
   - Excluded: list/dashboard pages, permission/nav/translation matrix editors spanning many rows, `AdminRowManageModal`-style row-action menus with no field form, read-only activity/delivery logs, report-run viewers.
   - Metadata only — no field-level change log requirement (separate, larger future effort).
   - Adopt opportunistically for the existing backlog (tracked in `projectplans/v203_system_wide_audit_tab_plan.md`); every genuinely new record-CRUD page from this point forward ships with the tab from day one.

17. **Clickable dashboard summary cards (mandatory for NEW and AMENDED dashboard/summary
cards, v893 / monorepo rule 64).** Any `AdminCard` (or an equivalent local stat-tile
component, e.g. `KpiCard`) whose number is a **COUNT or SUM of individually-identifiable
records matching an expressible filter** must be clickable via `AdminCard`'s `onClick`/`to`
props — clicking navigates to that filtered subset on the relevant Admin list page. Same-page
cards (Dashboard and list view together, or a table already rendered lower on the same page)
apply the filter to existing list/table state directly, or scroll into view when the full
matching set is already visible with nothing to filter; cross-page cards pass the filter as a
URL query parameter (e.g. `?status=active`) that the target list page reads on mount via
`useSearchParams` (or `useAdminListPage`'s `filterParamNames`/`initialFilterFromUrl` option).
**Do not make a card clickable** when its number is an average, percentage/ratio, blends
multiple distinct entity types, or is a `LIMIT`-capped "recent N" sample rather than a true
filterable total — leave these static, no hover affordance. If a card's implied filter doesn't
exist yet on the target list page, add the filter capability rather than linking unfiltered —
but if wiring a card would require building an entirely new list page that doesn't exist
anywhere in the codebase (not just adding a filter to an existing one), leave it static and
note the gap in the plan rather than building the new page as a side effect or silently
skipping it. **Adopt opportunistically** for any `AdminCard` usage not yet covered by the v206
rollout when next touched. See `projectplans/v206_clickable_dashboard_summary_cards_plan.md`
and the monorepo's `projectprd/v893_clickable_dashboard_summary_cards_PRD.md`.

18. **Non-modal forms by default (mandatory for NEW pages/forms, matches monorepo rule 65,
v910) — until the user explicitly says otherwise.** Any new create/edit/view surface for a
record must be implemented as its own dedicated routed page with its own URL, not a modal
overlay. Mode (create/view/edit) is expressed by the route, not by a prop toggling a modal's
`isOpen`/`readOnly` state. **Excluded** (stay as modals/dialogs): confirmation prompts,
small action dialogs that don't edit a full record's fields, filter/search panels, image/file
viewers, generic help/info popups, and bulk-action modals on multiple records — same
exclusion list as rule 16.1's underlying monorepo rule 63.1. **Adopt opportunistically** for
existing modal-based Admin forms when next touched, not as a retrofit pass.

19. **Performance pass on every NEW or AMENDED component (mandatory, matches monorepo rule
66).** Whenever you create or touch a component, check its data-loading path for: (1)
**sequential awaits that don't need to be sequential** — fire independent fetches together via
`Promise.all` rather than one after another, and chain a fetch that only needs one field from
an earlier result off that specific promise (`.then(...)`) instead of waiting for an entire
unrelated batch to finish first; (2) **redundant duplicate resolution** — don't let two
functions each independently re-derive the same expensive lookup when the result is already
available or in flight from a sibling call; (3) **repeated fetches of largely-static reference
data** — add a short-lived cache with a sensible invalidation trigger, preferring
`sessionStorage` over an in-memory-only variable so it survives a hard reload (which wipes all
JS module state and is a normal part of how a page gets exercised). **Don't over-apply this** —
a simple single-query page needs none of it; this is about removing waste in an actual
waterfall, not adding ceremony to code that has no such problem (rule 62 spirit: simplicity
still wins over speculative optimization). See monorepo `organisationCustomRoleService.js` /
`organisationMenuBundleService.js` for the sessionStorage caching pattern to mirror.

20. **Multi-line list fields (mandatory for NEW and AMENDED — matches monorepo rule 67, v1061).** Any Admin field that captures multiple text lines as a list must use `@nidus-admin/ui` `AdminMultiLineListInput` with a stable required `viewModeId`, Card ⊞ / Table-List ≡ toggle defaulting to table list, inline edit in table mode, confirm-before-delete, and newline-joined string persistence (unless a dedicated child table already exists). Icon-only Edit/Delete via `AdminIconActionButton`. Adopt opportunistically when amending a page that still uses a stacked-only or ad-hoc multi-line control. See monorepo `projectprd/v1061_multiline_field_table_list_crud_PRD.md`.

21. **Searchable long-list dropdowns (mandatory for NEW and AMENDED single-selects — matches monorepo rule 69, v1064 / Admin v209).** Any single-select whose option list has **≥ 12** options (or is known-long: countries, currency catalogs, large account/project/user pickers) must use `@nidus-admin/ui` **`SelectField`**, which auto-switches to Admin `SearchableSelect`. Short enums stay native. Use `forceSearchable` / `forceNative` as needed. `allowCreate` only where free-text is intentional. Multi-select stays on `MultiSearchableSelect`. See monorepo `projectprd/v1064_searchable_long_list_selects_PRD.md` and `projectplans/v209_searchable_long_list_selects_plan.md`.

22. **Bulk upload templates must include a legend / data dictionary (mandatory for NEW and AMENDED bulk-import flows — matches monorepo rule 71, v1101).** Whenever Admin offers a downloadable bulk-upload template (CSV, Excel/XLSX, JSON, or other formats), **every** downloadable format must embed a **legend / file dictionary** (field name, required, data type, max length, allowed values, format notes, aliases). Excel: Instructions + Legend sheets; CSV: `# DATA DICTIONARY` comment block; JSON: `DATA_DICTIONARY` alongside the data array. Do not ship bare header-only templates. Adopt opportunistically when amending an existing Admin bulk import; every new bulk-upload feature must include legends in all offered formats from day one. See monorepo `CLAUDE.md` rule **71**.

## Architecture

- **Shell** (`@nidus-admin/shell`) — auth, layout, federation host
- **Modules** (`modules/*`) — independent federated remotes
- **Packages** (`packages/ui`, `packages/shared`) — shared components and utils

## SQL

**Repo scope:** When working in **`project-nidus-admin`**, create and version all SQL here — not in `project-nidus`.

- **Location:** `E:\project-nidus-admin\SQL\` — `v{N}_{name}.sql` (e.g. `v56_affiliate_program.sql`).
- **Version incrementing:** Check `SQL/` for the latest `v{N}` before adding a file. If the latest is `v59`, the next is `v60`. Never skip or duplicate numbers.
- **Schema focus:** Migrations here typically target the **`admin`** schema (permissions, nav, admin RPCs, admin tables). Platform/Simulator schema changes (`public`, `sim`) belong in **`E:\project-nidus\SQL\`** when that work is done from the platform repo.
- **Cross-repo features:** A feature may need SQL in both repos (e.g. admin affiliates in v56 + platform click tracking in project-nidus). Each file stays in the repo where that work is implemented.
- **Design:** Mutations via `SECURITY DEFINER` RPCs, `admin.check_admin_permission()`, and `admin.log_admin_action()`.
- **Seed data:** Companion `SQL/v{N}_{feature}_seed_data.sql` after infrastructure migrations; idempotent (`ON CONFLICT`, fixed hex-only UUIDs). Add `pnpm run admin:migrate-*` / `admin:seed-*` scripts in `package.json` when needed.

## Project Plans

**Repo scope:** When working in **`project-nidus-admin`**, write all plans for admin work here — not in `project-nidus` or Cursor internal plan files.

- **Location:** `E:\project-nidus-admin\projectplans\` — `v{version}_{plan_name}.md` (e.g. `v10.0_affiliate_program_plan.md`).
- **Version incrementing:** Check `projectplans/` for the highest version; increment for each new plan.
- **Cross-repo features:** The admin plan lives here; a companion plan in `E:\project-nidus\projectplan\` may cover platform/simulator UI when that side is implemented there. Reference the other repo’s SQL/plan paths explicitly — do not duplicate files across repos.
- **Write target:** Plans go **directly** into `projectplans/` (never internal/system plan files).
- **Completion marking:** Update phases, checklists, and **Status** in the plan file as work progresses.

## Super Admin

```bash
pnpm run admin:seed-super
```

## Sidebar Navigation

- **All new features/functionalities must be added to the sidebar via DB** — seed/update `admin.nav_nodes` (and role grants) in versioned SQL. Labels and structure are fetched from the DB at runtime (rule 15 / monorepo 25.1).
- Wire the shell/module to **render** those nodes; do not treat hardcoded `NAV_SECTIONS` / `defaultAdminNav.js` as the live source of truth unless I explicitly ask for a static fallback.
- Always specify which admin roles can see each section and item via the appropriate role/permission grants in SQL (and UI gates where already used).

## New module

Copy `modules/_template/`, register in `shell/src/moduleConfig.js` and `shellRoutes.jsx`.

**Keep `DEV_MODULES.md` in sync.** This repo's module dev-start reference is `E:\project-nidus-admin\DEV_MODULES.md`. Whenever a module is added, add its row (module, port, `turbo dev --filter` command). Whenever a module is completely removed, delete its row. Do this as part of the same change that adds/removes the module — do not leave it for a follow-up.

## Security

- Never commit `.env.local` or service role keys
- `dev-start-all.bat` is gitignored — dev only
- Default theme: dark
- **Cross-schema write exception (Global Templates):** `admin.publish_global_template` may call monorepo-owned `public.sync_global_template_node` / `sim.sync_global_template_node` to upsert system-synced `pm_template_nodes` (same Supabase project; Security Definer RPC). This mirrors the existing Platform/Simulator **read** exception for `admin.feature_flags` — keep the grant narrow (publish path only).
- **Cross-schema write exception (Industry Reference Data, v208):** for monorepo-owned `public`-schema reference tables with no admin-specific business logic of their own (`industry_categories`, `industry_segments`, `industry_packs`, `industry_pack_menu_items`, `professional_roles`), the RPCs live directly in `public` (e.g. `public.admin_create_industry_category`) rather than proxying through an `admin`-schema wrapper — each is still gated internally by `admin.check_admin_permission()`. This is the mirror image of the Global Templates exception above (a `public` function calling into `admin`, instead of an `admin` function calling into `public`) and is the preferred shape for future pure-reference-data tables in `public`/`sim` with no admin-side logic to layer on top; use the Global Templates proxy shape instead when the admin side does have its own logic (audit workflow, additional validation, etc.) beyond the permission check. See `SQL/v208_industry_reference_admin_rpcs.sql` and `projectplans/v208_industry_reference_data_admin_crud_plan.md`.
- **Cross-schema write exception (Public brand site, v225 / monorepo v1241):** `public.site_products` and `public.site_content` (the apex-domain brand site's product cards and copy) are written only through the `public.admin_*site_*` RPCs in `SQL/v225_site_products_admin_rpc.sql` (v208 shape, gated by `system.public_site.view/.edit`, audited). Those RPCs take the acting admin from the session; a passed `p_admin_user_id` is honoured only for the service role. Never list the Admin app on the public site. `SQL/v230_site_nav_pages_enquiries_admin_rpc.sql` (monorepo v1241 Amendment A) extends the same pattern to `public.site_nav_links` / `public.site_pages` (shared header/footer links, common pages) and to status updates on `public.site_enquiries` (contact-form messages). `SQL/v231_site_sections_admin_rpc.sql` (monorepo v1262) extends it to `public.site_sections` (marketing sections: drafts, preview links, publish), `public.site_preview_tokens`, and uploads to the public Storage bucket `site-assets`. `SQL/v232_blog_posts_admin_rpc.sql` (monorepo v1263) extends it to `public.site_blog_posts` / `site_blog_attachments` / `site_blog_categories` and the private bucket `site-downloads`.
- **Cross-schema write exception (Project Planner edition, v227 / monorepo v1239):** `public.accounts.product_edition` and `public.planner_menu_allowlist` are written only through `public.admin_change_account_edition` / `public.admin_set_menu_planner_available` in `SQL/v227_planner_edition_admin_rpc.sql` (gated by `accounts.edition.change` / `system.planner_menu.edit`, reason required, audited). The edition change calls the monorepo's `public.apply_account_edition`, which no client can call directly.

## Git / push policy

**Push to GitHub (`origin/main`) automatically once a feature or plan phase is complete** — do not wait for the user to ask each time. This is a standing authorization for this repo.

- **Trigger:** the end of a completed feature or projectplan phase (e.g. a plan's `Status` moves to `COMPLETE`, or a checklist section is fully checked off) — not after every small edit. Mid-feature SQL migrations, WIP pages, or exploratory changes don't trigger a push on their own; wait for the checkpoint.
- **Action:** commit with a descriptive message (following this repo's existing commit style) and `git push` straight to `origin/main` — no per-instance confirmation needed once the trigger condition is met.
- **Still applies:** the general Git Safety Protocol otherwise — never force-push, never skip hooks, never amend published commits, never commit files that look like secrets. This rule authorizes routine commit+push at feature checkpoints; it does not authorize destructive operations.
- If a pre-commit/pre-push hook fails, fix the underlying issue and create a new commit — do not bypass with `--no-verify`.

## Record lifecycle permissions

Governed catalog tables use `lifecycle.*` permission keys (`lifecycle.configure`, `lifecycle.authorise`, `lifecycle.view_all`). Wire UI actions with `<PermissionGate permission="lifecycle.…">` and route mutations through `packages/shared/src/lifecycleServices.js` RPC wrappers. Add new governed tables via `admin.record_lifecycle_config` seed data — no schema change required.
