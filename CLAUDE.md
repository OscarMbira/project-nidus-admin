# project-nidus-admin — Development Guide

## Quick start

```bash
cd "E:\project-nidus-admin"
pnpm install
pnpm run dev
```

Shell: http://localhost:5175 | Modules: 5180–5198

`pnpm run dev` starts the light set (shell, platform, users, admin-mgmt) — the low-disk-I/O default. Use `pnpm run dev:full` to start shell + every module (needed when working on a module outside the light set, e.g. docs-centre, testing-centre, email-centre).

**Module federation dev:** Remote modules run `vite build` + `vite preview` (not `vite dev`) so `remoteEntry.js` is served correctly.

## Documentation & Testing (required for all features)

Every **new or amended** admin feature must include:

1. **Module documentation** — Add or update Markdown in `modules/{module}/docs/` (one guide per major workflow). General guides live in `modules/docs-centre/docs/general/`. Include a short `README.md` in the module `docs/` folder listing guides.
2. **DB guide index** — Register guides in `admin.documentation_guides` via seed SQL (`SQL/v{N}_*_seed_data.sql`) when adding new guides.
3. **CI doc sync** — Docs sync to Supabase Storage on push to `main` via each module’s GitHub Actions workflow (`scripts/sync-module-docs.js`). No redeploy needed for doc-only changes.
4. **Testing** — New UI flows need Playwright coverage under `e2e/tests/admin/` where practical; complex features should note manual test steps in the module guide. Use the **Testing Centre** (`/testing-centre`) for runs, evidence, and defect linking.
5. **Sidebar** — Add nav entries in `SQL` seed (`admin.nav_nodes`) and mirror in `packages/shared/src/defaultAdminNav.js` fallback.
6. **Unsaved changes guard** — Every **new or amended** create/edit form must call `useUnsavedChangesGuard(isDirty, message?)` from `@nidus-admin/shared` (provider is mounted in `shell/src/App.jsx`). Compute `isDirty` by diffing loaded record vs current form state; use `requestNavigation()` for back/cancel navigation and `confirmDiscard()` for close actions without route changes. Existing forms adopt opportunistically when touched.
7. **Approval justification & field lock (Record Lifecycle)** — Every decision surface for a governed record (Approve/Reject, whether from the record's own governance panel or the My Approvals queue) must require a mandatory justification/comments field before the decision can be confirmed — use `useConfirmAction({ requireReason: true, ... })` from `@nidus-admin/ui`, which blocks confirmation while the reason is empty/whitespace-only. Label the field for its purpose (e.g. "Approval justification (required)" / "Rejection reason (required)"), not a generic "Reason". While a record's `record_status === 'unauthorised'`, its data-entry form must render read-only (wrap the field block in `<fieldset disabled>`) so the approver can review the pending change but not alter the underlying data — pair with a pending-approval banner/ribbon. See `projectplans/v19.0_approval_justification_and_field_lock_plan.md`.

## Architecture

- **Shell** (`@nidus-admin/shell`) — auth, layout, federation host
- **Modules** (`modules/*`) — independent federated remotes
- **Packages** (`packages/ui`, `packages/shared`) — shared components and utils

## SQL

**Repo scope:** When working in **`project-nidus-admin`**, create and version all SQL here — not in `project-nidus`.

- **Location:** `E:\project-nidus-admin\SQL\` — `v{N}_{name}.sql` (e.g. `v56_affiliate_program.sql`).
- **Version incrementing:** Check `SQL/` for the latest `v{N}` before adding a file. If the latest is `v59`, the next is `v60`. Never skip or duplicate numbers.
- **Schema focus:** Migrations here typically target the **`admin`** schema (permissions, nav, admin RPCs, admin tables). Platform/Simulator schema changes (`public`, `sim`) belong in **`E:\project-nidus\SQL\`** when that work is done from the platform repo.
- **Cross-repo features:** A feature may need SQL in both repos (e.g. admin affiliates in v56 + platform click tracking in project-nidus). Each file stays in the repo where that work is implemented.
- **Design:** Mutations via `SECURITY DEFINER` RPCs, `admin.check_admin_permission()`, and `admin.log_admin_action()`.
- **Seed data:** Companion `SQL/v{N}_{feature}_seed_data.sql` after infrastructure migrations; idempotent (`ON CONFLICT`, fixed hex-only UUIDs). Add `pnpm run admin:migrate-*` / `admin:seed-*` scripts in `package.json` when needed.

## Project Plans

**Repo scope:** When working in **`project-nidus-admin`**, write all plans for admin work here — not in `project-nidus` or Cursor internal plan files.

- **Location:** `E:\project-nidus-admin\projectplans\` — `v{version}_{plan_name}.md` (e.g. `v10.0_affiliate_program_plan.md`).
- **Version incrementing:** Check `projectplans/` for the highest version; increment for each new plan.
- **Cross-repo features:** The admin plan lives here; a companion plan in `E:\project-nidus\projectplan\` may cover platform/simulator UI when that side is implemented there. Reference the other repo’s SQL/plan paths explicitly — do not duplicate files across repos.
- **Write target:** Plans go **directly** into `projectplans/` (never internal/system plan files).
- **Completion marking:** Update phases, checklists, and **Status** in the plan file as work progresses.

## Super Admin

```bash
pnpm run admin:seed-super
```

## Sidebar Navigation

- **All new features/functionalities must be added to the sidebar menu** in `shell/src/components/layout/AdminSidebar.jsx` for easy access and navigation.
- Each feature should have its own collapsible section in the `NAV_SECTIONS` array with appropriate role-based access control.
- Always specify which admin roles can see each section and item via the `roles` array.

## New module

Copy `modules/_template/`, register in `shell/src/moduleConfig.js` and `shellRoutes.jsx`.

**Keep `DEV_MODULES.md` in sync.** This repo's module dev-start reference is `E:\project-nidus-admin\DEV_MODULES.md`. Whenever a module is added, add its row (module, port, `turbo dev --filter` command). Whenever a module is completely removed, delete its row. Do this as part of the same change that adds/removes the module — do not leave it for a follow-up.

## Security

- Never commit `.env.local` or service role keys
- `dev-start-all.bat` is gitignored — dev only
- Default theme: dark

## Record lifecycle permissions

Governed catalog tables use `lifecycle.*` permission keys (`lifecycle.configure`, `lifecycle.authorise`, `lifecycle.view_all`). Wire UI actions with `<PermissionGate permission="lifecycle.…">` and route mutations through `packages/shared/src/lifecycleServices.js` RPC wrappers. Add new governed tables via `admin.record_lifecycle_config` seed data — no schema change required.
