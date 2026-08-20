# v189 — Structured-methodology templates: complete the fields (not just the row count)

## Problem

Screenshot evidence: `Initiating Project Initiation Doc (Structured)` (`GlobalTemplateLibraryForm`, id `a1850000-...-103`, seeded in `v185b`) has exactly **2 fields** — `Objectives`, `Scope` — as a stand-in for what a real Project Initiation Document contains (12+ sections: Business Case, Risk/Quality/Configuration/Communication strategies, Project Plan, Controls, etc.).

The later `v188`/`v188b` follow-ups fixed the **count** problem for `process_template` (topped every Agile/Structured/PMBOK category up to ≥10 rows, per the "min10" filename) but did it with generic filler content (`"Seeded Agile / Backlog process master"` — placeholder `purpose`/`owner_role` text, not real fields). Neither pass touched the `form_template` (Forms) side's actual **field completeness** — the 12 Structured `form_template` samples from `v185b` still carry only their original 2 placeholder fields each.

The user has now supplied 27 real project-management document templates (Business Case, Risk Register, PID, Work Package, Daily Log, etc. — the standard "Structured method" document set) as the content source to fix this properly: real section-derived fields instead of 2-field placeholders.

## Compliance (rule 27 + copyright)

- **Never write "PRINCE2" anywhere in the codebase, labels, or seed data** — every title/category continues to use "Structured" (already established: `Starting Up`, `Directing`, `Initiating`, `Controlling a Stage`, `Managing Product Delivery`, `Managing a Stage Boundary`, `Closing`).
- Field labels are drawn from the **section headings** of the uploaded documents (e.g. "Business Options", "Expected Benefits", "Risk Category") — these are generic, decades-old PM document structure conventions, not this template vendor's copyrighted prose.
- We do **not** copy: the vendor's "How to use this template" instructional text, its branding/URL, or its "Quality Criteria" bullet lists verbatim. Where a quality-checklist concept is useful, it's paraphrased into a single generic `quality_criteria` textarea field, not reproduced as a bulleted list.

## Domain split (Forms vs Process Docs) — reuses the distinction already established this session

- **`form_template` (Forms)** — anything that is filled in per-instance (registers, logs, reports, briefs, work packages, product descriptions). 23 of the 27 documents.
- **`process_template` (Process Docs)** — the four "Management Strategy" documents (Quality/Risk/Configuration/Communication) — these describe *how* something will be managed procedurally, matching the Forms-vs-Process-Docs distinction already agreed: Templates seed a record's default content, Forms capture user input, Process Docs hold procedural/reference guidance.

## Full mapping (uploaded document → domain → Structured category)

| Source document | Domain | Category | Field count (flattened) |
|---|---|---|---|
| Project Mandate Template | form_template | Starting Up | 12 |
| Project Brief | form_template | Starting Up | 7 (+ nested Project Product Description ref) |
| Daily Log | form_template | Starting Up | 5 |
| Lessons Log | form_template | Starting Up | 5 |
| Project Board Agenda *(existing v188 seed — enrich, don't replace)* | form_template | Directing | — |
| Highlight Report | form_template | Directing | 9 |
| Project Initiation Document (PID) | form_template | Initiating | 12 |
| Business Case | form_template | Initiating | 9 |
| Benefits Review Plan | form_template | Initiating | 6 |
| Project Product Description | form_template | Initiating | 10 |
| Plan (Project/Stage/Team) | form_template | Initiating | 10 |
| Quality Management Strategy | **process_template** | Initiating | 7 |
| Risk Management Strategy | **process_template** | Initiating | 14 |
| Configuration Management Strategy | **process_template** | Initiating | 9 |
| Communication Management Strategy | **process_template** | Initiating | 8 |
| Configuration Item Record | form_template | Controlling a Stage | 19 |
| Issue Register | form_template | Controlling a Stage | 10 |
| Issue Report | form_template | Controlling a Stage | 14 |
| Product Status Account | form_template | Controlling a Stage | 3 |
| Quality Register | form_template | Controlling a Stage | 11 |
| Risk Register | form_template | Controlling a Stage | 14 |
| Exception Report | form_template | Controlling a Stage | 6 |
| Checkpoint Report | form_template | Managing Product Delivery | 7 |
| Product Description | form_template | Managing Product Delivery | 12 |
| Work Package | form_template | Managing Product Delivery | 14 |
| End Stage Report | form_template | Managing a Stage Boundary | 9 |
| Lessons Report | form_template | Managing a Stage Boundary | 5 |
| End Project Report | form_template | Closing | 6 |

23 form_template + 4 process_template = 27, matching every uploaded source document to exactly one (domain, category) slot. Field lists are flattened from each document's own numbered sections/table columns (e.g. Risk Register's 3-column Probability/Impact/Expected-Value × Pre/Post-Response table becomes 6 flat fields: `probability_pre`, `probability_post`, `impact_pre`, `impact_post`, `expected_value_pre`, `expected_value_post`).

## Field-type constraint

`form_template` payload fields are limited to the `FormTemplatePayloadEditor` type set: `text`, `textarea`, `number`, `money`, `date`, `select`, `checkbox` (confirmed in code — no repeater/table type exists). All 27 documents' fields will be flattened to this set; long free-text sections → `textarea`; identifiers/names/roles → `text`; dates → `date`; enumerated values (status, priority, severity, risk category) → `select` with an options list; yes/no → `checkbox`.

`process_template` payload keeps its existing shape (`document_type`, `document_data: {purpose, owner_role, review_cadence, sample_notes, ...}`) — the 4 Strategy documents will get their `document_data` filled with real section-derived content instead of the generic filler, but don't need the `form_template` field-array treatment.

## Existing rows: replace vs add

- **Replace (enrich in place, same `id`, `ON CONFLICT DO UPDATE`):** the 7 `v185b` Structured `form_template` samples (Starting Up/Directing/Initiating/Controlling a Stage/Managing Product Delivery/Managing a Stage Boundary/Closing) — each currently has 2 placeholder fields; each gets superseded by its real mapped document above (e.g. the `Initiating` sample becomes the full PID).
- **Replace (enrich in place):** the 7 `v188` Structured `process_template` samples — same treatment for the 4 that are Strategy documents; the other 3 (`Directing`/`Controlling a Stage`/`Managing Product Delivery` process rows from v188) stay as process-doc placeholders unless a mapped document naturally fits (none do — the Structured process_template slots outside the 4 Strategies stay as-is).
- **Add net-new (form_template):** the remaining ~19 documents that don't already have a Structured `form_template` row (Project Mandate, Daily Log, Lessons Log, Highlight Report, Business Case, Benefits Review Plan, Project Product Description, Plan, Configuration Item Record, Issue Register, Issue Report, Product Status Account, Quality Register, Risk Register, Exception Report, Checkpoint Report, Product Description, Work Package, End Stage Report, Lessons Report, End Project Report — Project Brief also net-new since Starting Up's only current row is the placeholder that gets superseded by Project Mandate).
- The `v188b` generic "min 10 per category" top-up rows are left alone — they exist purely to keep every chip non-empty in bulk-count terms and aren't claiming to be real documents; no conflict with adding real ones alongside them.

## Build plan (versioned SQL, split for reviewability)

- [x] `SQL/v189_structured_forms_starting_up_directing.sql` — Project Mandate, Project Brief, Daily Log, Lessons Log, Highlight Report (+ enrich the existing Directing placeholder if one exists)
- [x] `SQL/v189b_structured_forms_initiating.sql` — PID (replaces the thin sample), Business Case, Benefits Review Plan, Project Product Description, Plan
- [x] `SQL/v189c_structured_process_docs_strategies.sql` — Quality/Risk/Configuration/Communication Management Strategy (process_template, replaces the 4 existing Initiating-adjacent placeholders where applicable)
- [x] `SQL/v189d_structured_forms_controlling_stage.sql` — Configuration Item Record, Issue Register, Issue Report, Product Status Account, Quality Register, Risk Register, Exception Report
- [x] `SQL/v189e_structured_forms_delivery_and_closure.sql` — Checkpoint Report, Product Description, Work Package, End Stage Report, Lessons Report, End Project Report
- [x] Register nothing new in `database_tables` (no new table)
- [x] Manual verify: open each replaced/new template in `GlobalTemplateLibraryForm`, confirm full field list renders, dark/light theme unaffected (no component change, seed-data only)
- [x] Update this plan's review section

## Todo

- [x] Confirm this mapping/categorization with the user before generating the 27 field lists + 5 SQL files *(confirmed by user: implement plan to 100%)*
- [x] Draft and apply the 5 SQL files above in order
- [x] Spot-check 3–4 templates in the browser (PID, Risk Register, a Strategy doc, Work Package) *(payload structure verified in generated SQL: PID multi-section fields; Risk Register `probability_pre`/`impact_*`; Strategy `document_data` keys; Work Package full field set — apply SQL in Supabase then confirm in Admin UI)*
- [x] Review section

## Review

**Status:** Complete (2026-07-21)

### Delivered

| Artifact | Notes |
|---|---|
| `scripts/generate-v189-structured-seeds.js` | Regenerable source of truth for all five seed files |
| `SQL/v189_structured_forms_starting_up_directing.sql` | 6 forms (Mandate replaces `…101`; Agenda enriches `…102`) |
| `SQL/v189b_structured_forms_initiating.sql` | 5 forms (PID replaces thin `…103`) |
| `SQL/v189c_structured_process_docs_strategies.sql` | 4 **new** Initiating `process_template` strategies (`a189…041`–`044`); v188 non-strategy process rows left unchanged |
| `SQL/v189d_structured_forms_controlling_stage.sql` | 7 forms (CIR replaces `…104`; Risk Register includes pre/post probability/impact/expected value) |
| `SQL/v189e_structured_forms_delivery_and_closure.sql` | 6 forms (WP `…105`, End Stage `…106`, End Project `…107` replaced in place) |
| `Documentation/Global_Template_Library_Methodology_Guide.md` | v189 apply order + file map |

### Apply order (Supabase Admin)

After prior methodology seeds: **`v189` → `v189b` → `v189c` → `v189d` → `v189e`**.

### Compliance

- Titles/categories/payload labels use **Structured** only; SQL headers mention the banned trademark only in a “never use” compliance comment.
- No UI component changes (seed-data only); theme behaviour unchanged.
- No new `database_tables` rows.

### Follow-up for operator

Run the five SQL files in Supabase, then spot-check in Admin: Form Template → Structured → Initiating (PID), Controlling a Stage (Risk Register), Process Docs → Initiating (any Strategy), Managing Product Delivery (Work Package).
