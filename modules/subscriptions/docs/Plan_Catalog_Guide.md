# Plan Catalog Guide

Manage the full lifecycle of subscription plan tiers shown on the **Platform** and **Simulator** public pricing pages. Both apps read live from `public.subscription_plans` — changes here appear after a page reload on `/platform/pricing` and `/simulator/pricing`.

## Access

- **Path:** Subscriptions → Subscriptions Catalog → Subscription Catalog (`/subscriptions/plan-catalog`)
- **Permissions:** `pricing.view` to browse; `pricing.edit` to create, edit, activate/deactivate, or delete
- **Roles:** Super Admin, System Admin

## List page

The catalog table shows every plan (including inactive rows). Use search to filter by name, type, billing cycle, or system.

| Action | Description |
|--------|-------------|
| **New Plan** | Opens the create form |
| **Edit** | Opens the form with current values |
| **Activate / Deactivate** | Toggles `is_active` (same RPC as Pricing Plans). Requires an audit reason. |
| **Delete** | Hard-deletes the row. Only allowed when no active/trialing/past_due subscribers match the plan. |

## Create a plan

1. Click **New Plan**.
2. Set **Plan Name**, **Plan Type**, **Billing Cycle**, and **System (catalog scope)**.
3. Enter **Price**, optional **Original Price**, **Currency**, limits, and **Feature** bullets.
4. Configure **Platform included**, **Simulator included**, **Popular**, and **Active** flags.
5. Set **Display order** (lower numbers appear first on pricing pages).
6. Provide a mandatory **audit reason** and save.

### Uniqueness

Each combination of `(plan_type, billing_cycle, catalog_scope)` must be unique. Creating a duplicate raises a friendly error — pick a different type, cycle, or system.

## Edit a plan

Most fields are editable. These **identity fields are locked** after creation:

- Plan type  
- Billing cycle  
- Catalog scope (system)

Price changes are recorded in **Pricing Change History** (same as the Pricing Plans page).

## Delete rules

Deletion is blocked when any **active**, **trialing**, or **past_due** subscription matches the plan’s normalized type and billing cycle on the relevant system (`platform_subscriptions` or `simulator_subscriptions`).

If subscribers exist, **Deactivate** the plan instead of deleting it.

## Maker/checker approval (Edit only)

`subscription_plans` is a Record Lifecycle pilot table with an active authoriser (SQL `v118`, role label **Pricing Authoriser**). Saving an **Edit** to an existing plan is the "maker" step: if the change is material (price, original price, currency, limits, `additional_member_price`, features, `is_active`), `admin.update_subscription_plan` submits it for approval instead of applying it immediately. The row shows `unauthorised` until the Pricing Authoriser approves or rejects it in **Record Lifecycle** (`admin.process_authoriser_decision`); a rejection reverts the row.

**New Plan** creation is not gated — `admin.create_subscription_plan` writes the row live immediately regardless of the authoriser. Only edits to a plan that already exists go through the approval queue.

## Related pages

- **Pricing Plans** (`/subscriptions/pricing-plans`) — price change history and quick price edits (unchanged by this feature).
- **Subscription Preview** — preview what a user would see before checkout.

## Manual test checklist

1. Create a throwaway test plan → confirm it appears in the list.
2. Edit the price → confirm identity fields are disabled.
3. Attempt delete on a plan **with** subscribers → expect blocked with a clear message.
4. Delete the throwaway plan (no subscribers) → expect success.
5. Reload public pricing pages and confirm the catalog reflects changes.
6. Check **Audit Trail** for `subscription_plan.create`, `.update`, and `.delete` entries.
