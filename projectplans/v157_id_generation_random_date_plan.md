# v157 — Random mode optional date in ID generation

## Goal

Allow PMO admins to include a date token in **Random** ID rules (same UI as Sequential), e.g. `ABD-2026-E5KHZL439`.

## Todo

- [x] SQL `v157_id_generation_random_date.sql` — relax constraint, update engine + create/update RPCs
- [x] Form UI — show Date Format + Include date for Random mode
- [x] Preview helpers — random pattern/example with `[DATE]` token
- [x] Services — pass `include_date` / `date_format` for random rules
- [x] Unit tests — random date preview helpers
- [x] Documentation
- [x] Compact form layout — right-side preview/capacity with reduced spacing for one-page navigation

## Review

- Random rules may set `include_date` + `date_format`; `scope_column` remains sequential-only.
- Generated ID layout: `{abbrev}{sep}{period_key}{sep}{random_code}{suffix}` when date enabled.
- The Admin form now uses a compact two-column layout with shorter helper text and a right-side preview/capacity panel.
- Platform/Simulator consume IDs via existing triggers — no monorepo code changes required.
- Apply SQL after v155/v156: `SQL/v157_id_generation_random_date.sql`
