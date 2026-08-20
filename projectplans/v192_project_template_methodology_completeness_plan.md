# v192 — Project Template methodology completeness

## Problem

Global Template Library → **Project Template** → **Structured** (and similarly PMBOK / Agile) showed only **one** thin sample (e.g. “Structured Project Initiation”), so methodology filters looked incomplete compared to Forms/Process Docs which already have a full stage/ceremony set.

## Fix

- [x] `SQL/v192_project_template_methodology_completeness_seed.sql` — one `project_template` master per methodology × phase/ceremony category, with real objectives/governance/risks/metrics/roles
- [x] Align existing v185b project samples to taxonomy categories (`Initiating`, `Executing`, `Sprint Execution`)
- [x] List UI: show phase/ceremony category chips for `project_template` (same chips as Forms/Process)
- [x] Update `Documentation/Global_Template_Library_Methodology_Guide.md`

## Expected counts after apply

| Methodology | Project templates |
|---|---|
| PMBOK | 5 |
| Structured | 7 |
| Agile | 5 |

## Apply order

1. Admin `v185` / `v185b` (if not already)
2. Admin `v192_project_template_methodology_completeness_seed.sql`

## Review

Shipped. After applying v192, refresh Global Template Library → Project Template → Structured: expect **7** rows and category chips for each Structured stage.
