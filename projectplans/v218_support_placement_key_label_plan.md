# v218 — Menu Placements: "Support" placement key (Project Administrator)

**Monorepo source:** `E:\project-nidus\projectprd\v1343_project_administrator_support_role_PRD.md`, `E:\project-nidus\projectplan\v1343_project_administrator_support_role_plan.md` (slice 6). SQL `E:\project-nidus\SQL\v1471_project_administrator_role_and_support_menu.sql` adds `support` to the `menu_item_placements.placement_key` CHECK.

## Change
- [x] `packages/shared/src/menuPlacementServices.js`: `PLACEMENT_KEY_LABELS.support = 'Project Administrator (Support)'`. Admin › System › Menu Placements lists and edits the new key.
- [x] No Admin SQL. The v249 placement RPCs pass the key through, and the monorepo CHECK (v1471) validates it.

## Review
One label added. The menu placement pages read `PLACEMENT_KEY_LABELS`, so the key appears in the key picker and tables. No other Admin surface lists placement keys.
