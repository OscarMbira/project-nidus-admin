# v183 — Industry Plan WBS: MS Project–style Column Chooser

**Repo:** `E:\project-nidus-admin` (Admin `content` module)  
**Depends on:** v181 (WBS grid, planning defaults, nested `row_id`/`parent_id`, row-detail modal)  
**Status:** ✅ Complete (Phase A)  
**Docs:** `Documentation/Industry_Plan_Template_Grid_Editor.md`

## Goal

On the **Phases → Grid (WBS)** table (circled header row: WBS / Kind / Name / Duration / Actions), let the admin work like **MS Project → Insert Column**:

1. **See which standard columns are available but not shown**
2. **Add (show)** a column from that list
3. **Hide** a column they no longer want in the grid
4. **Drag-drop column headers** to rearrange left↔right
5. Remember the layout (local preference; optionally later persist on the template)

Same behaviour should apply to the **flat entity grids** (Activities / Deliverables / …) for consistency — WBS is the primary surface you circled.

## How MS Project does it (what we mirror)

| MS Project | Our equivalent |
|---|---|
| Right-click header → **Insert Column** | **Columns** button / header menu → chooser panel |
| List of unused fields | **Available (hidden)** list of standard fields |
| List of fields already on the view | **Shown** list (order = header order) |
| Drag column headers to reorder | Drag headers (and/or drag rows inside the chooser) |
| Hide column | Remove from Shown (field stays in Available) |
| Custom fields (Text1, etc.) | **Optional Phase B** — true user-defined columns (see below) |

We do **not** invent % Complete / Actual / Baseline columns (still out of scope for templates — same as v181).

## Column catalog (standard fields)

Define a single **field registry** in shared code (e.g. `packages/shared/src/industryPlanGridColumns.js`):

### Always locked (not hideable / not reorderable past fixed positions)

| Key | Label | Notes |
|---|---|---|
| `wbs` | WBS | Display-only outline number |
| `kind` | Kind | Phase / Activity / Deliverable / Milestone |
| `name` | Name | Maps per kind (`phase_name`, `activity_name`, …) |
| `_actions` | Actions | + Add (and Remove on flat grids) — always last |

### Available to show/hide (standard “Insert Column” pool)

| Key | Label | Applies to | Already on row schema? |
|---|---|---|---|
| `duration` | Duration | Phase + activity (+ empty for others) | Yes (`estimated_duration` / `typical_duration`) |
| `phase_number` | Phase # | Children | Yes |
| `activity_type` / `type` | Type | Activity / Deliverable | Yes |
| `resource_type` | Resource type | Activity | Yes |
| `typical_effort` | Effort | Activity | Yes |
| `priority` | Priority | Phase / Activity / Deliverable / Milestone | Yes (v181) |
| `planned_hours` | Planned hours | same | Yes |
| `planned_cost` | Planned cost | same | Yes |
| `start_offset_days` | Offset (days) | same | Yes |
| `is_locked` | Locked | same | Yes |
| `is_mandatory` | Mandatory | Deliverable | Yes |
| `is_key_role` | Key role | Role (flat grid only) | Yes |
| `likelihood` / `impact` / `risk_category` | Risk fields | Risk (flat) | Yes |
| `required_skills` | Skills | Activity (compact chip/count in grid) | Yes |

**Default visible (WBS):** `wbs`, `kind`, `name`, `duration`, `_actions` — matches today’s table.  
**Default hidden:** everything else in the pool (Priority, Hours, Cost, Resource, …) — same idea as MS Project’s lean default view.

Cells for a kind that doesn’t own a field render **—** (never invent values).

## UI proposal

### 1) Header toolbar control
Next to Card/Grid toggle on Phases (and each flat-grid tab):

**Columns ▾** → opens a popover / small modal:

```
Shown                          Available
─────────────                  ─────────────
⠿ Name                         □ Priority
⠿ Duration                     □ Planned hours
⠿ …                            □ Resource type
                               □ …
[+ Add from available]         (click = move to Shown at end)
```

- Drag within **Shown** to reorder (same order as headers).
- Click **✕** on a Shown row (except locked) → moves back to Available.
- Click an Available row → appends to Shown.
- **Reset to default** link.

### 2) Drag headers on the grid
Reuse the Form Template / flat-grid pattern already in `IndustryPlanFlatGrid`:

- Shown (non-locked) headers are `draggable`
- Drop on another header → reorder `columnOrder`
- Visual opacity while dragging

Locked columns (`wbs`, `kind`, `name`, `_actions`) stay put (or only `name`+optional fields reorder between `kind` and `_actions`).

### 3) Optional: right-click header
“Insert Column…” / “Hide Column” — nice parity with MS Project; can ship in the same change or as a thin follow-up if the Columns button is enough for v1.

## Persistence

| Option | Pros | Cons |
|---|---|---|
| **A. `localStorage` per admin user** (recommended for v1) | Instant; no SQL; matches Form Template field-view prefs | Not shared across machines/admins |
| **B. Store on template payload** (`ui.wbs_columns`) | Layout travels with the published template | Couples presentation to catalog JSON; every editor shares one layout |
| **C. Both** — local override of template default | Best of both | More logic |

**Recommendation:** **A for v1**, key like `nidus.admin.industryPlan.wbsColumns` (+ per-tab keys for flat grids). Flag B/C if you want publishable column layouts later.

## “Custom columns” — clarify two meanings

### Phase A — Standard column chooser (this plan’s core)
Show/hide/reorder fields that **already exist** on the industry-plan row schema. This is the MS Project **Insert Column** experience. **No new DB/SQL.**

### Phase B — True custom columns (optional, separate decision)
Admin defines a new column (label + type: text/number/yes-no) stored as:

```json
"custom_fields": { "cf_abc": "Foundation QA pack" }
```

on each row, plus a template-level definition list:

```json
"ui": { "custom_column_defs": [{ "id": "cf_abc", "label": "QA pack ref", "type": "text" }] }
```

Needs normalize/build updates, modal field editors, and chooser integration. **Larger; only do if you explicitly want freeform columns beyond the standard pool.**

**Please confirm:** ship **Phase A only**, or **A + B**?

## Scope of work (Phase A)

- [x] `industryPlanGridColumns.js` — catalog, default shown/hidden, `normalizeColumnLayout(shownKeys)`, `moveColumn(order, from, to)`
- [x] `ColumnChooserPopover` (or modal) in `IndustryPlanGridViews.jsx` / small UI component under `packages/ui` if reusable
- [x] Wire into **WBS** table: dynamic `<th>` / cell renderers from shown keys; drag headers; Columns button
- [x] Wire into **flat grids** (Activities, Deliverables, Risks, Milestones, Roles): same chooser + persist key per tab
- [x] Inline compact cell editors for scalar shown fields (optional v1.1) — **v1 can be display-only in grid**, edit still via row modal (simpler, safer). Prefer display-only first unless you want Excel-like typing in cells.
- [x] Unit tests: normalize layout, move column, hide locked keys rejected, default restore
- [x] Docs update + Review section in this plan
- [x] `pnpm turbo build --filter=@nidus-admin/content`

## Explicitly out of scope

- % Complete / Actual / Baseline columns  
- Gantt bars  
- Platform/Simulator `IndustryTemplateWizardEditors` parity — **done in monorepo v190** (`SQL/v782`, `@nidus/ui` industry plan grids)  
- Persisting column layout into Supabase unless you pick Option B/C  
- Phase B true custom columns — **done in Admin v184**; Platform/Simulator via monorepo v190  

## Decisions (confirmed via implementation defaults)

1. **Phase A only** (standard Insert Column) — Phase B deferred  
2. Persistence: **localStorage (A)** — keys `nidus.admin.industryPlan.columns.wbs` / `.columns.<tab>`  
3. Grid cells: **read-only until modal**  
4. Apply chooser to **WBS + all flat entity grids**

## Todo checklist (implementation)

- [x] Confirm decisions 1–4 above  
- [x] Column catalog + layout helpers + tests  
- [x] Column chooser UI (Shown / Available + drag)  
- [x] WBS header drag-reorder + dynamic columns  
- [x] Flat-grid parity (if approved)  
- [x] Persistence per decision  
- [x] Docs + mark this plan Review 100%  

## Review

**Status: 100% complete (Phase A)**

### What shipped

| Area | Change |
|---|---|
| Shared helpers | `packages/shared/src/industryPlanGridColumns.js` — catalog, normalize/move/show/hide, localStorage load/save, `formatIndustryPlanCell` |
| Unit tests | `packages/shared/src/__tests__/industryPlanGridColumns.test.js` |
| Chooser UI | `modules/content/src/pages/IndustryPlanColumnChooser.jsx` — Shown / Available, drag reorder, hide/show, Reset |
| WBS | Dynamic headers/cells from layout; header drag; Columns ▾; storage `…columns.wbs` |
| Flat grids | Same pattern per tab via `FLAT_COLUMN_CONFIG`; storage `…columns.<listKey>` |
| Docs | `Documentation/Industry_Plan_Template_Grid_Editor.md` updated for v183 |

### Decisions applied

- Phase A only (no freeform `custom_fields`)
- localStorage persistence (not template payload)
- Read-only grid cells; edit via row modal
- WBS + all flat entity grids

### Follow-ups (not in this release)

- Phase B custom columns
- Right-click header “Insert / Hide Column”
- Platform/Simulator wizard parity
- Template-payload column layout (Option B/C)
