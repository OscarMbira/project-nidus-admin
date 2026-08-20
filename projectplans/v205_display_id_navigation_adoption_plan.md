# v205 — Display-ID Navigation Adoption — Plan (Admin)

**Repo:** `E:\project-nidus-admin`
**Companion PRD/plan:** `E:\project-nidus\projectprd\v872_pm_controls_friendly_project_urls_PRD.md` /
`E:\project-nidus\projectplan\v872_pm_controls_friendly_project_urls_plan.md`
**Status:** Planned.

---

## Goal

Extend the existing `navId()` / `useDisplayIdMap` display-ID pattern (rule 13) to pages that still build detail
links with the raw UUID — for tables that already have an active `admin.id_generation_rules` row. Confirmed by a
live query of `admin.id_generation_rules` on 2026-08-14 (1000 rows), not guessed from static SQL search.

**Explicitly not in this pass:** tables without an active rule yet (see Deferred below) — those need a schema
change (new `display_id` column + trigger) plus a new rule seed, which is its own, separate piece of work on
billing-adjacent tables.

---

## Todos

### Affiliates (table has a rule)
- [x] `modules/affiliates/src/pages/AffiliateListPage.jsx` — `row.id` → `navId(displayIdMap, row.id)` (3 call sites)
- [x] `modules/affiliates/src/pages/AffiliateFormPage.jsx` — incoming `?id=` resolved via `useDisplayId`;
      post-save redirect resolves the new/edited record's display id via `getDisplayIdForRecord`
- [x] `modules/affiliates/src/pages/AffiliateDetailPage.jsx` — incoming `?id=` resolved via `useDisplayId`;
      Edit link uses `navId` against a single-record `useDisplayIdMap`
- [x] `modules/affiliates/src/pages/AffiliateDashboardPage.jsx` — `affiliate.id` → `navId(...)`
- [x] `modules/affiliates/src/pages/AffiliateCommissionsPage.jsx` — `row.affiliate_id` → `navId(...)` against a
      `useDisplayIdMap('admin.affiliates', affiliateIds)` built from the referenced (not own-row) ids

### Batch-ops (batch_jobs, cob_runs have rules)
- [x] `modules/batch-ops/src/pages/BatchJobListPage.jsx` — `row.id` → `navId(...)`
- [x] `modules/batch-ops/src/pages/BatchJobDetailPage.jsx` — incoming `?id=` resolved via `useDisplayId`; retry-job
      redirect resolves the new job's display id via `getDisplayIdForRecord`
- [x] `modules/batch-ops/src/pages/BatchImportPage.jsx` — `results.jobId` resolved via `useDisplayId` for the
      "view job" link
- [x] `modules/batch-ops/src/pages/CobDashboardPage.jsx` — `runId` / `row.id` → `navId(...)`; run-COB redirect
      resolves display id via `getDisplayIdForRecord`
- [ ] `modules/batch-ops/src/pages/cobStepRecords.js` — **not done.** Plain helper (no hooks) that mixes record
      types per COB step (`subscription` has no rule, `support_ticket`/`error_aggregation` do) — needs the calling
      component to build per-table `useDisplayIdMap`s and thread them through `buildDetailPath`. Left as a
      follow-up given the mixed-table complexity and lower traffic of this drill-down surface.

### Email Centre (email_campaigns has a rule)
- [x] `modules/email-centre/src/pages/CampaignListPage.jsx` — `row.id` → `navId(...)`
- [x] `modules/email-centre/src/pages/CampaignEditorPage.jsx` — incoming `?id=` resolved via `useDisplayId`;
      post-create redirect resolves display id via `getDisplayIdForRecord`

### System (alert_rules has a rule)
- [x] `modules/system/src/pages/AlertRulesPage.jsx` — `rule.id` → `navId(...)` (2 call sites)
- [x] `modules/system/src/pages/AlertRuleFormPage.jsx` — incoming `?id=` resolved via `useDisplayId`; the
      view→edit self-link reuses the original `idParam` (not the resolved UUID) so it doesn't reintroduce a raw id

### Cross-module links (target tables have rules)
- [x] `modules/errors/src/pages/ErrorDetailPage.jsx` — link to Support Ticket uses `errorAgg.auto_ticket_id` →
      `navId` against `useDisplayIdMap('admin.support_tickets', [auto_ticket_id])`. Also fixed this page's **own**
      incoming `?id=` (previously always raw UUID, including the auto-select-first-error fallback) via
      `useDisplayId('admin.error_aggregations', idParam)` — this was in scope under the original rule 13 mandate,
      found while fixing the cross-module link.
- [x] `modules/support/src/pages/SupportTicketDetailPage.jsx` — link to Error Detail uses
      `errorContext.aggregation.id` → `navId` against `useDisplayIdMap('admin.error_aggregations', [...])`. Its
      own incoming `?id=` already used `useDisplayId` before this pass.
- [x] `modules/subscriptions/src/pages/InvoiceListPage.jsx` — refund-detail links (`invoiceRefunds[0].id`,
      `refund.id`) → `navId` against `useDisplayIdMap('admin.refunds', refundIds)`

### Refunds (found during the Invoices cross-link fix — table has a rule, wasn't in the original scan)
- [x] `modules/subscriptions/src/pages/RefundListPage.jsx` — `refund.id` (2 call sites) → `navId(...)`
- [x] `modules/subscriptions/src/pages/RefundDetailPage.jsx` — incoming `?id=` resolved via `useDisplayId`
      (needed once RefundListPage/InvoiceListPage started sending display ids to this page)

### Approvals queue (mixed-table link builder — table has a rule)
- [x] `modules/admin-mgmt/src/pages/MyApprovalsPage.jsx` — `recordHref()`'s `affiliates` branch → `navId` against
      a `useDisplayIdMap('admin.affiliates', ...)` built from the pending-approval rows' `record_id`s.
      `subscription_plans`/`payment_gateways` branches left on raw UUID (no rule yet, see Deferred).

### Verify (already appear correct — confirm, don't change unless a real gap)
- [x] `modules/admin-mgmt/src/pages/AdminUserListPage.jsx` / `AdminUserEditPage.jsx` — confirmed, already use `navId()`

### Deferred — flagged, not built this pass (no active `id_generation_rules` row today)
- [ ] `admin.subscription_plans` / plan catalog — `PlanCatalogListPage.jsx`, `PlanCatalogFormPage.jsx`,
      `SubscriptionSectionHistoryPage.jsx`, `SubscriptionPricingRecordPage.jsx`
- [ ] `payment_gateways` — `PaymentGatewayListPage.jsx`, `PaymentFlowPage.jsx`
- [ ] `email_templates` — `EmailTemplateListPage.jsx`
- [ ] `notification_templates` — `NotificationTemplatesPage.jsx`, `NotificationTemplateFormPage.jsx`
- [ ] `subscriptions` (`platform_subscriptions` / `team_subscriptions`) — `SubscriptionListPage.jsx`,
      `SubscriptionFormPage.jsx`, `SubscriptionDetailPage.jsx`, `PaymentDashboardPage.jsx`,
      `PaymentMonitorPage.jsx`, `CancellationReasonsPage.jsx`, `MyApprovalsPage.jsx` (subscription/plan/gateway
      branches only — its `affiliates` branch is in scope above)

  Follow-up needed before these can be touched: confirm/add a `display_id`-style column per table, add an
  `admin.id_generation_rules` seed (rule 14 — versioned SQL under `E:\project-nidus-admin\SQL\`), wire the
  insert/update trigger. Track as its own plan when scheduled — not assumed as part of v205.

### CLAUDE.md
- [x] Admin `CLAUDE.md` rule 13 — one-line reinforcement: adoption covers cross-module links (linking to another
      table's detail page), not just a page's own row links; also notes the rule-existence check before adding
      `navId()` to a new page.

---

## Review

### Shipped
- 19 files updated across Affiliates, Batch-ops, Email Centre, System, Errors, Support, Subscriptions
  (Invoices + Refunds), and Admin-Mgmt (Approvals queue) — all now build detail links with `navId()` /
  `useDisplayIdMap()` / `useDisplayId()` for target tables with an active `admin.id_generation_rules` row, instead
  of the raw UUID primary key.
- Every detail page that now *receives* a display id also resolves it back to a UUID on load via `useDisplayId`
  (backward-compatible with old UUID bookmarks) before calling its fetch-by-id service.
- Found and fixed two items beyond the original scan: `ErrorDetailPage.jsx`'s own incoming `?id=` (not just its
  outgoing cross-module link) and `RefundListPage.jsx`/`RefundDetailPage.jsx` (missed in the initial grep because
  the search targeted cross-module link patterns, not this same-table list/detail pair).

### Verification
- No dedicated Admin vitest/eslint config found at the repo root; verified each edited file parses correctly via
  an esbuild JSX syntax check (all 19 pass) and manually confirmed no unused `navId`/`useDisplayId*` imports.
  No live dev server run this session — manual click-through in the browser is still recommended before deploy.

### Not done (flagged, per PRD)
- `cobStepRecords.js` — mixed record-type helper, left as-is (see todo above).
- All tables in "Deferred" (subscription_plans/plan_catalog, payment_gateways, email_templates,
  notification_templates, subscriptions) — need a new `display_id` column + `admin.id_generation_rules` seed
  before their URLs can carry a display id. Not started.
