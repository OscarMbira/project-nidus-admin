# v186 — WBS Outline Level (Collapse / Expand All)

## Goal

Add MS Project–style outline navigation on the Industry Plan WBS grid:

- **Collapse all** → outline level 1 (phases only)
- **Expand all** → deepest outline level
- **Outline level** dropdown → show rows through level N (phase = 1, direct children = 2, …)

Must work in Global Template **view mode** (browse-only).

## Todos

- [x] Shared helpers: `computeMaxOutlineLevel`, `expandedMapForOutlineLevel`, `filterFlatByOutlineLevel` (+ tests)
- [x] Admin `IndustryPlanWbsPanel`: toolbar next to Columns; filter tree rows by level
- [x] Keep WBS grid outside disabled fieldset in view mode so controls stay usable
- [x] Platform/Simulator parity via `@nidus/ui` `IndustryPlanWbsGrid`
- [x] Hide row “+ Add” in view mode; row popup read-only when viewing

## Review

- Outline controls sit beside **Columns ▾** on the Phases WBS toolbar.
- Level 1 collapses every phase; Level N shows children with `depth <= N - 1`.
- Manually expanding a phase while at Level 1 raises the outline level so children can appear.
- Applied to Admin content module and monorepo shared WBS grid (Platform + Simulator).
