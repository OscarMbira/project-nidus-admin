# v190 — Form layout table: drag-reorder fields (Edit + View)

## Goal

Allow users to rearrange form fields by dragging rows in **table view** on Global Template Form, in both **Edit** and **View** modes.

## Context

`FormTemplatePayloadEditor` already supported HTML5 drag on the `#` handle and column headers, but only when `!readOnly`. View mode set `readOnly` and wrapped the layout in a disabled `<fieldset>`, which blocked drag. Approval-lock (`unauthorised`) must still forbid reorder.

## Approach (minimal)

1. Pass `viewMode` into `FormTemplatePayloadEditor` when View + edit permission + form_template.
2. `canReorderFields = !readOnly || viewMode` (pending approval: readOnly, not view → no drag).
3. Render the fields **table outside** the disabled fieldset; keep inputs `disabled`/`readOnly` in view; drag handle active when `canReorderFields`.
4. In View, mark form dirty when field order changes and show **Save field order** (same `updateGlobalTemplate` path). Requires `content.global_templates.edit`.
5. Column-header reorder stays Edit-only. Card view unchanged.
6. Theme-aware polish on section chrome while touching the file (rule 28.1).

## Todo

- [x] `FormTemplatePayloadEditor` — viewMode + canReorderFields + table outside fieldset
- [x] `GlobalTemplateLibraryForm` — pass viewMode; dirty/Save in view for form_template reorder
- [x] Export `reorderArray` helper + unit test
- [x] Review section

## Review

**Status:** Complete (2026-07-21)

### Changes

| File | Change |
|---|---|
| `modules/content/.../FormTemplatePayloadEditor.jsx` | Table row drag in Edit + View; table outside disabled fieldset; theme-aware section chrome |
| `modules/content/.../GlobalTemplateLibraryForm.jsx` | `viewMode` / Save field order when dirty in view; edit-permission gated |
| `packages/shared/.../industryPlanGridUtils.js` | `reorderArray()`; `reorderListItems` delegates to it |
| `packages/shared/.../__tests__/industryPlanGridUtils.test.js` | `reorderArray` coverage |

### How to use

1. Open a Form Template → **Table** layout.
2. Drag the **⠿ #** handle to a new row position.
3. **Edit:** Save as usual. **View:** click **Save field order** (appears after a reorder).

Approval-locked records remain non-reorderable.
