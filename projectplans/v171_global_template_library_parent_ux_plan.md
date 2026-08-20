# v171 — Global Template Library as parent (UX + pagination)

**Status:** COMPLETE  
**Problem:** The list CTA **Sync from Platform catalog** framed Platform as parent. Users also saw “only 20” industries because `AdminTable` sliced to `pageSize=20` with no pager controls, even when the library already held ~51 rows.

## Intent

- **Parent:** `admin.global_template_library`
- **Children:** Platform (`public`) + Simulator (`sim`) via Publish
- Bootstrap import from Platform remains available only when `missing_count > 0`

## Deliverables

| Item | Change |
|------|--------|
| `packages/ui/src/AdminTable.jsx` | Showing X–Y of Z + Previous/Next |
| `GlobalTemplateLibraryList.jsx` | Parent copy; primary **Publish to Platform & Simulator**; demote import; remove duplicate `#`; card pager |
| `globalTemplateServices.js` | `publishAllGlobalTemplates()` |
| Guide | Parent model + pagination notes |

## Review

- Pagination exposes all ~50 industry plans across pages (25/page).
- Primary action pushes library → Platform/Simulator; Platform import is bootstrap-only.
- No new SQL required (uses existing publish + v170 status/import RPCs).
