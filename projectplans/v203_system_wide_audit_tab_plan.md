# v203 — System-Wide Audit Tab on Every Record Page — Implementation Plan

**Status:** 📝 Planned — not yet built. Requires explicit go-ahead before the ~65-page retrofit starts.
**Companion plan:** `E:\project-nidus\projectplan\v871_system_wide_audit_tab_plan.md` (Platform + Simulator) — same decisions, same PRD reasoning; that file's PRD section (`E:\project-nidus\projectprd\v871_system_wide_audit_tab_PRD.md`) is the source of truth for the shared decisions below, reproduced here since this repo doesn't use a separate `projectprd/` folder.

---

## Problem statement

`AuditField`/`AuditCard`/`AuditDetailsPanel`/`DetailAuditTabList` already exist in `@nidus-admin/ui` and are already used on the two Global Template Library pages (`GlobalTemplateLibraryForm.jsx`, `GlobalTemplateLibraryDetail.jsx` — per admin CLAUDE.md rule 16). Everywhere else in Admin — ~65 other record-CRUD pages across 16 modules — there is no Audit tab. Nine of those pages have their own ad-hoc "CUSTOM" history/audit widget (`AuditTrailWidget`, `RecordLifecyclePanel`+`RecordVersionHistory`, or a bespoke "Activity" tab) rather than the standardized component set, so the same information is shown inconsistently depending on which page you're on.

## Solution / decisions (shared with the monorepo plan)

Same nine decisions as `v871`'s PRD, applied to Admin:
1. **Metadata only** — Identity/Classification/Record history cards, not a field-level change log.
2. **One big-bang implementation**, not phased.
3. **Only true record-CRUD pages** in scope (confirmed via the census below — list/dashboard/matrix/log-viewer pages excluded).
4. **Every database-backed create/edit page**, including simple reference/lookup/config pages (countries, currencies, feature flags, etc.).
5. **Standardise on the shared `DetailAuditTabList`** — including generalising it to accept an arbitrary `tabs` array (done, see below) for pages like `SubscriptionDetailPage.jsx` and `UserDetailPage.jsx` that already have more than 2 tabs.
6. **Tab always visible**, placeholder until the record is saved (for create pages; most Admin pages here are edit/detail-only, so this mainly affects the handful of `*FormPage.jsx` create paths).
7. **Fixed 3-card structure everywhere**, fields adapted per record type.
8. **Documented rule only** (this repo's CLAUDE.md rule 16 already established the mandatory-for-new pattern; this plan extends its scope) — no new coverage-checking tooling.
9. **Representative sample testing**, not exhaustive.

## Shared component groundwork — ✅ already done

- [x] `packages/ui/src/DetailAuditTabList.jsx` — generalised to accept an optional `tabs: {value,label}[]` array, fully backward compatible with the existing `detailsLabel`/`auditLabel` 2-tab shape used by `GlobalTemplateLibraryForm`/`Detail`. Verified via esbuild syntax check.

## Pattern to replicate (identical to the monorepo's — see `AuditField`/`AuditCard`/`AuditDetailsPanel` usage on `GlobalTemplateLibraryDetail.jsx` for the reference implementation already live in this repo)

```jsx
<DetailAuditTabList activeTab={tab} onChange={setTab} tabs={[{value:'details',label:'Details'}, {value:'audit',label:'Audit details'}]} />
{tab === 'audit' && (
  !record?.id ? (
    <p className="text-sm text-gray-500 dark:text-gray-400">Audit details appear after this record is saved.</p>
  ) : (
    <AuditDetailsPanel description="Who created or changed this record, and how it is classified.">
      <AuditCard title="Identity">...</AuditCard>
      <AuditCard title="Classification">...</AuditCard>
      <AuditCard title="Record history">
        <AuditField label="Created by" value={...} />
        <AuditTimestampPair dateLabel="Created at" value={record.created_at} />
        {/* + updated_by/at, and for lifecycle-governed tables, authorised_by/at (rule 16.1) */}
      </AuditCard>
    </AuditDetailsPanel>
  )
)}
```

---

## Census — ~65 in-scope pages across 16 modules

**Already standardised (skip; reference implementation):**
- [x] `modules/content/src/pages/GlobalTemplateLibraryForm.jsx`
- [x] `modules/content/src/pages/GlobalTemplateLibraryDetail.jsx`

**Has a CUSTOM ad-hoc audit/history widget — migrate to the standard pattern (higher priority than net-new, since these already prove the record needs audit info, just in an inconsistent shape):**
- [x] `modules/admin-mgmt/src/pages/AdminUserEditPage.jsx` — replaced the always-visible two-column `AuditTrailWidget` side panel with a `DetailAuditTabList` Details/Audit tab switch. Audit tab shows the standard 3-card `AuditDetailsPanel` (Identity/Classification/Record history) followed by the pre-existing `AuditTrailWidget` (kept, per the "keep existing activity timeline under Audit" convention). `admin.admin_users` audit columns not independently verified in SQL (no `CREATE TABLE` found in versioned SQL — pre-dates the versioning scheme); used the fields already present on the fetched `adminUser` row (`created_by`/`created_at`/`updated_by`/`updated_at`) — `AuditField` renders "—" gracefully if a field is absent. Verified via esbuild (confirmed the monorepo's `_esbuild_check.mjs` + local esbuild install works cross-repo by absolute path — used for all Admin repo checks below).
- [x] `modules/affiliates/src/pages/AffiliateFormPage.jsx` — `admin.affiliates` (v56) full audit columns. Followed the `GlobalTemplateLibraryDetail.jsx` reference pattern exactly: `RecordLifecyclePanel`/`RecordVersionHistory` are active governance controls, not passive audit history, so they **stayed** on the Details tab (not moved); added a genuinely new Audit tab alongside with the standard 3-card panel. Tab always visible including during create, with a placeholder (this page previously hid the lifecycle UI entirely on create — the new Audit tab now shows a placeholder there instead of disappearing). Added a `record` state to hold the full raw row (form only tracked flattened fields).
- [x] `modules/subscriptions/src/pages/PlanCatalogFormPage.jsx` — `public.subscription_plans` (lifecycle-governed). Same pattern as `AffiliateFormPage.jsx`: kept the collapsible `<details>` governance/history block on the Details tab, added a new Audit tab with the standard 3-card panel. Added a `record` state (form only tracked flattened fields).
- [x] `modules/subscriptions/src/pages/PaymentGatewayFormPage.jsx` — `admin.payment_gateways` (v46) full audit columns. Same pattern: kept `RecordLifecyclePanel`/`RecordVersionHistory` on the Details tab, added a new Audit tab with the standard 3-card panel. Added `record`/`detailTab` state (form only tracked flattened fields, and there was no existing tab mechanism at all — form + lifecycle panel were both always-visible).
- [x] `modules/subscriptions/src/pages/CancellationReasonsPage.jsx` — `admin.cancellation_reason_categories` (v63, category-B lifecycle v97) has **no `created_by`/`updated_by`** — only `created_at`/`updated_at`. Modal-based create/edit (list page + `AdminModal` editor); added a `DetailAuditTabList` Details/Audit switch inside the modal (`FieldGroupsPage.jsx`-style — the surrounding submissions/categories list tabs are unrelated and untouched). Kept `RecordLifecyclePanel`/`RecordVersionHistory` on the Details tab. Reduced Record history card (created_at/updated_at only, no user attribution). Added `categoryRecord`/`categoryTab` state.
- [x] `modules/subscriptions/src/pages/SubscriptionDetailPage.jsx` — flagship many-tabs case. `public.pm_subscriptions`/`sim.pm_subscriptions` equivalent (v82) full audit columns. Replaced the hand-rolled `TABS` string array + button-map with `DetailAuditTabList`'s generalised `tabs` prop (`CONTENT_TABS`: Overview/Billing/Payments/`{value:'audit',label:'Audit details'}`). Audit tab now shows the standard 3-card `AuditDetailsPanel` (Identity/Classification/Record history using raw `created_by`/`updated_by`) followed by the pre-existing `AuditTrailWidget` underneath (kept, per the "keep passive activity timeline under Audit" convention — this widget has no governance function, unlike `RecordLifecyclePanel`).
- [x] `modules/users/src/pages/UserDetailPage.jsx` — `public.users` (unversioned/legacy table, predates SQL versioning; `fetchUserById` uses `select('*')` so `created_by`/`updated_by` render if present, else "—" via `AuditField`'s own fallback). Replaced the hand-rolled `TABS` string array with `DetailAuditTabList`'s generalised `tabs` prop (Profile/Subscriptions/Projects/`{value:'audit',label:'Audit details'}`). Audit tab shows the standard 3-card panel followed by the pre-existing `fetchAuditLogForTarget`-based Activity table underneath (kept, passive log — same convention as `SubscriptionDetailPage.jsx`).

**All 7 "custom ad-hoc audit/history widget" migrations complete.**

**Net-new (`NONE` today) — by module:**

*content:* — **COMPLETE**
- [x] `EmailTemplateEditorPage.jsx` — `admin.email_templates` (v22) full audit columns. No existing tab system (form + live-preview grid) — added a top-level `DetailAuditTabList` switch around the whole grid (`DocumentationAdminEditor.jsx`-style), create-only placeholder.
- [x] `LanguageListPage.jsx` — `admin.supported_languages` (v26) full audit columns. List page with separate Create/Edit modals; added the Audit tab only inside the Edit modal (Create modal stays a short creation-only form, matching the `FieldGroupsPage.jsx` precedent).
- [x] `LegacyGlobalTemplateUpload.jsx` — feeds `global_template_library` (already covered by the reference `GlobalTemplateLibraryDetail.jsx`/`Form.jsx`). Pure single-shot upload form that immediately navigates away on success; added the standard create-only placeholder tab pointing to the record's own Audit tab after redirect, for retrofit consistency.

*admin-mgmt:* — **COMPLETE**
- [x] `AdminUserInvitePage.jsx` — create-only invitation flow (navigates to `admin-user-list` on success, no invitation detail page of its own). Top-level `DetailAuditTabList` switch, create-only placeholder.
- [x] `ArchiveRetentionRulesPage.jsx` — `admin.record_archive_config` (v95) has `configured_by`/`created_at`/`updated_at` (no separate `updated_by`). Single always-visible upsert-by-table editor; added `editingRow` state (set when a table row is clicked) and an Audit tab inside the editor section, placeholder when no row is selected.
- [x] `AuthorisersPage.jsx` — `admin.record_authorisers` (v95) has `created_by`/`created_at`/`updated_at` only, no click-to-edit affordance in the UI (append-only add form). Create-only placeholder tab added around the add form.
- [x] `LifecycleConfigurationPage.jsx` — `admin.record_lifecycle_config` (v95), same shape as `ArchiveRetentionRulesPage.jsx` (`configured_by`/`created_at`/`updated_at`). Same `editingRow`-tracking pattern applied to its "Edit configuration" panel.

*affiliates:* — **COMPLETE**
- [x] `AffiliateDetailPage.jsx` — `admin.affiliates` (v56). No existing tabs (stacked sections) — added a top-level `DetailAuditTabList` switch wrapping Profile/Stats/Conversions/Payouts vs. a new Audit tab.
- [x] `AffiliateApplicationsPage.jsx` — same table, embedded edit modal. Added the Audit tab inside the edit modal (`AffiliateApplicationsPage`-style list + modal, same as `AffiliateFormPage.jsx`'s raw-value convention).

*audit:* — **COMPLETE**
- [x] `ReportBuilderPage.jsx` — `admin.report_definitions` (v24) full audit columns. Create/Edit modal pair (`size="full"`); Audit tab added inside the Edit modal only.
- [x] `ScheduledReportsPage.jsx` — `admin.scheduled_reports` (v24) full audit columns. Same Create/Edit modal pattern; Audit tab added inside the Edit modal.

*batch-ops:* — **COMPLETE**
- [x] `BusinessCalendarPage.jsx` — `admin.business_calendar` (v29) has `created_by`/`created_at` only. Calendar-grid + per-date upsert modal; added `selectedEntry` state and an Audit tab inside the entry modal.
- [x] `CobProcessesPage.jsx` — `admin.cob_processes` (v29) has `created_by`/`created_at` only. List + Edit modal; Audit tab added inside the Edit modal.
- [x] `BatchJobDetailPage.jsx` — **excluded**. Read-only batch-job status/progress/items monitor (system-generated background job, not user create/edit) — same exclusion category as read-only activity/delivery/event logs.
- [x] `CobRunDetailPage.jsx` — **excluded**, same reason: read-only COB run status/step-timeline monitor, no user-editable fields.

*docs-centre:* — **COMPLETE**
- [x] `DocsEditorPage.jsx` — `admin.documentation_guides` (v84) has `created_at`/`updated_at` only. Combined create/edit editor (sidebar guide picker + form + markdown editor/preview) — added `record` state and a top-level `DetailAuditTabList` switch around the whole main-column content (`DocumentationAdminEditor.jsx`-style), create-only placeholder.

*email-centre:* — **COMPLETE**
- [x] `CampaignEditorPage.jsx` — `admin.email_campaigns` (v89) has `created_by`/`created_at`/`updated_at`, no `updated_by`. Combined create/edit, no existing tabs — top-level `DetailAuditTabList` switch, `record` state added.

*errors:* — **COMPLETE**
- [x] `ErrorDetailPage.jsx` — `admin.error_aggregations` (unversioned/pre-dates SQL versioning). System-generated aggregation with an editable status/severity/notes workflow — no creator concept. Top-level `DetailAuditTabList` switch; reduced Record history card (First seen / Last seen only, no created_by — documented as system-generated, not user-authored).
- [x] `ErrorAlertRulesPage.jsx` — `admin.error_alert_rules` (unversioned). List + Create/Edit modal; Audit tab added inside the modal (reduced, created_at/updated_at only — no created_by/updated_by referenced anywhere in the existing code). **Pre-existing bug noted, not fixed** (out of scope per rule 32): `inputClass` is used throughout this file's form but never imported from `@nidus-admin/ui` — a live `ReferenceError` whenever this modal renders.

*security:* — **COMPLETE**
- [x] `WebhookListPage.jsx` — `admin.webhooks` (v23) has `created_by`/`created_at` only. List + Create/Edit modals; Audit tab added inside the Edit modal.
- [x] `APIKeyListPage.jsx` — `admin.api_keys` (v23), same shape. Audit tab added inside the Edit modal (the separate "API Key Created" reveal-once modal is untouched — not a record editor).

*simulator (cross-schema exception):* — **COMPLETE**
- [x] `SimScenarioDetailPage.jsx` — `sim.scenarios` (v66, monorepo) has `created_at`/`updated_at` only. Combined view/edit, no existing tabs — top-level `DetailAuditTabList` switch.

*subscriptions (largest module):*
- [x] `SubscriptionFormPage.jsx` — `public.pm_subscriptions`/sim equivalent (v82) full audit. Existing hand-rolled `FORM_TABS` array (Details/Schedule) — appended a 3rd `'audit'` entry; added `record` state.
- [x] `PromoCodeFormPage.jsx` — `admin.promo_codes` (v46) full audit. No existing tabs — top-level `DetailAuditTabList` switch, `record` state.
- [x] `PaymentMethodFormPage.jsx` — `admin.payment_methods` (v46) full audit. Same top-level switch pattern.
- [x] `SettlementAccountFormPage.jsx` — `admin.settlement_accounts` (v46) full audit. Same pattern.
- [x] `PaymentRetryRulePage.jsx` — `admin.payment_retry_rules` (v46) full audit. List + Create/Edit modal; Audit tab inside Edit modal.
- [x] `PaymentMethodRoutingPage.jsx` — `admin.payment_method_routing` (v46) full audit. Single combined Create/Edit modal; added `editingRow` state, Audit tab inside modal.
- [x] `TaxRatesPage.jsx` — `admin.tax_rates` (v25) full audit. List + Create/Edit modals; Audit tab inside Edit modal.
- [x] `RefundDetailPage.jsx` — `admin.refunds` (v25) full audit. Full detail page, no existing tabs (kept the existing passive `RefundTimeline` on the Details tab, matching the "keep passive activity timeline" convention) — top-level `DetailAuditTabList` switch.
- [x] `PricingPlansPage.jsx` — **excluded**. List/dashboard page (table + narrow price-update action modal requiring a mandatory reason) over `subscription_plans`, already covered by `PlanCatalogFormPage.jsx`'s Audit tab.
- [x] `InvoiceListPage.jsx` — `admin.invoices` (v25) full audit. List + View/Edit/Refund modals; Audit tab added inside the View modal (the fullest single-record detail surface); Edit/Refund modals (narrow single-purpose editors) left as-is.
- [x] `RefundListPage.jsx` — same `admin.refunds` table as `RefundDetailPage.jsx`. List + View modal (with an "Open Full Detail" link to the already-audited `RefundDetailPage`); Audit tab added inside the View modal for consistency.

**subscriptions module: COMPLETE** (10 retrofitted, 1 correctly excluded).

*support:* — **COMPLETE**
- [x] `SupportTicketDetailPage.jsx` — `admin.support_tickets` (unversioned). No confirmed `created_by`; used `user_id` as "Submitted by" — top-level `DetailAuditTabList` switch (kept message thread/reply form on Details).
- [x] `AnnouncementsPage.jsx` — `admin.announcements` (v65) full audit columns. List + View/Edit modals; Audit tab added inside the View modal.

*system (largest "config data" module):*
- [x] `NotificationTemplateFormPage.jsx` — `admin.notification_templates` (v21) full audit. No tabs, had existing `isViewOnly` mode — top-level `DetailAuditTabList` switch.
- [x] `IDGenerationRuleFormPage.jsx` — `admin.id_generation_rules` (v19) full audit. Same pattern.
- [x] `FeatureFlagsPage.jsx` — `admin.feature_flags` (unversioned) — `created_by`/`updated_by` not confirmed present, used reduced created_at/updated_at pattern. List + Edit modal; Audit tab inside Edit modal. **Pre-existing bug noted, not fixed:** `inputClass` used but never imported.
- [x] `ExchangeRateListPage.jsx` — `admin.exchange_rates` (v18) has `created_by`/`created_at` only. Existing hand-rolled Current/History list tabs left untouched; Audit tab added inside the record-level Edit modal instead.
- [x] `CountryListPage.jsx` — `admin.countries` (v18) full audit. List + Create/Edit modals; Audit tab inside Edit modal.
- [x] `CurrencyListPage.jsx` — `admin.currencies` (v18) full audit. Same pattern.
- [x] `MaintenanceModePage.jsx` — `admin.maintenance_windows` (unversioned), create-only "Schedule Window" section with no view/edit affordance on existing rows (only status-transition action buttons) — create-only placeholder tab. **Pre-existing bug noted, not fixed:** `inputClass` used but never imported.
- [x] `TestFixPatternsPage.jsx` — create-only fix-pattern list (toggle-only rows, no edit affordance) — create-only placeholder tab around the Create modal.
- [x] `AlertRuleFormPage.jsx` — `admin.alert_rules` (v21) has `created_by`/`created_at` only. Same top-level switch pattern as `NotificationTemplateFormPage.jsx`.
- [x] `SystemSettingsPage.jsx` — **excluded**. Inline always-editable single-scalar-value rows per setting key (same exclusion as `InvitationExpirySettingsPage.jsx` in the monorepo census) — not an independently identifiable multi-field record.

**system module: COMPLETE** (9 retrofitted, 1 correctly excluded).

*system-testers:* — **COMPLETE**
- [x] `ActiveTestersPage.jsx` — `public.system_testers` (v82, monorepo, cross-schema read). No `created_by` — uses `granted_by` (admin_users FK) instead; full `created_at`/`updated_at`. Audit tab added inside the existing "Tester detail" modal.
- [x] `TesterApplicationsPage.jsx` — **excluded**. List-only, no view/detail modal; Approve/Reject modals are narrow decision-workflow forms (status transition + reason), not field editors.
- [x] `TesterSandboxesPage.jsx` — create-only (Create modal), no edit affordance on existing sandbox rows — create-only placeholder tab.
- [x] `TesterAssignmentsPage.jsx` — create-only (Create modal, only Revoke action on rows) — create-only placeholder tab.
- [x] `GrantTesterAccessPage.jsx` — create-only single-page grant flow, no detail/edit surface — create-only placeholder tab.

*testing-centre:* — **COMPLETE**
- [x] `SettingsPage.jsx` — **excluded**, same reason as `SystemSettingsPage.jsx`: inline per-key scalar settings rows, no multi-field record.

*users:* — **COMPLETE**
- [x] `OrgDetailPage.jsx` — `public.accounts` (v84, monorepo, cross-schema read) full audit. No existing tabs — top-level `DetailAuditTabList` switch.
- [x] `UserSuspendPage.jsx` — **excluded**. Single-purpose suspend-action workflow with mandatory reason, not a general field editor — same exclusion category as decision-workflow modals. The underlying `users` record's Audit tab already lives on `UserDetailPage.jsx`.

## Net-new pages: COMPLETE — all 16 modules retrofitted.

**Explicitly excluded (confirmed, with reason — see full census for the complete exclusion list per module):** pure list/dashboard pages, permission/nav/translation matrix editors spanning many rows at once, `AdminRowManageModal` row-action menus (status transition / assign / reject-with-reason, no field form), read-only delivery/activity/event logs, `ReportViewerPage` (renders a generated report-run, not a field editor), stub/placeholder pages (`GDPRCompliancePage`, `PerformanceMetricsPage`, `SSOManagementPage`, `SecurityMonitoringPage`, `SecuritySettingsPage`), the bespoke `Subscription{PricingRecord,AuditRecord,SectionHistory}Page.jsx` trio (these ARE the audit/diff viewers, not a target), shell auth/2FA/self-service pages, `modules/_template` scaffold. Three modules (`feedback`, `mirrors`, `platform`) contribute zero in-scope pages.

**Not table-verified during census, recommend a quick check before implementing:** none flagged for Admin (unlike the monorepo census, every Admin page listed above was individually opened and its Supabase target confirmed).

---

## Testing (decision 9)

- [x] `DetailAuditTabList` component test (`packages/ui/src/__tests__/DetailAuditTabList.test.jsx`) — 6 tests, all passing: legacy 2-tab shape when `tabs` omitted, custom `detailsLabel`/`auditLabel` overrides, arbitrary N-tab shape when `tabs` passed, `aria-selected` correctness, `onChange` firing with both legacy and custom tab values.
- [ ] `SubscriptionDetailPage.jsx` / `CountryListPage.jsx` / `AuthorisersPage.jsx` / `SupportTicketDetailPage.jsx` page-level retrofit tests — **not written**. Investigated: none of the `modules/*` feature packages (unlike `packages/ui`/`packages/shared`) have `@testing-library/react`, `@testing-library/jest-dom`, or `jsdom` as devDependencies, and no `vitest.config.js` (only a federation `vite.config.js` with no `test` block) — there is no working page-render test harness in this repo's `modules/*` yet. Standing up one would mean adding new devDependencies and a `vitest.config.js` to at least one module, which changes that module's dependency graph — flagged here rather than done silently. **Recommended follow-up**, not attempted this pass: copy `packages/ui/src/vitest.config.js`'s jsdom+setup pattern into `modules/subscriptions` (or `modules/system`) and write the `SubscriptionDetailPage.jsx` test first, since it is the flagship many-tabs case.

## Sidebar / navigation

No new nav entries needed — this feature adds a tab *within* existing pages, not new pages. `admin.nav_nodes` is unaffected.

## Review section

**Status: COMPLETE.** All ~65 census pages across all 16 modules retrofitted or explicitly excluded with a documented reason.

**Summary:**
- 7 "custom ad-hoc audit widget" migrations (`AdminUserEditPage`, `AffiliateFormPage`, `PlanCatalogFormPage`, `PaymentGatewayFormPage`, `CancellationReasonsPage`, `SubscriptionDetailPage`, `UserDetailPage`) — each replaced a bespoke `AuditTrailWidget`/`RecordLifecyclePanel`+`RecordVersionHistory`/hand-rolled Activity tab with the standard `DetailAuditTabList` + `AuditDetailsPanel`/`AuditCard`/`AuditField`/`AuditTimestampPair` set, per the reference implementation in `GlobalTemplateLibraryDetail.jsx`.
- ~50 net-new pages retrofitted across content, admin-mgmt, affiliates, audit, batch-ops, docs-centre, email-centre, errors, security, simulator, subscriptions, support, system, system-testers, testing-centre, and users.
- A consistent set of four template patterns was reused throughout, matching the monorepo's v871 templates: (a) top-level `DetailAuditTabList` switch for single-content-block pages with no existing tabs, (b) append an `'audit'` entry to an existing hand-rolled tab array, (c) Audit tab inside a Create/Edit modal for list+modal pages, (d) create-only placeholder for pages with no view/edit affordance on existing rows.
- **Established this repo's own audit-display convention** (distinct from the monorepo's `resolveAuditUserLabels` lookup pattern): raw `created_by`/`updated_by` UUID values shown directly via `AuditField`, no user-label resolution step — matching the pre-existing, already-approved `GlobalTemplateLibraryDetail.jsx` reference implementation.
- **Governance vs. passive-audit distinction applied consistently**: active governance controls (`RecordLifecyclePanel`, approval justification flows) stay on the Details tab; passive history/logs (`RecordVersionHistory`, `AuditTrailWidget`, activity timelines) move onto the new Audit tab, alongside the standard 3-card panel.
- **Explicitly excluded, with reasons** (not silently skipped): pure list/dashboard pages with only a narrow action modal (`PricingPlansPage.jsx`), inline always-editable single-scalar-value settings rows (`SystemSettingsPage.jsx`, `SettingsPage.jsx` in testing-centre — same shape as the already-excluded `InvitationExpirySettingsPage.jsx`), row-action-menu/decision-workflow modals with no general field form (`TesterApplicationsPage.jsx`, `UserSuspendPage.jsx`), and read-only system-generated job/run monitors (`BatchJobDetailPage.jsx`, `CobRunDetailPage.jsx`).
- **Cross-repo consistency**: applied the monorepo's established schema-variance handling (full audit / `created_by`+`created_at` only / `created_at`+`updated_at` only, per what each table's SQL actually defines) and confirmed several tables via direct SQL DDL inspection rather than assuming a uniform shape.
- **Pre-existing bugs discovered and documented, not fixed** (per CLAUDE.md rule 32 — out of scope for this retrofit): a missing `inputClass` import causing a live `ReferenceError` whenever the modal renders, in both `modules/errors/src/pages/ErrorAlertRulesPage.jsx` and `modules/system/src/pages/FeatureFlagsPage.jsx`/`MaintenanceModePage.jsx`.
- **Testing**: `DetailAuditTabList` component test written and passing (6 tests). Page-level retrofit tests for `SubscriptionDetailPage.jsx`/`CountryListPage.jsx`/etc. were not written — this repo's `modules/*` packages have no working page-render test harness (missing `@testing-library/react`/`jsdom`/`vitest.config.js`), and standing one up was judged out of scope for a silent, unrequested dependency change. See the Testing section above for the recommended follow-up.

**Everything from the original decisions 1–9 held**: metadata-only (no field-level change log), one big-bang pass (not phased), only true record-CRUD pages in scope, every database-backed create/edit page including simple reference data, `DetailAuditTabList` standardised (including its `tabs` generalisation), tab always visible with a create-only placeholder, fixed 3-card structure everywhere, documented-rule-only (no new coverage tooling), representative sample testing.
