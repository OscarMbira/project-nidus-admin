# Record Lifecycle Management Guide

Admin documentation for maker-checker governance and the four-state record lifecycle. Edit this file in the module `docs/` folder; CI syncs to Supabase Storage on push to `main`.

## Overview

Record Lifecycle Management applies a four-eyes approval workflow and four lifecycle states to high-impact admin catalog tables:

| State | Meaning |
|---|---|
| **Unauthorised** | Submitted change awaiting authoriser approval |
| **Live** | Active, customer-facing or operational record |
| **History** | Superseded version retained for audit |
| **Archived** | Retained but no longer active |

Pilot tables (v15.0): subscription plans, affiliates, payment gateways, cancellation reason categories.

## Permissions

| Key | Who | Purpose |
|---|---|---|
| `lifecycle.configure` | Super Admin | Configure tables, authorisers, archive rules; break-glass validate override |
| `lifecycle.authorise` | Super Admin, System Admin | Approve or reject pending submissions (My Approvals) |
| `lifecycle.view_all` | Super Admin, System Admin | Cross-state read access |

Default rollout: every pilot table has `approval_enabled=TRUE` but **zero authorisers**, so changes still apply immediately (zero-authoriser bypass) until you assign authorisers.

## Defer-apply (v18.0)

When governance is active and an edit RPC detects changed fields, the change is **not** written to the catalog row immediately. Instead:

1. Changed columns are stored in `admin.record_pending_changes` as JSONB (`proposed_changes`).
2. The row's `record_status` moves to **Unauthorised**; all other columns keep their last-approved values.
3. The public subscription catalog (`get_public_subscription_plans`) continues to serve **unauthorised** rows using those unchanged column values until validation.
4. On **Approve** (record page or My Approvals), `decide_pending_record` / `process_authoriser_decision` merges `proposed_changes` onto the row, sets **Live**, and deletes the pending row.
5. On **Reject** (record page or My Approvals), pending changes are discarded and `previous_status` is restored (typically **Live**) without moving the record to **History**.

The edit form and governance panel show a **Pending changes** diff table (current approved value vs proposed) whenever `record_status = unauthorised`. **My Approvals** also offers **View changes** per queue row and a full review modal before Approve/Reject.

### Field lock during approval (v19.0)

While `record_status = unauthorised`, all data-entry fields on pilot edit pages are wrapped in a disabled `<fieldset>` — inputs, selects, textareas, and Save are not editable. An amber banner explains the lock. Authorisers review the deferred diff and enter a **mandatory justification** before Approve or Reject.

### Reject vs Discard record

| Operation | From unauthorised | Row field values | Result status |
|---|---|---|---|
| **Reject** | Authoriser rejects pending edit | Unchanged (defer-apply) | Restored to `previous_status` (usually Live) |
| **Discard record** | Explicit discard action on record page (`lifecycle.configure`) | Unchanged | **History** (retire the record) |

Authoriser **Reject** is available on both the record edit page and **My Approvals**. Both paths require a non-empty justification and call the same backend decision logic (`decide_pending_record` or `process_authoriser_decision`).

### Approve / Reject permission

The record-page **Approve** and **Reject** buttons require `lifecycle.authorise` and a mandatory justification textarea. The caller must be the assigned authoriser for that pending request, or hold `lifecycle.configure` (break-glass — applies the decision via `transition_record_status` and withdraws stray queue rows).

## Configuration workflows

### Lifecycle Configuration

**Path:** System Admin → Record Governance → Lifecycle Configuration

Per governed table:

- **Approval enabled** — when off, all changes go live immediately
- **Level approval mode** — `any` (one approver per level) or `all` (every authoriser at the level)
- **History retention days** — how long history rows stay before auto-archive (if enabled)
- **Auto-archive** — daily pg_cron sweep moves eligible history rows to archived

### Authorisers

**Path:** System Admin → Record Governance → Authorisers

Assign `admin.admin_users` as authorisers per table and approval level. Authorisers appear in **My Approvals** when a submission is pending their decision.

### Archive Retention Rules

**Path:** System Admin → Record Governance → Archive Retention Rules

Optional per-table overrides for regulatory retention (history days, archive years, effective dates).

### My Approvals

**Path:** System Admin → Record Governance → My Approvals

Queue of pending authorisation requests assigned to the signed-in admin. Each row shows original vs proposed field values, **View changes** (full pending diff), and Approve/Reject actions. Both decision paths open a review modal requiring **Approval justification** or **Rejection reason** before confirm. Rejection discards deferred changes and restores the record to its prior status.

Deciding from the **record edit page** (Approve/Reject in the lifecycle panel) uses `admin.decide_pending_record` and closes the matching queue row — no ghost entries remain in My Approvals.

## Record operations by state

| State | Available operations |
|---|---|
| Unauthorised | Approve, Reject (`lifecycle.authorise` + justification), Discard record (`lifecycle.configure`) |
| Live | Archive (after amend creates history version) |
| History | Restore, Archive |
| Archived | Restore |

Operations use confirm-with-reason dialogs (or inline justification for Approve/Reject on the record page). Each transition is logged in `admin.record_lifecycle_logs` and mirrored to the standard admin audit log.

## Pilot page integration

Lifecycle UI appears on edit/detail views:

- **Subscriptions Catalog** — plan edit form
- **Payment Gateways** — gateway edit form
- **Affiliates** — affiliate edit form
- **Cancellation Reasons** — category edit modal (Reason Categories tab)

Each shows a status badge, pending-changes diff (when unauthorised), Approve/Reject toolbar with mandatory justification, field lock banner + disabled form fields, and version history panel.

## Governed update RPCs

All four pilot update paths defer changes when authorisers are active:

| Table | RPC |
|---|---|
| `subscription_plans` | `admin.update_subscription_plan` |
| `affiliates` | `admin.update_affiliate` |
| `payment_gateways` | `admin.update_payment_gateway` |
| `cancellation_reason_categories` | `admin.admin_upsert_cancellation_category` (edit branch only) |

Creates (`admin_upsert_cancellation_category` with `p_id IS NULL`, `create_subscription_plan`) bypass governance.

## SQL migrations

Apply lifecycle base (if not already applied):

```bash
pnpm run admin:migrate-record-lifecycle
pnpm run admin:seed-record-lifecycle
```

Apply defer-apply (v123–v129):

```bash
pnpm run admin:migrate-record-lifecycle-defer-apply
```

Apply unified decision path (v133–v134):

```bash
pnpm run admin:migrate-authoriser-decision-fix
pnpm run admin:migrate-decide-pending-record
```

Individual scripts: `admin:migrate-record-lifecycle-pending-changes`, `admin:migrate-record-lifecycle-defer-apply-functions`, `admin:migrate-subscription-plan-defer-apply`, `admin:migrate-decide-pending-record`, etc.

Optional (dev/QA — enables authorisation on cancellation categories only):

```bash
pnpm run admin:seed-record-lifecycle-demo-authorisers
```

### One-time migration note

Records already in **Unauthorised** under the pre-v18 behaviour may have new values baked into the row with no `record_pending_changes` row. Resolve those manually (Validate or Delete from the record page) before or immediately after deploying v123+. Post-migration, Validate with no pending row is a harmless status flip; Reject defaults to restoring **Live**.

## Manual test checklist

1. Open **Lifecycle Configuration** — confirm four pilot tables listed with approval enabled.
2. With zero authorisers, edit a subscription plan — change should apply immediately; status stays **Live**.
3. Add yourself as authoriser for `subscription_plans`, edit a live plan (name + price) — row columns stay at approved values; status **Unauthorised**; public preview unchanged.
4. Open plan edit page — **Pending changes** diff shows current vs proposed; form fields disabled; Approve/Reject require justification.
5. Approve from record page — new values apply; public preview updates; My Approvals queue row cleared.
6. Repeat submit, reject via **My Approvals** (with justification) — record returns to **Live** with original values (not **History**).
7. Add authoriser for `cancellation_reason_categories`, edit a category — defer-apply + unauthorised status + modal field lock.
8. Archive a live gateway from its edit page — status becomes **Archived**; history panel shows transition.
9. Confirm transitions appear in **Audit Trail** with `*.lifecycle.*` action keys.
10. My Approvals **View changes** expands full diff; empty justification blocks Approve/Reject in review modal.

## Email notifications

Lifecycle decisions can trigger `lifecycle_submitted`, `lifecycle_approved`, and `lifecycle_rejected` email events (email-centre templates). Configure recipients in Email Centre if notifications are required.
