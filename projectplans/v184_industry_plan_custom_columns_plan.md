# v184 — Industry Plan: Custom (local) columns

**Repo:** `E:\project-nidus-admin` (Admin `content` module)  
**Depends on:** v183 (standard column chooser)  
**Status:** ✅ Complete  
**Docs:** `Documentation/Industry_Plan_Template_Grid_Editor.md`

## Goal

In the **Columns ▾** popover, let the admin **define new columns** that are **not** in the standard field pool — local to the industry-plan template — then show/hide/reorder them like standard optionals.

This is **v183 Phase B** (true custom columns).

## Data model (on the template JSON payload)

```json
{
  "ui": {
    "custom_column_defs": [
      { "id": "cf_a1b2c3", "label": "QA pack ref", "type": "text" }
    ]
  },
  "activities": [
    {
      "activity_name": "…",
      "custom_fields": { "cf_a1b2c3": "Foundation QA pack" }
    }
  ]
}
```

| Piece | Where | Notes |
|---|---|---|
| Column definition | `plan.ui.custom_column_defs[]` | Survives save/publish with the template |
| Cell values | `row.custom_fields[id]` | Per entity row |
| Show/hide order | existing localStorage layout keys | Custom ids participate in optional pool once defined |

**Types (v1):** `text` · `number` · `yes_no`  
**Id:** `cf_` + short hex (stable; never rename id when editing label)

## Decisions applied

1. **Applies-to:** all entity kinds  
2. **Delete:** hard-delete def + strip `custom_fields` values  
3. **Cap:** max 10 custom columns per template  
4. Grid cells read-only; edit in row detail modal  

## Implementation todos

- [x] Confirm decisions  
- [x] Extend `normalizeIndustryPlanPayload` / `buildIndustryPlanPayload` for `ui.custom_column_defs` + per-row `custom_fields`  
- [x] Helpers: `newCustomColumnId()`, merge custom keys into column optional pool, add/update/delete plan helpers  
- [x] Column chooser: Add / Edit / Delete custom column UI  
- [x] Wire WBS + flat grids: labels + `formatIndustryPlanCell` for `cf_*` keys  
- [x] Row detail modals: render custom field editors by type  
- [x] Unit tests (normalize/build round-trip, delete strips values)  
- [x] Docs + Review 100%  
- [x] `pnpm turbo build --filter=@nidus-admin/content`

## Explicitly out of scope

- Platform/Simulator wizard parity (flag only)  
- SQL / new DB tables (payload JSON only)  
- Rich types (date, picklist, multi-select) — can add later  
- Inline grid editing of custom cells  

## Review

**Status: 100% complete**

### What shipped

| Area | Change |
|---|---|
| Shared catalog | `industryPlanGridColumns.js` — `normalizeCustomColumnDefs`, `mergeColumnOptsWithCustom`, `cf_*` cell formatting |
| Payload | `globalTemplateUtils.js` — normalize/build `ui.custom_column_defs` + `custom_fields`; `add/update/deleteIndustryPlanCustomColumn` |
| Chooser UI | Custom section under Available — Create / Edit / Delete |
| Grids + modals | WBS + flat grids show custom columns; detail forms have Custom columns editors |
| Tests | `industryPlanCustomColumns.test.js` |
| Docs | `Industry_Plan_Template_Grid_Editor.md` |

### Follow-ups (not in this release)

- Richer custom field types  
- Right-click header insert/hide  

### Platform / Simulator

Monorepo **v190** ports this behaviour to Platform + Simulator Industry Template wizards (`SQL/v782`, `@nidus/ui` industry plan grids). See `E:\project-nidus\projectplan\v190_industry_plan_grid_parity_platform_simulator_plan.md`.
