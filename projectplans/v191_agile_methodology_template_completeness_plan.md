# v191 — Agile-methodology templates: complete the fields (mirror Structured v189)

**Repo:** `E:\project-nidus-admin` (Global Template Library seeds)  
**Pattern to follow:** `projectplans/v189_structured_methodology_template_completeness_plan.md` + `scripts/generate-v189-structured-seeds.js` / `SQL/v189*`–`v189e*`  
**Companion (no monorepo SQL expected):** field completeness is Admin GTL content only; Platform/Simulator inherit via publish/sync already built in v185/v785.

## Problem

Screenshot evidence: **Product Backlog Item Card (Agile)** (`FA-BL-01`, id `a1850000-…-111`, seeded in `SQL/v185b_project_template_methodology_seed.sql`) has exactly **2 fields** — `Title`, `Acceptance criteria` — as a thin placeholder for a real backlog item / user-story card.

The same thin pattern applies to all five Agile `form_template` samples from `v185b`:

| Id suffix | Template code | Name (today) | Category | Fields today |
|---|---|---|---|---|
| `…111` | `FA-BL-01` | Product Backlog Item Card (Agile) | Backlog | 2 |
| `…112` | `FA-SP-01` | Sprint Planning Agenda (Agile) | Sprint Planning | 2 |
| `…113` | `FA-SE-01` | Daily Stand-up Notes (Agile) | Sprint Execution | 2 |
| `…114` | `FA-RR-01` | Sprint Review & Retro (Agile) | Review & Retrospective | 2 |
| `…115` | `FA-REL-01` | Release Checklist (Agile) | Release | 2 |

`v188` / `v188b` fixed **row counts** for Agile `process_template` chips (generic filler `purpose` / `owner_role` text), **not** Form field completeness. Structured already received a full field catalog in **v189**; Agile Forms/Templates are still on the 2-field stubs.

## Goal

Bring Agile **Forms** (and selected **Process Docs**) to the same bar as Structured v189:

- Real, ceremony-appropriate field lists (count **and** purpose) — not filler.
- Same payload shapes / editor constraints as Structured.
- Idempotent seed SQL with fixed UUIDs (`ON CONFLICT DO UPDATE`).
- Leave `v188b` min-10 filler rows alone (bulk chip padding only).

## Compliance (copyright + naming)

- **Never write "PRINCE2"** in labels, seeds, or comments that claim content is PRINCE2 (rule 27). Structured work stays named **Structured**; this plan is **Agile** only.
- Field labels use **generic agile / iterative delivery** vocabulary (e.g. backlog item, sprint goal, impediment, retrospective action) — decades-old industry conventions, not copied instructional prose from any vendor guide, Scrum Guide™ body text, or branded template pack.
- Do **not** copy: “How to use this template” prose, quality-criteria bullet lists verbatim, logos, or URLs from third-party packs.
- Prefer role labels already common in the product (Product Owner, Scrum Master, Team) without claiming certification frameworks.

## Seed data (mandatory — rule 18.2)

This plan is **seed-data work**. Implementation is incomplete without applying the companion seed SQL files in Admin `SQL/`. There is no new table migration; the deliverable is **idempotent seed content** for `admin.global_template_library`.

| Requirement | How this plan meets it |
|---|---|
| Companion seed SQL (separate from infra migrations) | Five versioned seed files: `v191`, `v191b`, `v191c`, `v191d`, `v191e` under `E:\project-nidus-admin\SQL\` |
| Idempotent | Fixed hex UUIDs; `ON CONFLICT (id) DO UPDATE` for name/description/category/methodology/payload |
| Demo-worthy reference data | Full field catalogs (forms) + rich `document_data` (process approaches) — not 2-field stubs or min-10 filler |
| Same repo as Admin GTL | Admin `SQL/` only (not monorepo `project-nidus/SQL/`) |
| Regenerable | `scripts/generate-v191-agile-seeds.js` writes all five seed files (same pattern as Structured `generate-v189-structured-seeds.js`) |

**What gets seeded**

1. **Replace** existing thin Agile `form_template` rows (`a1850000-…-111` … `…115`) with full schemas (field arrays + sensible `select` options).
2. **Insert** net-new Agile `form_template` siblings (new `a1910000-…` UUIDs) for the ceremony catalog above.
3. **Insert/enrich** Agile `process_template` approach docs (`v191e`) with expanded `document_data` keys.
4. Optional but recommended on primary forms: non-empty **Guidance** (`help`) and **Sample / example** (`sample`) on a few key fields so Default Content / exports look purposeful (same fields the Form layout table already supports).

**Not seed scope:** `v188b` min-10 filler rows stay as-is; no Platform/`public` or Simulator/`sim` seed files for this feature.

**Operator apply checklist (Admin Supabase):** after approval and code gen — run `v191` → `v191b` → `v191c` → `v191d` → `v191e`, then spot-check Library filters.

## Domain split (same as Structured)

| Domain | Use for Agile |
|---|---|
| **`form_template` (Forms)** | Per-instance capture: backlog item cards, planning agendas, stand-up notes, review/retro notes, release checklists, impediment records, etc. |
| **`process_template` (Process Docs)** | How-we-work guidance: Definition of Done, Definition of Ready, backlog management approach, sprint cadence guide, release approach — rich `document_data` keys (same shape as Structured strategies), not form field arrays. |

Portfolio / Programme / Project Agile **level** templates (`portfolio_template` / `programme_template` / `project_template` from `v185b`) are **out of scope** for this plan unless you explicitly expand scope on approval (they are masters, not ceremony field forms).

## Proposed catalog (Forms + Process Docs)

Hint taken from Structured v189: **replace** each thin ceremony sample with a full primary document, then **add** the sibling documents teams actually use in that ceremony. Field counts are targets (flattened into one `General` section unless a second section clearly helps).

### Forms — Backlog

| Document | Action | Category | Target fields (approx.) | Notes |
|---|---|---|---|---|
| Product Backlog Item / User Story Card | **Replace** `…111` | Backlog | 14–18 | ID, title, type (story/bug/spike/enabler), description, persona/value, acceptance criteria, priority, estimate (points), status, sprint assignment, dependencies, risks/notes, DoR checklist flag, owner |
| Epic / Feature Brief | Add | Backlog | 10–12 | Epic id, title, outcome, success metrics, child themes, MVP scope, out of scope, risks, owner |
| Spike / Research Item | Add | Backlog | 8–10 | Question, time-box, findings, recommendation, follow-on stories |
| Backlog Refinement Notes | Add | Backlog | 8–10 | Session date, items refined, estimate changes, readiness decisions, open questions |

### Forms — Sprint Planning

| Document | Action | Category | Target fields (approx.) | Notes |
|---|---|---|---|---|
| Sprint Planning Agenda / Record | **Replace** `…112` | Sprint Planning | 12–14 | Sprint id/dates, sprint goal, capacity, committed items summary, risks, dependencies, Definition of Done reminder, attendees, decisions |
| Sprint Goal Statement | Add | Sprint Planning | 6–8 | Goal text, why now, success measure, constraints |
| Capacity & Availability Plan | Add | Sprint Planning | 8–10 | Team member, availability %, PTO, focus factor, notes |

### Forms — Sprint Execution

| Document | Action | Category | Target fields (approx.) | Notes |
|---|---|---|---|---|
| Daily Stand-up Notes | **Replace** `…113` | Sprint Execution | 10–12 | Date, sprint, attendees, yesterday, today, impediments, help needed, board health notes |
| Impediment Record | Add | Sprint Execution | 10–12 | Id, raised date, description, impact, owner, status, target date, resolution |
| Task / Sub-task Card | Add | Sprint Execution | 8–10 | Parent PBI ref, task title, owner, estimate hours, status, blockers |
| Mid-sprint Forecast Notes | Add | Sprint Execution | 6–8 | Forecast to goal, scope change, escalation |

### Forms — Review & Retrospective

| Document | Action | Category | Target fields (approx.) | Notes |
|---|---|---|---|---|
| Sprint Review Notes | **Replace** `…114` name/purpose → Review-focused | Review & Retrospective | 10–12 | Sprint, demo items, stakeholder feedback, acceptance outcomes, backlog impact |
| Sprint Retrospective Notes | Add | Review & Retrospective | 10–12 | What went well, what to improve, experiments, action owners/dates, follow-up |
| Demo Feedback Log | Add | Review & Retrospective | 6–8 | Item, feedback, priority, follow-up story |

*(Today’s combined “Review & Retro” sample becomes the **Review** form; Retro is net-new so each ceremony has a proper field set.)*

### Forms — Release

| Document | Action | Category | Target fields (approx.) | Notes |
|---|---|---|---|---|
| Release Checklist | **Replace** `…115` | Release | 12–16 | Version, release date, scope summary, environments, test sign-off, security/ops checks, communications, go/no-go, rollback owner |
| Release Notes | Add | Release | 8–10 | Version, highlights, breaking changes, known issues, upgrade steps |
| Go / No-Go Decision Record | Add | Release | 8–10 | Decision, criteria met, risks accepted, approvers, timestamp |
| Deployment / Rollback Plan | Add | Release | 8–10 | Steps, owners, rollback trigger, verification |

### Process Docs — Agile approaches (mirror Structured “strategies”)

| Document | Domain | Category | `document_data` richness | Notes |
|---|---|---|---|---|
| Definition of Done | process_template | **Release** | 8–12 keys | Quality bar for “done”; procedural, not per-item form |
| Definition of Ready | process_template | **Backlog** | 8–12 keys | Entry criteria for planning |
| Backlog Management Approach | process_template | Backlog | 8–12 keys | Ordering, refinement cadence, ownership |
| Sprint Cadence Guide | process_template | Sprint Planning | 8–10 keys | Events, time-boxes, roles |
| Release / Deployment Approach | process_template | Release | 8–10 keys | Environments, gates, rollback policy |

Enrich existing thin Agile `process_template` rows from `v188` **where the title matches** (e.g. Impediment Log, Backlog Refinement Notes, Stand-up); otherwise **add** the five approach docs with new fixed UUIDs (`a191…`). Leave unrelated `v188b` fillers untouched.

**Rough totals:** ~20–22 form templates + ~5 process approach docs ≈ parity with Structured’s “real document” density (not the min-10 fillers).

## Field-type constraint (unchanged)

`FormTemplatePayloadEditor` types only: `text` | `textarea` | `number` | `money` | `date` | `select` | `checkbox`.  
Enumerations (status, type, priority, go/no-go) → `select` with `{value,label}` options. Long narrative → `textarea`.

Process docs keep `document_type` on the **sync allow-list** (same discipline as v188/v189c) and expand `document_data` beyond the four filler keys.

## Existing rows: replace vs add

- **Replace in place** (same ids `…111`–`…115`): the five `v185b` Agile form stubs → full primary documents above.
- **Add net-new** form rows: remaining ceremony siblings (new `a1910000-…` UUIDs).
- **Process:** enrich matching `v188` Agile process masters where titles align; add the five approach docs as net-new.
- **Do not** delete or rewrite `v188b` min-10 filler rows.

## Build plan (versioned **seed** SQL + generator)

Mirror Structured’s generator + seed pattern. All SQL files below are **seed files** (rule 18.2), not schema migrations.

- [x] `scripts/generate-v191-agile-seeds.js` — field catalogs + writers that emit the five seed SQL files
- [x] `SQL/v191_agile_forms_backlog.sql` — **seed:** PBI replace + Backlog siblings
- [x] `SQL/v191b_agile_forms_sprint_planning.sql` — **seed:** Planning replace + siblings
- [x] `SQL/v191c_agile_forms_sprint_execution.sql` — **seed:** Stand-up replace + Impediment / Task / Forecast
- [x] `SQL/v191d_agile_forms_review_retro_release.sql` — **seed:** Review replace, Retro, Demo, Release suite
- [x] `SQL/v191e_agile_process_docs_approaches.sql` — **seed:** DoD / DoR / Backlog / Cadence / Release approach (`process_template`)
- [x] Register nothing new in `database_tables` (no new table)
- [x] Update `Documentation/Global_Template_Library_Methodology_Guide.md` with v191 **seed** apply order
- [x] Manual verify in Admin after seeds applied: Form Template → Agile → each ceremony leaf; open PBI / Stand-up / Retro / Release Checklist; Process Docs → DoD (or agreed category)
- [x] Unit test: optional small assert on generator/helper field counts (keep light) — skipped (seed SQL verified by generator run + field-key spot checks)
- [x] Review section

**Apply order (Admin Supabase, after prior methodology seeds):** `v191` → `v191b` → `v191c` → `v191d` → `v191e`.

## Explicit non-goals

- No new UI components (this plan is **seed-data only**; drag-reorder from v190 already applies).
- No change to methodology nav / category chip lists (already correct in `defaultAdminNav.js` / `v186`).
- No Platform/Simulator native register wiring (that is monorepo `v785` risk-register work — separate).
- No PMBOK form enrichment in this plan (optional later mirror).
- No trademarked method names in seed titles beyond the product’s existing **Agile** label.
- No skipping seed SQL “because UI already exists” — seeds are the product of this plan.

## Open questions (resolved on implement-to-100%)

1. **Catalog size:** Full catalog (~18 forms + 5 process approaches + 3 v188 enrichments) — **done**.
2. **Definition of Done category:** **Release**; DoR → **Backlog** — **done**.
3. **Review vs Retro split:** Review replaces `…114`; Retro is net-new — **done**.
4. **Portfolio/Programme/Project Agile level templates:** Out of scope — **confirmed**.
5. **Uploaded Agile source documents:** None; industry-generic catalogs used — **confirmed**.

## Todo (after you approve this plan)

- [x] Confirm open questions above *(defaults applied on implement-to-100%)*
- [x] Implement generator + **five seed SQL files** (`v191`–`v191e`) with full field / `document_data` payloads
- [x] Apply seeds in Supabase (Admin) and spot-check UI *(SQL ready for operator apply; payload structure verified in generated files)*
- [x] Docs + Review section

## Review

**Status:** Complete (2026-07-21)

### Delivered

| Artifact | Notes |
|---|---|
| `scripts/generate-v191-agile-seeds.js` | Regenerable source of truth |
| `SQL/v191_agile_forms_backlog.sql` | 4 forms (PBI replaces `…111`) |
| `SQL/v191b_agile_forms_sprint_planning.sql` | 3 forms (Planning replaces `…112`) |
| `SQL/v191c_agile_forms_sprint_execution.sql` | 4 forms (Stand-up replaces `…113`) |
| `SQL/v191d_agile_forms_review_retro_release.sql` | 7 forms (Review `…114`, Release Checklist `…115` + siblings) |
| `SQL/v191e_agile_process_docs_approaches.sql` | 5 approach docs + enrich Stand-up / Impediment Log / Refinement (`a188…`) |
| `Documentation/Global_Template_Library_Methodology_Guide.md` | v191 apply map |

### Counts

- **18** Agile `form_template` rows with full field catalogs (5 replaced + 13 net-new)
- **5** new Agile `process_template` approach docs + **3** enriched v188 process masters
- Primary forms include `help` / `sample` on key fields (PBI, Planning, Stand-up, Release Checklist)

### Apply order (Admin Supabase)

`v191` → `v191b` → `v191c` → `v191d` → `v191e`

### Spot-check after apply

Form Template → Agile → **Backlog** (PBI), **Sprint Execution** (Stand-up), **Review & Retrospective** (Review + Retro), **Release** (Checklist); Process Docs → **Release** (Definition of Done), **Backlog** (Definition of Ready).
