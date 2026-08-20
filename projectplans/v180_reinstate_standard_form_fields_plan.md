# v180 — Reinstate removed standard fields (Admin Form Template editor)

**Repo:** `E:\project-nidus-admin`  
**Surface:** Global Template Library → `form_template` → Form layout (`FormTemplatePayloadEditor.jsx`)  
**Status:** ✅ Complete

## Decisions (locked)

1. **Scope:** session restore **+** F001–F068 system catalog restore.
2. **Placement:** restored fields are **appended at the end of the section** (user can drag-reorder).
3. **Fields only** (not whole sections).

## What shipped

| Artifact | Purpose |
|----------|---------|
| `packages/shared/src/formTemplateStandardFields.js` | Clone / list missing / restore candidates / append helpers |
| `packages/shared/src/formTemplateStandardFieldsCatalog.json` | F001–F068 standard section/field definitions |
| `scripts/generate_form_template_standard_catalog.mjs` | Regenerate catalog from monorepo `v759` seeds |
| `FormTemplatePayloadEditor.jsx` | **Restore field…** next to **+ Add field** (card + table) |
| Tests | `formTemplateStandardFields.test.js` (5 cases) |
| Docs | `Documentation/Global_Template_Export_Guide.md` (reinstate section) |

## How to use

1. Remove a field (when more than one remains).
2. Click **Restore field…**.
3. Choose **Removed this session** or **Standard catalog**.
4. Field appears at the **end of the section** — drag `#` handle to reorder.
5. Save the global template (and Publish if Platform/Sim should pick it up).

## Review

Admin form template editor can reinstate removed or missing standard fields without blank stub recreation. Platform/Simulator builders already block catalog deletion (Field Availability only) — no parity change required for v180.
