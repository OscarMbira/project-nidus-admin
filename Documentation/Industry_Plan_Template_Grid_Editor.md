# Industry Plan Template Grid Editor (Admin v181 / v183)

## Overview

The Admin **Global Template Library** `industry_plan` editor (`IndustryPlanPayloadEditor`) supports **Card ⊞ / Grid ≡** view modes on every entity tab (Phases, Activities, Deliverables, Risks, Milestones, Roles).

**Chosen layout: Option B**

- **Phases tab (Grid):** WBS hierarchy — phases as group headers (`1`, `2`…); Activities / Deliverables / Milestones nested as `1.1`, `1.2`… WBS numbers are **display-only** (never persisted).
- **Other entity tabs (Grid):** Flat spreadsheet with compact columns + click-to-open master/detail panel.
- **Risks / Roles:** Flat grids only (no `phase_number` in the data model).

View preference is remembered per tab in `localStorage` (`nidus.admin.industryPlan.view.<tab>`).

## Platform / Simulator parity (monorepo v190)

The same Card/Grid, WBS indentation, Columns ▾, and custom-column behaviours are available on Platform and Simulator PMO Industry Template wizards. See:

- `E:\project-nidus\projectplan\v190_industry_plan_grid_parity_platform_simulator_plan.md`
- `E:\project-nidus\Documentation\Industry_Plan_Template_Grid_Parity.md`
- SQL: `E:\project-nidus\SQL\v782_industry_plan_grid_parity_columns.sql`

## Column chooser (v183 / v184 — MS Project Insert Column + custom)

Use **Columns ▾** on the WBS panel and each flat entity grid to:

1. See **Available** (hidden) standard fields
2. **Show** a field (appends before Actions)
3. **Hide** a shown optional field (✕ in the chooser)
4. **Reorder** optionals by dragging rows in Shown, or by dragging column headers on the grid
5. **Reset to default**
6. **Define custom columns** (v184) — label + type (`text` / `number` / `yes_no`), Edit, Delete

**Locked columns** (not hideable / not reorderable): WBS · Kind · Name · Actions (WBS); `#` · primary name · Actions (flat grids).

**Show/hide order persistence:** `localStorage` keys `nidus.admin.industryPlan.columns.wbs` and `nidus.admin.industryPlan.columns.<tab>` (per browser/admin).

**Custom column definitions** are stored on the template payload (travel with save/publish):

```json
{
  "ui": {
    "custom_column_defs": [
      { "id": "cf_a1b2c3", "label": "QA pack ref", "type": "text" }
    ]
  },
  "activities": [
    { "activity_name": "…", "custom_fields": { "cf_a1b2c3": "Foundation QA pack" } }
  ]
}
```

- Apply to **all** entity kinds (phases, activities, deliverables, milestones, risks, roles)
- Max **10** custom columns per template
- **Delete** removes the definition and strips values from all rows
- Grid cells are **read-only**; edit values in the row detail modal (Custom columns section)

Catalog + helpers: `packages/shared/src/industryPlanGridColumns.js`  
CRUD helpers: `addIndustryPlanCustomColumn` / `update…` / `delete…` in `globalTemplateUtils.js`  
Chooser UI: `modules/content/src/pages/IndustryPlanColumnChooser.jsx`

## Searchable fields (Activity detail)

| Field | Control |
|---|---|
| Phase # | `SearchableSelect` from live `plan.phases` |
| Type / Priority | Fixed option lists |
| Resource type | `SearchableSelect` + `allowCreate` from distinct template values |
| Required skills | `MultiSearchableSelect` (chips + create) |
| Locked | Checkbox (unchanged) |

## Key files

| Path | Role |
|---|---|
| `modules/content/src/pages/IndustryPlanPayloadEditor.jsx` | Tab shell + Card/Grid wiring |
| `modules/content/src/pages/IndustryPlanGridViews.jsx` | Flat grid, WBS panel, per-kind detail forms |
| `modules/content/src/pages/IndustryPlanColumnChooser.jsx` | Columns ▾ popover |
| `packages/shared/src/industryPlanGridUtils.js` | `groupByPhase`, `reorderListItems`, option helpers |
| `packages/shared/src/industryPlanGridColumns.js` | Column catalog, layout normalize/move/show/hide |
| `packages/ui/src/SearchableSelect.jsx` | `allowCreate` |
| `packages/ui/src/MultiSearchableSelect.jsx` | Multi-value chips |
| `packages/ui/src/searchableSelectUtils.js` | Pure helpers (unit-tested) |

## Row-level add (WBS + flat grids)

- **Phases → Grid (WBS):** each phase and child row has **+ Add**:
  - Phase: activity / deliverable / milestone under that phase, or phase after this one
  - Child: **Add nested … under this** creates a deeper child (`parent_id`, WBS `1.2.1`); **Add sibling** stays at the same level
- Click a grid/WBS row (or add a new one) to open the **Row detail popup** (`AdminModal`); the old inline panel under the grid is removed.
- Nesting uses stable `row_id` / `parent_id` on plan rows (assigned automatically if missing)

## Required skills seed (v182)

Apply `SQL/v182_industry_plan_required_skills_seed.sql` to populate `required_skills` on Global Template Library `industry_plan` activities.

- Fills empty lists and **appends** missing skills only (case-insensitive; no duplicates).
- Construction close-out / PM activities get skills such as Phase gate facilitation, Close-out documentation, Handover coordination, plus phase-specific items (e.g. Foundation inspection).
- Cap: 8 skills per activity.
- Re-publish the template if Platform/Simulator copies must pick up the change.

```bash
node scripts/run-admin-sql.js SQL/v182_industry_plan_required_skills_seed.sql
```

## Manual check

1. Open Content → Global Template Library → an `industry_plan` record.
2. On Phases, switch to Grid ≡ — confirm WBS expand/collapse and row detail.
3. Click **Columns ▾** — show Priority / Planned hours; drag headers; reload and confirm layout persists.
4. On Activities, use searchable Phase / Resource / Skills; create a new resource type.
5. Drag `#` to reorder rows; save and reload — `sort_order` retained.
6. After v182 seed: open an activity detail → Required skills shows chips and the Add skill… list is populated.
