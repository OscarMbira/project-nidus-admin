# v194 — Rename "PMBOK" sidebar label to "Standards-Based"

## Why
PMBOK is a PMI trademark, same category of risk as "PRINCE2" (already renamed to "Structured" per Admin CLAUDE rule 27). This closes that gap so all three Global Template Library methodology tracks use non-trademarked display labels: **Standards-Based** (was PMBOK) / **Structured** (was PRINCE2) / **Agile**.

Scope is **display label only**. The underlying `methodology` column/enum value (`'pmbok' | 'structured' | 'agile'`, see monorepo `SQL/v785_project_template_domain_and_methodology.sql`) and all `methodology=pmbok` query params are unchanged — relabeling the value itself would require a data migration across `public`/`sim`/`admin` schemas, which is out of scope for a UI naming change.

## Todo
- [x] `packages/shared/src/defaultAdminNav.js` — 6 sidebar `label: 'PMBOK'` entries (Templates × Portfolio/Programme/Project, Forms/Content Coverage/Process Docs group headers) → `Standards-Based`
- [x] `modules/content/src/pages/GlobalTemplateLibraryList.jsx` — methodology chip + category group label
- [x] `modules/content/src/pages/DefaultContentLibraryPage.jsx` — methodology filter + category group label
- [x] `modules/content/src/pages/GlobalTemplateLibraryForm.jsx` — methodology dropdown option + helper text
- [x] `packages/shared/src/__tests__/defaultAdminNav.globalTemplates.test.js` — updated label assertions
- [x] `Documentation/Global_Template_Library_Methodology_Guide.md` — updated display-label references (SQL file names and `methodology=pmbok` values left as-is — those are code identifiers, not UI text)
- [x] Ran `@nidus-admin/shared` test suite — the 6 updated nav tests pass (one unrelated pre-existing failure in `documentationContentUtils.test.js`, not touched by this change)

## Not in scope
- Monorepo `apps/platform/src/config/methodologyMenuUtils.js` PMO sidebar track labels (`"Predictive - PRINCE2"` / `"Predictive - PMBOK"`) — a separate Platform/Simulator end-user surface, not shared with Admin (Admin CLAUDE rule 34.4: sidebar menus are app-specific). Flagged to the user as a possible follow-up, not renamed here.
- `methodology` enum/column values, DB CHECK constraints, seed file names (`v185c_pmbok_...`, `v188b_...`) — unchanged.

## Review
Six files touched (one config, three pages, one test, one doc). No schema or route changes. Verified via the updated Vitest suite; visual sidebar check still recommended next time the Admin app is run locally.
