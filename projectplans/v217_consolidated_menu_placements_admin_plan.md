# v217 — Consolidated role menus: Admin placement screens and switch

> **Monorepo:** `E:\project-nidus\projectprd\v1341_consolidated_role_menus_PRD.md` / `E:\project-nidus\projectplan\v1341_consolidated_role_menus_plan.md` (Slice 13; decisions D20, D21, D29, D30; requirement R1).
> **Status:** Code complete 2026-11-13. SQL `v249` written, not run (owner runs after monorepo v1449–v1459).

## Scope

Admin is the only place that writes the consolidated sidebar's placement data and turns the
"single sidebar per role" on or off. Platform and Simulator only read it.

## Todo

- [x] `SQL/v249_consolidated_menu_admin_rpc.sql`
  - permissions `system.menu_placements.view` / `.edit` (super_admin, system_admin)
  - read RPCs: sections, slots, placements per key, menu item search, per-organisation switch list
  - write RPCs (reason required, audited): section, slot, placement upsert / delete, default section, switch for one organisation (D20), switch for all organisations (D30)
  - nav nodes: Menu Placements, Menu Sections & Slots
- [x] `packages/shared/src/menuPlacementServices.js` (+ export) and tests
- [x] `modules/system`: `MenuPlacementsPage` (list by role and section, search, card / table, export, add / edit / remove, turn on / off for all), `MenuPlacementFormPage` (routed, Audit tab), `MenuSectionsPage`, `MenuSectionFormPage` (routed, Audit tab); routes in `modules/system/src/index.jsx`; `defaultAdminNav.js` entries
- [x] Organisations list: "Single sidebar" column and the per-organisation manage action
- [x] `CLAUDE.md` (both repos): narrow cross-schema write exception

## Review

- **Run order:** monorepo SQL v1449 … v1459, then this repo's `SQL/v249`. Turning the switch on for all organisations is the go-live step (D30); turning it off for one organisation is the rollback.
- **Success messages:** saves use the Admin toast confirmation (`useToast().showSuccess`), the pattern every existing `modules/system` form uses.
- **Tests:** `packages/shared/src/__tests__/menuPlacementServices.test.js` (7 tests: RPC parameters for the switch, all-organisations switch, placement defaults, error text, the 15 placement keys, section grouping, nav entries). The new pages were syntax-checked; `modules/system` and `modules/users` have no page test harness.
- **Not included:** editing a menu item's catalogue row (label, route, grants) stays in the existing Industry Pack / role tools and SQL; this screen only places items.
