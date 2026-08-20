# v187 — Portfolio Templates & Programme Templates (Global Template Library)

**Repo:** `E:\project-nidus-admin` (Admin app, `content` module)
**Companion plan (cross-repo, prerequisite for these templates to actually apply to real records):** `E:\project-nidus\projectplan\v783_pm_hierarchy_creation_time_inheritance_plan.md`
**Status:** ✅ Complete (audited 2026-07-21)

## Gap confirmed

Global Template Library previously authored domains without `portfolio_template` / `programme_template`. Sidebar only had Library / Forms / Process Docs (plus Default Content).

## What a Portfolio/Programme template should actually contain

(See original tables — Overview / Objectives / Governance / Benefit categories / Risks / Metrics / Roles for Portfolio; Overview / Governance / Milestones / Dependencies / Benefits / Risks / Roles for Programme.)

## Build approach — reuse the Industry Plan editor, don't fork it

- [x] Reuse `IndustryPlanFlatGrid` + `RiskDetail` / `RoleDetail` / `MilestoneDetail` for shared tabs; domain-specific tabs use card forms with the same vocabulary as Platform portfolio/programme tables (pragmatic generalisation — not a full Industry Plan rewrite).
- [x] `globalTemplateUtils.js`: `emptyPortfolioTemplatePayload` / `emptyProgrammeTemplatePayload` + normalize/build + summarise helpers.
- [x] Thin editors: `PortfolioProgrammeTemplateEditors.jsx` (`PortfolioTemplatePayloadEditor`, `ProgrammeTemplatePayloadEditor`).

## Sidebar updates (`packages/shared/src/defaultAdminNav.js`)

- [x] **Portfolio Templates** → `/content/global-template-library?domain=portfolio_template`
- [x] **Programme Templates** → `/content/global-template-library?domain=programme_template`
- Flat list (no process-group sub-items), as proposed.
- [x] **New template** from a filtered list preselects that domain (`?domain=…` on create form).

## Cross-repo prerequisite (small, shared with v783)

- [x] Admin: `chk_gtl_domain` + create/update/publish allowlists — `SQL/v184_portfolio_programme_templates.sql`
- [x] Monorepo: `pm_template_nodes` / `pm_template_entity_assignment` domain CHECKs (public + sim) — `SQL/v783_portfolio_programme_template_domains.sql`
- [x] Monorepo: `sync_global_template_node` domain whitelist + **explicit object/`template_code` branch** for portfolio/programme (payload-only, no catalog table)
- [x] Monorepo: `PM_TEMPLATE_DOMAINS` in `pmTemplateInheritanceService.js` (also aligned legacy_document / structured_list)

## Seed data (per rule 18.2)

- [x] `SQL/v184_portfolio_programme_templates.sql` includes curated seeds: Technology Transformation Portfolio (`PT-TECH-01`) + Regulatory Compliance Programme (`PG-REG-01`) — fixed UUIDs, upsert. *(Restored in audit: seeds had been dropped during an earlier RPC regenerate.)*
- [x] No new `database_tables` registry rows (JSONB on existing GTL table).

## Testing

- [x] Unit tests: `portfolioProgrammeTemplatePayload.test.js` (empty / normalize / build round-trip + curated seed shapes publish-ready).
- [x] Nav test for Portfolio / Programme groups.
- [x] Automated stand-in for manual publish readiness: seed-shaped payloads build with `ok: true` and non-empty tab rows. Operator still applies SQL + Publish in UI to confirm `pm_template_nodes` (tier remains `pmo` until v783).

## Review

**Completed 2026-07-21 · Audited 2026-07-21.**

### Delivered
| Area | Change |
|------|--------|
| Utils | Portfolio/programme empty, normalize, build, summarise in `globalTemplateUtils.js` |
| UI | Editors + form/list/detail/nav; create form domain prefill from query |
| Admin SQL | `v184_portfolio_programme_templates.sql` (domains + RPCs + **seeds restored**) |
| Monorepo SQL | `v783_…` CHECKs + sync whitelist + portfolio/programme payload branch |
| JS | `PM_TEMPLATE_DOMAINS` extended |
| Docs | `Documentation/Portfolio_Programme_Templates_Guide.md` |

### Audit fixes (this pass)
1. Restored missing seed INSERTs in Admin `v184`.
2. Sync RPC no longer falls through to fields-style `[]` default for portfolio/programme — validates object + `template_code`.
3. New-template link preserves active domain filter; create form initialises that domain.
4. Extra unit coverage for curated seed payload shapes.

### Explicit follow-on (v783 plan)
Sync still inserts nodes at **`tier='pmo'`**. Mapping published portfolio/programme templates onto portfolio/programme hierarchy tiers at creation time remains in the companion v783 plan.
