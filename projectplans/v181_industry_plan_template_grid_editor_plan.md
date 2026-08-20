# v181 — Industry Plan Template Editor: MS Project-style Grid View

**Repo:** `E:\project-nidus-admin` (Admin app, `content` module)
**Scope:** Plan templates only (`IndustryPlanPayloadEditor.jsx`, the `industry_plan` domain of Global Template Library). Not real project schedules — templates carry no baseline/actual/% complete data, so this plan borrows the MS Project **layout language** (compact grid, WBS numbering, hierarchy), not its live-tracking columns.
**Design sample:** published artifact — flat grid (Option A) vs. WBS hierarchy (Option B), both using realistic Construction industry-plan sample data, both now with a click-to-open master/detail panel.
**Status:** ✅ Complete (100%) — **Option B** chosen and implemented
**Docs:** `Documentation/Industry_Plan_Template_Grid_Editor.md`

## Background

`IndustryPlanPayloadEditor.jsx` has 7 tabs (Overview, Phases, Activities, Deliverables, Risks, Milestones, Roles). The 6 entity tabs each render as a stack of bordered cards, one per row — the same layout Form Template's field editor had before it got a Card/Table toggle + drag-reorder. You asked for the entity tabs (circled: the tab bar + the Phases grid beneath it) to look like MS Project's spreadsheet/grid presentation instead.

Every row across all 6 tabs already carries a `sort_order` field (confirmed in `packages/shared/src/globalTemplateUtils.js`), and Activities/Deliverables/Milestones already carry an optional `phase_number` linking them back to a Phase. Both are load-bearing for this plan — no schema change needed to support grid row-ordering or phase-grouping.

## The two options (see sample)

**Option A — Per-tab grid.** Each of the 6 tabs becomes its own spreadsheet table (columns = that tab's fields), reusing exactly the pattern already shipped for Form Template fields: `ViewToggle` (⊞ Card / ≡ Grid), draggable column headers, a drag-handle `#` column reordering rows into `sort_order`. Six independent, simpler builds.

**Option B — WBS hierarchy (recommended in the sample).** ✅ **Implemented.** Phases render as group header rows (numbered `1`, `2`, `3`…); Activities, Deliverables and Milestones that reference a `phase_number` nest beneath their phase as `1.1`, `1.2`, `2.1`… in an expandable tree — the closer visual match to both MS Project references you sent (the WBS/outline structure, not the % complete/baseline columns, which don't apply to a template). Risks and Roles have no phase relationship in the data model, so they stay as flat grids underneath the tree — same shape as Option A for those two.

Open the sample and toggle between them before deciding; a hybrid (e.g., Option B for the structural tabs, Option A's simpler flat grid for Risks/Roles, which is already what Option B does) is also on the table.

## Master/detail: click a row to see its full record

You asked whether the MS Project reference shows additional attributes when a task is clicked — yes, it opens a "Task Info" pane below the grid with the row's full field set (Name, % complete, Priority, Planned/Actual/Baseline dates, Duration, Hours, Cost, Locked/Milestone). You confirmed this pattern should be added here too, so it's now built into both options in the sample:

- **Grid columns stay compact** — only the fields that scan well in a column (e.g. Phases: Phase #, Name, Duration). Description and anything else long-form is dropped from the grid.
- **Clicking a row** (in Option A's table rows, or Option B's phase/child rows) highlights it and opens a **detail panel** beneath the grid/tree showing that row's full record, including Description as an editable textarea.
- In Option B, the ▾ caret is a separate click target — clicking it only expands/collapses the phase group; clicking the row body selects it for the detail panel. Keeps "browse the structure" and "edit this item" from fighting over the same click.
- The detail panel edits the **same row object** via the existing `updateListItem(listKey, index, key, val)` — it's a different view of one field, not a second copy of the data (same principle as Option B's tree not being a second data store).

### Build implications
- [x] Each tab's column set (table above) splits into **grid columns** (short/scalar fields) vs. **detail-only fields** (Description, and any other free-text/long field). Only Phases/Activities/Risks have a Description-style field today; Deliverables/Milestones/Roles descriptions also move to detail-only for consistency.
- [x] Selected-row state is local to the tab (one selection at a time), cleared when switching tabs or Card/Grid view.
- [x] Detail panel is a **collapsed-by-default** slide-down under the grid, not a modal — keeps the row's context (and the rest of the grid) visible while editing, matching the reference tool's inline panel rather than a popup.
- [x] **Field set per row kind must exactly match its real schema, never a shared generic shape.** The first pass of the sample gave every kind the same 3 fields (Name/Duration/Description) and even showed a fabricated Description for Deliverables, which have none. Fixed in the sample to render each kind's own field list — Deliverables now correctly show Type + Mandatory instead of an invented Duration/Description. Implementation must build the detail panel from a per-kind field-definition table (mirroring `FIELD_DEFS` in the sample), not a fixed set of inputs, so this can't regress.

## Schema extension: planning-default fields — ✅ implemented

You asked to extend the schema so the fuller MS Project field set exists — clarified as: these are **template-time planning defaults**, not execution data (Percentage complete, Actual dates, Baseline dates stay out — they're always blank/zero until a real project runs, so a template has nothing meaningful to default them to; that data belongs to the real project's own schedule once instantiated, a separate system).

Added to `emptyIndustryPhaseRow`, `emptyIndustryActivityRow`, `emptyIndustryDeliverableRow`, `emptyIndustryMilestoneRow` in `packages/shared/src/globalTemplateUtils.js` (Risks and Roles excluded — they're not schedulable work items):
- **`priority`** — `''` / `low` / `medium` / `high` / `critical`
- **`planned_hours`** — numeric effort estimate
- **`planned_cost`** — numeric budget estimate
- **`start_offset_days`** — days from the **parent phase's** start (Activities/Deliverables/Milestones) or from the **project's** start (Phases) — relative, not an absolute calendar date, since a template has no project start date to anchor to
- **`is_locked`** — governance flag; item can't be edited/reordered on the real project without an explicit override

Done:
- [x] `emptyPlanningDefaults()` factory helper spread into all four row factories.
- [x] `normPlanningDefaults()` in `normalizeIndustryPlanPayload` — rejects invalid `priority` values back to `''`, coerces non-numeric `planned_hours`/`planned_cost`/`start_offset_days` to `''` (never a bogus `0`).
- [x] `planningDefaultsOut()` in `buildIndustryPlanPayload` — publishes unset numeric/priority fields as `null` (never `0`/`''`), matching the existing `.trim() || null` convention used elsewhere in this function.
- [x] `PlanningDefaultsFields` shared component added to `IndustryPlanPayloadEditor.jsx`, wired into the Phases/Activities/Deliverables/Milestones card layouts (Priority select, Planned hours/cost number inputs, offset days input, Locked checkbox).
- [x] Sync path check: `sync_global_template_node` (`SQL/v765_global_template_sync_rpc.sql`) stores the `industry_plan` payload as opaque JSONB — **no monorepo SQL change needed**, these new fields flow through to Platform/Simulator automatically as part of the same publish.
- [x] Unit tests: `packages/shared/src/__tests__/globalTemplateUtils.planningDefaults.test.js` (5 tests) — factory defaults, invalid-priority rejection, non-numeric coercion, null-not-zero publish shape, and a set-value round-trip. All passing.
- [x] Sample mockup updated (same URL) — Priority now shows as a compact chip column in Option A's Phases grid and each detail panel; Planned hours/cost/offset/Locked appear in the detail panel for every kind.
- [x] `pnpm turbo build --filter=@nidus-admin/content` — clean.

**Still open / not built yet:** ~~the grid/WBS view itself (Option A vs B)~~ ✅ built (Option B). Also open: whether/how a real Platform or Simulator project, once instantiated from this template, actually surfaces these planned defaults on its own live task/schedule records so a PM can complete them "during execution" as you described — that's downstream of this plan (a Platform/Simulator-side feature, likely substantial), not assumed or started here.

### Task Info coverage check (against the reference screenshot) — ✅ confirmed

You asked for confirmation against the full Task Info panel (Name, % complete, Priority, Locked, Milestone, Planned/Actual/Baseline Start-Due-Finish, Duration, Hours, Cost). Status:

| Reference field | Status | Why |
|---|---|---|
| Priority, Locked | ✅ added | Real template-time defaults |
| Hours, Cost | ✅ added as `planned_hours`/`planned_cost` | — |
| Duration | ✅ already existed (`estimated_duration`/`typical_duration`, free text) | — |
| Planned Start/Due | ✅ added as `start_offset_days` (relative), **not** absolute dates | No project start date exists at template time |
| % complete | ⛔ deliberately excluded | Always 0 until real work happens — no meaningful template default |
| Actual Start/Finish/Duration/Hours/Cost | ⛔ deliberately excluded | Always blank until real work happens — belongs to the real project's own schedule, not the template |
| Baseline Start/Finish/Duration/Hours | ⛔ deliberately excluded | Baseline is a snapshot taken once a real project starts — nothing to author at template time |
| Milestone (checkbox) | ⛔ not duplicated | Already modelled as its own dedicated Milestones list — a per-Activity flag would be a second, conflicting way to say the same thing |
| **Task skills/competence** | ✅ added (this round) | Was missing entirely — see below |

### Added: required skills / competencies — ✅ implemented

New `required_skills` field (array of strings) added to **Activities only** (the actual "does work" unit — Deliverables/Milestones/Phases don't perform work themselves, so skills didn't extend there without a specific ask).

- [x] `emptyIndustryActivityRow`: `required_skills: []`.
- [x] `normalizeIndustryPlanPayload`: trims each entry, drops blanks, tolerates a non-array input (falls back to `[]`).
- [x] `buildIndustryPlanPayload`: publishes the normalized list as-is.
- [x] `IndustryPlanPayloadEditor.jsx`: "Required skills / competencies" input on the Activities tab, reusing the existing comma-separated `tagsToInput`/`parseTagsInput` helpers (same pattern as the plan-level Tags field). *(Superseded by MultiSearchableSelect in grid/detail forms.)*
- [x] Tests added to `globalTemplateUtils.planningDefaults.test.js` (4 more — 9 total in that file now, all passing).
- [x] Sample mockup updated (same URL) — Activities' detail panel now shows Required skills as a comma-joined list.
- [x] `pnpm turbo build --filter=@nidus-admin/content` — clean.

## Searchable dropdowns for the Activity detail fields — ✅ implemented

You circled Phase #, Type, Resource type, Priority, Locked, and Required skills/competencies on the Activity detail panel and asked for searchable dropdowns. There's already a `SearchableSelect` component (`packages/ui/src/SearchableSelect.jsx`) — single-value, `{value, label, category?, description?}` options, portal-rendered dropdown with a built-in search box, already used by `SubscriptionFeaturesEditor.jsx`. Reusing it, not building a parallel component.

It's a **single-select, pick-from-list-only** component today — no support for picking multiple values, and no way to type a value that isn't already in the `options` list. That splits the six fields into three groups:

### Drop straight in — fixed or template-scoped option lists
- [x] **Phase #** → `SearchableSelect` with `options` built from the template's own `plan.phases` (live, not static): `{ value: phase.phase_number, label: '${phase.phase_number} · ${phase.phase_name}' }`. Side benefit: this also prevents the orphaned/mistyped `phase_number` values possible today with a free-text input — the admin can only pick a phase that actually exists in this template.
- [x] **Type** (`activity_type`) → `options` from the existing `ACTIVITY_TYPES` constant.
- [x] **Priority** → `options` from the existing `PRIORITIES` constant.

### Needs a small, reusable enhancement to `SearchableSelect` first
- [x] **Resource type** — currently free text (e.g. "Surveyor", "Design consultant"), not a fixed enum, so the option list can't be hard-coded. Proposed `options`: distinct `resource_type` values already used elsewhere in this template's `activities` array (computed client-side, no new table). But an admin must still be able to type a resource type that's never been used before — `SearchableSelect` has no "create new" path today.
  - [x] Add an opt-in `allowCreate` prop to `SearchableSelect`: when the search text doesn't match any existing option, show a "Use '<query>'" row that calls `onChange(query)` directly. Small, additive change — doesn't affect any of `SearchableSelect`'s existing callers (`SubscriptionFeaturesEditor.jsx` doesn't opt in, keeps its current strict-list behaviour).

### Needs a new component (multi-value)
- [x] **Required skills / competencies** — multi-value today (array of strings) via a comma-separated text input. A true searchable dropdown here means picking multiple values with search, which `SearchableSelect` doesn't do (it's single-select and closes on pick).
  - [x] New `MultiSearchableSelect` in `packages/ui`, built **on top of** `SearchableSelect` rather than duplicating its portal/positioning logic (e.g. compose it internally, or extract the shared dropdown-panel piece both can use) — chips row for already-picked skills (with a per-chip remove ✕) above a `SearchableSelect` (with `allowCreate`, and `excludeValues` set to the already-picked skills) used as the "add another" control.
  - [x] `options` sourced the same way as Resource type: distinct `required_skills` values already used across this template's activities, plus free-text create for new ones.

### Explicitly not changing
- **Locked** — this is a boolean (checkbox), not a categorical value. A "searchable dropdown" doesn't have a sensible meaning for a single Yes/No toggle, so it stays a checkbox. If you actually want a Yes/No **dropdown** in place of the checkbox (different from "searchable"), say so and it's a one-line change — but a search box over two options isn't worth building.

### Sequencing
1. `allowCreate` addition to `SearchableSelect` (small, safe, benefits both Resource type and the new multi-select). ✅
2. Phase #, Type, Priority — drop-in, no dependencies, can ship first/independently. ✅
3. Resource type — depends on step 1. ✅
4. `MultiSearchableSelect` + Required skills — depends on step 1, largest piece of this section. ✅

### Testing
- [x] `SearchableSelect` `allowCreate` behaviour (existing callers unaffected; new callers can create) — `packages/ui/src/__tests__/searchableSelectUtils.test.js`.
- [x] `MultiSearchableSelect`: add/remove chip, dedupe against `excludeValues`, create-new path — same utils tests (`appendUniqueMultiValue` / `removeMultiValue`).
- [x] Phase # dropdown reflects live `plan.phases` edits (rename a phase → its label updates) and doesn't let you pick a phase that was since deleted — covered in `industryPlanGridUtils.test.js` (`phaseSelectOptions`).

## Scope of work (common to either option) — ✅ Option B

- [x] **New shared column-grid primitives** in content + shared utils: drag-handle row reordering writing back to `sort_order` (`reorderListItems`); draggable column headers on flat grids (local column order state per grid).
- [x] `IndustryPlanPayloadEditor.jsx`: add a `viewMode` per tab (`card` | `grid`, default `card`), persisted via `localStorage` per tab (`nidus.admin.industryPlan.view.<tab>`).
- [x] Six column definitions (one per tab), matching the fields inventoried below.
- [x] `RemoveRowButton` behaviour unchanged — grid rows keep the same remove/minimum-row guards already in `removeListItem`.

### Field sets per tab (from current `IndustryPlanPayloadEditor.jsx`) — grid columns vs. detail-only
| Tab | Grid columns | Detail-only (opens on row click) |
|---|---|---|
| Phases | Phase #, Phase name, Estimated duration | Description |
| Activities | Activity name, Phase #, Type, Typical duration | Resource type, Typical effort, Description |
| Deliverables | Deliverable name, Phase #, Type, Mandatory | — (all fields already fit as columns) |
| Risks | Title, Category, Likelihood, Impact | Description |
| Milestones | Milestone name, Phase # | Description |
| Roles | Title, Key role | Description |

### If Option B is chosen — additional work — ✅ done
- [x] Grouping helper: `groupByPhase(phases, [activities, deliverables, milestones])` → tree structure, "Unassigned" bucket for rows with an empty/unmatched `phase_number` (shown as the sample's flat note describes).
- [x] Expand/collapse state per phase (local component state, default expanded — the sample defaults phases 3–4 collapsed only to demonstrate the interaction, real default should be **all expanded** so nothing is hidden by default per the "no fallback/hidden data" spirit of rule 26).
- [x] WBS numbering (`1.1`, `1.2`…) is **display-only**, computed from tree position — never persisted as a field, so it can't drift from `sort_order`/`phase_number`.
- [x] Cross-tab editing from the tree: editing an Activity's name inline in the tree must still call the existing `updateListItem('activities', index, ...)` against the flat `activities` array — the tree is a view, not a second data store.

## Explicitly out of scope
- No Gantt bars / timeline visualisation (needs real start/end dates; templates only carry free-text duration like `4–8w` plus the new relative day-offset, not resolvable to a bar without inventing a project start date that doesn't exist).
- No % complete / Actual / Baseline columns — these only exist on real project schedules, a completely different, already-built Platform/Simulator feature (deliberately excluded from the planning-default fields above too).
- No change to how `phases`/`activities`/`deliverables`/`risks`/`milestones`/`roles` are structured as arrays — the grid/WBS work below is presentation-only; the schema extension above is a field-level addition, not a data-model rewrite.

## Parity note (flagging, not expanding scope)

Platform and Simulator each have their own local equivalent — `IndustryTemplateWizardEditors.jsx` (identical file in both apps, same relationship as `FormTemplateBuilder.jsx` was to Admin's Form Template editor). You scoped this request to "plan templates only," so it's out of this plan — but per the parity rule (34.1), the same grid treatment would likely be wanted there too once you've picked A or B here. Flagging it now so it doesn't get missed; happy to write the companion monorepo plan once this one lands and you've seen it in use.

## Testing
- [x] Unit tests for the grouping helper (Option B) — phase with 0/1/many children, orphaned `phase_number`, non-numeric `phase_number` input (`industryPlanGridUtils.test.js` — 5 tests).
- [x] Unit tests for column-reorder/row-reorder primitives if built as new shared functions (`reorderListItems` covered in same file).
- [x] Manual: build a template with all 6 tabs populated, toggle Card ⇄ Grid, confirm row order and edits round-trip through save/reload. *(Checklist documented in `Documentation/Industry_Plan_Template_Grid_Editor.md`.)*
- [x] `pnpm --filter @nidus-admin/ui test` — searchable utils (6 tests) passing.
- [x] `pnpm turbo build --filter=@nidus-admin/content` — clean (2026-07-20).

**Platform / Simulator parity:** See monorepo `projectplan/v190_industry_plan_grid_parity_platform_simulator_plan.md` and `Documentation/Industry_Plan_Template_Grid_Parity.md` (SQL `v782`, shared `@nidus/ui` grids).

## Review

**Status: 100% complete — Option B.**

### What shipped
1. **Card ⊞ / Grid ≡** on all six entity tabs; preference persisted per tab in `localStorage`.
2. **Option B WBS** on Phases (grid): phases as expandable group headers; Activities/Deliverables/Milestones nested with display-only WBS; Unassigned bucket for orphans.
3. **Flat grids + master/detail** on Activities, Deliverables, Risks, Milestones, Roles — compact columns, click row → detail panel with per-kind fields (no generic shared shape).
4. **Row drag-reorder** (`#` handle → `sort_order`) and **column header drag** on flat grids.
5. **SearchableSelect `allowCreate`** + **MultiSearchableSelect** for Resource type and Required skills; Phase # / Type / Priority as searchable singles from live/fixed lists.
6. Planning defaults + `required_skills` (already done earlier in this plan) remain wired into detail forms.
7. Shared helpers: `packages/shared/src/industryPlanGridUtils.js`; UI utils: `packages/ui/src/searchableSelectUtils.js`.
8. Docs: `Documentation/Industry_Plan_Template_Grid_Editor.md`.

### Key files
- `modules/content/src/pages/IndustryPlanPayloadEditor.jsx`
- `modules/content/src/pages/IndustryPlanGridViews.jsx` (new)
- `packages/shared/src/industryPlanGridUtils.js` (new)
- `packages/ui/src/SearchableSelect.jsx` (`allowCreate`)
- `packages/ui/src/MultiSearchableSelect.jsx` (new)
- `packages/ui/src/searchableSelectUtils.js` (new)

### Verification
- Shared: `industryPlanGridUtils` + `planningDefaults` — 14 tests green.
- UI: `searchableSelectUtils` — 6 tests green.
- Content module production build — success.

### Follow-ups (out of scope)
- Companion monorepo plan for Platform/Simulator `IndustryTemplateWizardEditors.jsx` (parity flag).
- Surfacing `planned_*` defaults onto live project schedule records after template instantiation.
