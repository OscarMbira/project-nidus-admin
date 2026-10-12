# v211 — Project Planner edition: Admin controls

**Status:** Implemented 2026-10-11 (monorepo plan v1239 Slice 8.4, approved 2026-10-11). Owner test pending.
**Monorepo plan:** `E:\project-nidus\projectplan\v1239_dual_mode_planning_product_plan.md` (D13).

## Scope (D13)

Only these Admin changes. No other Planner screens in Admin.

1. Edition badge and filter on **Users & Orgs → Organisations**.
2. An audited **Change edition** action on the same list, with a mandatory reason.
3. A **Planner Menu Availability** page: an "Available in Planner" toggle per `pln_` menu item. It writes `public.planner_menu_allowlist` through a narrow SECURITY DEFINER RPC.
4. Planner plan pricing in the existing **Plan Catalog**: plan type `planner` was added to `PLATFORM_PLAN_TYPES`.

## Tasks

- [x] `SQL/v227_planner_edition_admin_rpc.sql`
  - Permissions: `accounts.edition.change` (super_admin) and `system.planner_menu.edit` (super_admin, system_admin).
  - RPCs: `public.admin_change_account_edition`, `public.admin_list_planner_menu_items`, `public.admin_set_menu_planner_available`.
  - Seeds the `planner_public_signup` feature flag, **off**.
  - Reuses v225's `admin_require_public_site_permission`: the acting admin comes from the session, and a supplied id is honoured only for the service role.
  - Calls the monorepo's `public.apply_account_edition` (v1247), which no client can call directly.
- [x] `SQL/v228_planner_menu_availability_nav.sql`: sidebar node under System.
- [x] `packages/shared/src/plannerEditionServices.js` (+ test, 3 passing); `fetchAccounts` now selects `product_edition`.
- [x] `modules/users/src/pages/OrgListPage.jsx`: Edition column, edition filter chips, and a "Change edition to …" manage action. Light/dark classes are paired on the new chips.
- [x] `modules/system/src/pages/PlannerMenuAvailabilityPage.jsx` + route `/system/planner-menu`.
- [x] `packages/shared/src/subscriptionConstants.js`: `planner` plan type.
- [x] Builds: `@nidus-admin/users`, `@nidus-admin/system` pass.
- [x] `SQL/v229_subscription_plans_admin_read_inactive.sql` (found during the owner test, 2026-10-11): `subscription_plans` only had an `is_active = TRUE` read policy, so the Plan Catalog never listed inactive plans (the seeded Planner rows, or any deactivated plan). Adds an Admin-only SELECT policy through `public.auth_is_admin_user()`. Platform/Simulator users still see active plans only.

## Run order

Monorepo v1247 → v1248 → v1249 → v1254 → v1250, **then** Admin v227 → v228 → v229.
- Admin v227 calls `public.apply_account_edition` and writes `public.planner_menu_allowlist`; both are created by the monorepo SQL.
- `fetchAccounts` selects `product_edition`, so the Organisations list needs monorepo v1247 first.

## Cross-schema exception

Documented in both CLAUDE.md files. Admin writes `public.accounts.product_edition` and `public.planner_menu_allowlist` **only** through the v227 RPCs. Those RPCs are permission-gated and audited with `admin.log_admin_action`.

## Before launch (owner)

- Set the per-seat prices on the two inactive "Project Planner" catalog rows (monorepo v1248), then activate them.
- Turn on `planner_public_signup` (System → Feature Flags) at launch (D18 kill switch).

## Review

- Edition changes cannot bypass the payment path: the monorepo's `change_account_edition` refuses upgrades from clients. Only the payment webhook (service role) and this audited Admin RPC can upgrade.
- Not done here (out of D13 scope): trial extension UI. A trial can be extended by editing the account's `platform_subscriptions.trial_end` (support runbook in the Planner guide).
