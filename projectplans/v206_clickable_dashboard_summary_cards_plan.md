# Plan v206: Clickable Dashboard Summary Cards — Admin

Companion PRD (main repo): `E:\project-nidus\projectprd\v893_clickable_dashboard_summary_cards_PRD.md`
Companion Platform/Simulator plan (main repo): `E:\project-nidus\projectplan\v893_clickable_dashboard_summary_cards_plan.md`

## Context

Full context and interview decisions are in the companion PRD (main repo) — this file only
covers the Admin-specific slice of that system-wide initiative. Per this repo's own CLAUDE.md,
Admin plans stay in this repo even though the feature spans all three apps.

Admin's starting position is better than Platform/Simulator's: there is already one shared,
consistently-used stat-card component (`AdminCard`, ~60 call sites) rather than dozens of
hand-rolled duplicates. This plan is mostly "extend one component, then wire call sites" —
no new component needed.

## Phase 0 — Infrastructure ✅ done

- [x] Extended `packages/ui/src/AdminCard.jsx` with `onClick` (renders `<button>`) and `to` (renders router `<Link>`, and still fires `onClick` too if both are given) props. Adds hover/focus styling only when either is present — plain `<div>` otherwise, zero visual regression for calculated cards.
- [x] `useAdminListPage.jsx` had no query-param filter support (only `readSearchFromUrl` for free-text search). Added `filterParamNames` option — returns `initialFilterFromUrl` (only the params actually present, same design as the monorepo's `useInitialFilterFromQuery`), for callers to merge into their own filter state on mount.

## Phase 1 — Main role-based dashboard ✅ done

- [x] `AdminDashboard.jsx` — audited all 16 cards (4 per role) against `admin.get_dashboard_stats()`'s actual SQL (`SQL/v08_dashboard_functions.sql`) to confirm true count/sum vs. calculated/windowed-sample. Wired 10 of 16 with a `to` target:
  - super_admin: Active Users → `/users/user-list`; Pending Activations → `/admin-mgmt/pending-activations` (dedicated pre-filtered page); Critical Errors → `/errors/error-dashboard?severity=critical`. MRR Estimate left static (blended sum).
  - system_admin: Active Users; Active Subscriptions → `?status=active`; Open Tickets → `?filter=open`; Feature Flags → `/system/feature-flags` (dedicated page, no filter needed — it's a true total).
  - support_admin: Open Tickets; Assigned Tickets → `?filter=assigned_open` (new composite quick-filter, see below); Impersonations (30d) → `/support/user-impersonation` (no filter — the target page's session-log view doesn't yet support a date-range param; linking unfiltered is still correct navigation, just not date-scoped). Recent Errors left static.
  - content_admin: Total Scenarios; Active Scenarios → `?status=active`. Recent Certificates / Leaderboard Top left static.
  - **Left static and explicitly NOT "silently skipped":** `recent_errors`, `recent_certificates`, `leaderboard_top` — all three are `LIMIT 10` windowed samples in the SQL function, not true filterable totals (clicking would show a differently-sized list than the card's number implies).
- [x] Added URL query-param read support to 3 target list pages that didn't have it yet (needed for the cross-page links above): `SubscriptionListPage.jsx` (`?status=`, validated against existing `STATUS_FILTERS`), `SimScenarioAdminPage.jsx` (`?status=`), `SupportTicketListPage.jsx` (`?filter=open|assigned_open` — a new composite quick-filter layered on top of the existing single-select dropdowns, since "open" here is a 3-way status OR-set (`open`/`in_progress`/`waiting_user`, matching the dashboard SQL's definition) that the existing single-select `statusFilter` can't express, and "assigned + open" combines two dimensions at once). `ErrorDashboardPage.jsx` already read `severity`/`status` from the URL — no change needed there.
- [x] **`SupportTicketListPage.jsx` has its own stat-card row too** (Total tickets / Filtered tickets / Open-In-Progress / Unassigned) — wired those while touching the file: "Total tickets" clears the new quick-filter, "Open Tickets" (renamed from "Open / In Progress" and corrected to the 3-way status set to match the dashboard's own definition — was previously a 2-way set, a pre-existing inconsistency) uses the new quick-filter, "Unassigned" now sets the existing `assigneeFilter` dropdown to `'unassigned'` directly.

## Phase 2 — Module sub-dashboards ✅ done

One sub-task per page, audit-then-wire:

- [x] `PaymentDashboardPage.jsx` — local `KpiCard` extended with `onClick`. "Total Transactions" → `/subscriptions/payment-transactions`; "Active Retries" → `/subscriptions/payment-monitor?status=retrying` (added URL-read support to `PaymentMonitorPage.jsx`, which already had a `'retrying'` filter chip but no query-param wiring). Total Revenue / Success Rate / Avg Transaction / Refund Rate left static (sums/ratios).
- [x] `RevenueDashboardPage.jsx` — Active/Trialing/Cancelled Subscriptions → `/subscriptions/subscription-list?status=...` (reusing the query-param support added in Phase 1). "Payments (Range)" and "Currency Breakdowns" scroll to their already-rendered tables on the same page (both tables show the exact matching row set already — no filter needed). "Paid Transactions" adds a new client-side `paymentStatusFilter` that narrows the same "Payment Transactions" table, since it wasn't otherwise filterable to paid-only. MRR Estimate / Paid Amount left static (sums).
- [x] `AffiliateDashboardPage.jsx` — "Active Affiliates" → `/affiliates/affiliate-list?status=active` (added URL-read support to `AffiliateListPage.jsx`); "Pending Applications" → `/affiliates/applications` (already a dedicated pending-only queue, no filter needed). Commissions Paid/Pending left static (sums).
- [x] `CobDashboardPage.jsx` — audited, no count/sum cards present ("Current Business Date" and "Last COB Status" are single-value state indicators, not counts). No changes.
- [x] `EmailDashboardPage.jsx` — "Sent (30d)"/"Failed"/"Bounced" → `/email-centre/send-log?status=...` (added URL-read support to `EmailSendLogPage.jsx`; note the send-log page has no date-range filter, so the "(30d)" window isn't reproduced exactly — same class of approximation used elsewhere in this rollout, documented rather than silently accepted). Delivery rate left static (%).
- [x] `ErrorDashboardPage.jsx` (the module's own dashboard, not the AdminDashboard target from Phase 1) — already read `severity`/`status` from the URL on mount; this page itself doesn't render separate summary stat cards beyond its own filterable table, so nothing further to wire.
- [x] `TestDashboardPage.jsx` / `TestingDashboardPage.jsx` — audited both (they share the same `fetchTestDashboardStats()` data source). "Total Suites"/"Total Cases"/"Test Cases"/"Suites" are real counts, but **no suite-list or case-list page exists anywhere in the Admin codebase** — only ID-scoped detail pages (`test-suite-detail`, `test-run-detail`, `test-result-detail`) and a CLI-command reference. Left non-clickable and flagged (same "would require building a new list page" exception as the monorepo's `QualityReportBuilder` "Open Defects" case) rather than linking to a page that doesn't exist. Pass Rate / Coverage / Auto-Fix Success / Last Diagnostic are percentages or a single status value — correctly static regardless.

## Phase 3 — Remaining `AdminCard` call sites — started, intentionally incremental

Per this phase's own design ("can be delivered incrementally rather than in one pass"), this
session covered the highest-value subset (Phase 1's main dashboard + Phase 2's 8 module
sub-dashboards, wiring 1 shared component + 6 target list pages with new query-param support
along the way). The remaining call sites among the ~60 total (subscriptions, security, users,
support, testing-centre, batch-ops, and others not yet audited) are left for opportunistic
adoption — same spirit as this repo's other incremental-rollout rules (e.g. rule 16.1's audit
tab backlog). No further sub-tasks tracked here; pick up remaining `AdminCard` usages when each
page is next touched, per CLAUDE.md rule 17 below.

## Phase 4 — CLAUDE.md rule (Admin) ✅ done

- [x] Appended as rule 17 in `E:\project-nidus-admin\CLAUDE.md`, directly after rule 16.1, before the "## Architecture" section header.

Proposed rule text (mirrors monorepo rule 64, adapted for Admin's single-component reality):

> 17. **Clickable dashboard summary cards (mandatory for NEW and AMENDED dashboard/summary
> cards, v893 / monorepo rule 64).** Any `AdminCard` whose number is a **COUNT or SUM of
> individually-identifiable records matching an expressible filter** must be clickable via
> `AdminCard`'s `onClick`/`to` props — clicking navigates to that filtered subset on the
> relevant Admin list page. Same-page cards (Dashboard and list view together) apply the
> filter to existing list state directly; cross-page cards pass the filter as a URL query
> parameter that the target list page reads on mount. **Do not make a card clickable** when
> its number is an average, percentage/ratio, or blends multiple distinct entity types —
> leave these static, no hover affordance. If a card's implied filter doesn't exist yet on the
> target list page, add the filter capability rather than linking unfiltered. **Adopt
> opportunistically** for any `AdminCard` usage not yet covered by the v206 rollout when next
> touched. See `projectplans/v206_clickable_dashboard_summary_cards_plan.md` and the monorepo's
> `projectprd/v893_clickable_dashboard_summary_cards_PRD.md`.

## Verification

Manual click-through per card (same method as the companion Platform/Simulator plan): confirm
correct target page, correct filter applied, row count matches the card's number, calculated
cards show no click affordance, cross-page URLs are independently shareable.

## Review

**Status: Phases 0, 1, 2, 4 complete. Phase 3 intentionally incremental (by design).**

**What shipped:** `AdminCard` (`packages/ui/src/AdminCard.jsx`) now supports `onClick` (button)
and `to` (router `Link`) props with hover/focus affordance; `useAdminListPage.jsx` gained a
`filterParamNames`/`initialFilterFromUrl` option mirroring the monorepo's
`useInitialFilterFromQuery`. The main `AdminDashboard.jsx` (16 cards across 4 roles) and all 8
module sub-dashboards were audited card-by-card against the count/sum-vs-calculated rule and
wired accordingly. 6 target list pages gained new URL query-param read support they didn't have
before: `SubscriptionListPage`, `SimScenarioAdminPage`, `SupportTicketListPage` (plus a new
composite quick-filter for a 3-way status OR-set that no single dropdown could express),
`PaymentMonitorPage`, `AffiliateListPage`, `EmailSendLogPage`. CLAUDE.md rule 17 codifies the
pattern.

**Pre-existing inconsistency found and fixed while wiring:** `SupportTicketListPage.jsx`'s own
"Open / In Progress" stat card used a 2-way status set, while `admin.get_dashboard_stats()`'s
SQL definition of "open tickets" (referenced by the AdminDashboard card linking to this same
page) uses a 3-way set (`open`/`in_progress`/`waiting_user`) — the two would have shown
different numbers for the "same" concept. Aligned the page's own card to the SQL's definition
and renamed it "Open Tickets" for clarity.

**Documented, not fixed:** `TestDashboardPage.jsx` / `TestingDashboardPage.jsx`'s "Total
Suites"/"Total Cases" cards have no corresponding list page anywhere in the Admin codebase
(only ID-scoped detail pages) — left static and flagged rather than either building a new
list page as a side effect or silently skipping them. `EmailDashboardPage.jsx`'s cards wired
by status but not by the "(30d)" date window, since the target send-log page has no date-range
filter — a known, documented approximation, same class as a few similar cases in the companion
monorepo plan.

**Not done in this pass:** in-browser click-through verification (no browser tool available
this session — please verify before relying on this in production); Phase 3's remaining ~50
`AdminCard` call sites (by design, per this phase's own "deliver incrementally" instruction).
