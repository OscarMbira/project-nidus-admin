# v193 — Portfolio / project template Card ⊞ / Table ≡ toggle

## Goal

Add the same Card ⊞ / Table ≡ view toggle used on **Roles** / **Risks** to the other list tabs on Global Template Form (portfolio + project templates reuse `PortfolioTemplatePayloadEditor`; programme uses the sibling editor).

## Tabs covered

| Kind | Tabs |
|------|------|
| Portfolio / Project | Objectives, Governance, Benefit categories, Metrics (+ existing Risks, Roles) |
| Programme | Governance, Dependencies, Benefits (+ existing Milestones, Risks, Roles) |

Overview stays form-only (no list toggle).

## Todos

- [x] Extend `FLAT_COLUMN_CONFIG` / `formatIndustryPlanCell` for benefit categories, objectives, governance, metrics, benefits, dependencies
- [x] Add `columnKey` support on `IndustryPlanFlatGrid` (programme vs portfolio governance)
- [x] Add `ToggleListSection` + detail components in `PortfolioProgrammeTemplateEditors.jsx`
- [x] Wire remaining CardList-only tabs to `SectionToolbar` + grid/card toggle
- [x] Improve `detailTitleFor` labels for new list kinds

## Review

**Files touched (Admin):**

- `modules/content/src/pages/PortfolioProgrammeTemplateEditors.jsx` — toggle on all list tabs
- `modules/content/src/pages/IndustryPlanGridViews.jsx` — detail modal titles for new kinds
- `packages/shared/src/industryPlanGridColumns.js` — column catalogs + cell formatters (from earlier in this workstream)

**Behaviour:** Each list tab remembers Card vs Table per kind+tab via `localStorage` (`nidus.admin.ppTemplate.view.*`). Table mode uses the Roles-style flat grid (row click → detail modal). Card mode keeps the previous stacked fieldsets.

**Verify:** Open a project/portfolio template → Benefit categories → use ⊞ / ≡ toggle; switch tabs and confirm preference sticks; programme Governance uses programme column set.
