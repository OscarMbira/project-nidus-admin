# v23 — ID Generation Engine: Sequential + Date-Aware Rules

**Companion plan (Platform/Simulator migration):** `E:\project-nidus\projectplan\v755_system_wide_id_generation_migration_plan.md`

## Goal
`admin.id_generation_rules` / `admin.generate_display_id()` currently only produce **random**
alphanumeric codes (e.g. `RCC-NZ535Q7TG`), uniquely per table, with no sequencing and no date
component. Going forward this engine is the **single architecture** for all record IDs across
Platform, Simulator, and Admin — so it must also be able to reproduce the sequential, year-scoped
numbering that ~20 tables currently generate via their own hardcoded `generate_*_identifier()`
functions (e.g. `R-2026-001`, resetting to `-001` per risk register per year).

This plan extends the engine and its admin UI (the ID Generation Rule Form shown in the
screenshot) so an admin can choose **Random** or **Sequential** generation, optionally include a
date component, and optionally scope the sequence to a parent record (e.g. reset per
`risk_register_id`).

## Current state (confirmed by reading the code)
- Schema: `SQL/v19_id_generation.sql`, extended by `v30` (`segment_type`), `v138` (capacity
  safeguards, current `create/update_id_generation_rule` signatures), `v141/142/145/148-150`
  (abbreviation/table-list/bulk-seed concerns).
- `admin.id_generation_rules` columns today: `target_table, table_abbreviation,
  table_description, separator, suffix, letter_case, segment_type, num_letters, num_digits,
  excluded_chars, seed_value, current_sequence, is_active`.
- `admin._id_gen_build_code(num_letters, num_digits, letter_case, excluded, segment_type)` —
  purely `random()`-based, no sequence input.
- `admin.generate_display_id(p_table, p_record_id)` — builds a random code, inserts into
  `admin.generated_ids`, increments `current_sequence` as **write-only telemetry** (never read
  back into the generated code). Confirmed via code read — no sequential logic exists today.
- Form UI: `modules/system/src/pages/IDGenerationRuleFormPage.jsx` +
  `idGenerationRuleFormFields.jsx`. Mutations: `packages/shared/src/mutationServices.js`
  (`idRuleParams()`, `createIdGenerationRule()`, `updateIdGenerationRule()`). Reads/capacity
  preview: `packages/shared/src/dataServices.js`.
- Routes: `modules/system/src/index.jsx` (`id-generation-rules`, `id-generation-rule-form`).

## Design

### Schema changes — `SQL/v155_id_generation_sequential_mode.sql`
```sql
ALTER TABLE admin.id_generation_rules
  ADD COLUMN generation_mode TEXT NOT NULL DEFAULT 'random'
    CHECK (generation_mode IN ('random', 'sequential')),
  ADD COLUMN include_date BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN date_format TEXT
    CHECK (date_format IS NULL OR date_format IN ('YYYY', 'YYYYMM', 'YYYYMMDD')),
  ADD COLUMN scope_column TEXT;
  -- scope_column: name of a column on target_table to reset the sequence per parent
  -- (e.g. 'risk_register_id'). NULL = one sequence for the whole table (optionally still
  -- reset by date if include_date is set).

CHECK ((generation_mode = 'sequential') OR (include_date = FALSE AND scope_column IS NULL));
CHECK (generation_mode = 'random' OR date_format IS NOT NULL OR include_date = FALSE);
```

New tracking table (a single `current_sequence` column on the rule can't represent "next number
per risk register per year" — need one counter per scope × period):
```sql
CREATE TABLE admin.id_generation_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES admin.id_generation_rules(id) ON DELETE CASCADE,
    scope_value TEXT,      -- NULL if rule has no scope_column
    period_key TEXT,       -- NULL if rule has no include_date; else e.g. '2026'
    current_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE NULLS NOT DISTINCT (rule_id, scope_value, period_key)
);
```
(`UNIQUE NULLS NOT DISTINCT` — PG 15+, matches this project's stated PG version — so the
"no scope, no date" case still collapses to one row per rule.)

### `admin.generate_display_id()` — sequential branch
When `rule.generation_mode = 'sequential'`:
1. If `rule.scope_column IS NOT NULL`: dynamically read that column's value off the **already
   inserted** row — `EXECUTE format('SELECT %I::TEXT FROM %s WHERE id = $1', rule.scope_column,
   p_table) INTO v_scope_value USING p_record_id`. This is why the calling trigger must be
   **AFTER INSERT** (see migration plan) — the row must exist and its FK columns populated
   before this lookup can resolve.
2. If `rule.include_date`: `v_period_key := to_char(CURRENT_DATE, rule.date_format)` (mapped:
   `YYYY`→`'YYYY'`, `YYYYMM`→`'YYYYMM'`, `YYYYMMDD`→`'YYYYMMDD'`).
3. Atomically increment the matching `admin.id_generation_sequences` row (`INSERT ... ON
   CONFLICT (rule_id, scope_value, period_key) DO UPDATE SET current_value = current_value + 1
   RETURNING current_value`; first hit seeds from `rule.seed_value`).
4. `v_display_id := rule.table_abbreviation || rule.separator || [v_period_key ||
   rule.separator if include_date] || LPAD(v_sequence::TEXT, rule.num_digits, '0') ||
   rule.suffix`.
5. Insert into `admin.generated_ids` exactly as the random path does (same downstream contract —
   `admin.resolve_display_id()` etc. keep working unchanged).

The random path is untouched — existing random-mode tables/behavior don't change.

### `create_id_generation_rule` / `update_id_generation_rule` — new parameters
Add `p_generation_mode TEXT DEFAULT 'random'`, `p_include_date BOOLEAN DEFAULT FALSE`,
`p_date_format TEXT DEFAULT NULL`, `p_scope_column TEXT DEFAULT NULL`, with the same CHECK-backed
validation as the table constraints (reject sequential-only fields when mode='random').

### Admin UI — `idGenerationRuleFormFields.jsx` / `IDGenerationRuleFormPage.jsx`
- New **Generation Mode** selector (Random / Sequential) — top of form, drives conditional
  rendering of everything below it.
- **Random mode** (current behavior, unchanged): ID Type/segment_type, Letter Case, Excluded
  Characters, Number of Letters all shown as today.
- **Sequential mode**: hides Letter Case / Excluded Characters / Number of Letters (not
  applicable — no random characters). Shows:
  - **Include Date** checkbox
  - **Date Format** dropdown (Year `2026` / Year-Month `202606` / Full `20260620`) — visible only
    when Include Date is checked
  - **Scope To** dropdown — lists FK-shaped columns (`information_schema.columns` where
    `column_name LIKE '%_id'` and NOT the table's own `id`) on the selected `target_table`, via a
    small new RPC `admin.get_scopable_columns(p_target_table TEXT)`; "None (single sequence for
    whole table)" as the default option.
  - `Number of Digits` is reused as the zero-padded sequence width (already exists on the form).
- **ID Format Preview** panel: extend the preview builder (currently random-only) with a
  sequential branch, e.g. `RCC-2026-001` for abbreviation `RCC` + include_date(YYYY) +
  num_digits 3 + seed 1.
- **Capacity** panel: for sequential mode, capacity is `10^num_digits` **per scope × period**
  (not a global keyspace calculation) — reword the panel's copy accordingly when mode=sequential
  (e.g. "999 IDs per risk register per year" instead of "~3321.7B unique IDs").

## Todo list
- [x] 1. `SQL/v155_id_generation_sequential_mode.sql` — ALTER TABLE + new
      `admin.id_generation_sequences` table + RLS/grants matching existing pattern.
- [x] 2. Update `admin.generate_display_id()` with the sequential branch (dynamic scope lookup +
      atomic sequence increment + date formatting).
- [x] 3. Update `admin.create_id_generation_rule()` / `admin.update_id_generation_rule()` with
      the 4 new parameters + validation.
- [x] 4. New RPC `admin.get_scopable_columns(p_target_table TEXT)` for the Scope To dropdown.
- [x] 5. `idGenerationRuleFormFields.jsx` — Generation Mode selector + conditional Sequential
      fields (Include Date, Date Format, Scope To).
- [x] 6. `IDGenerationRuleFormPage.jsx` — wire new fields into `idRuleParams()` payload, extend
      the ID Format Preview and Capacity panel logic for sequential mode.
- [x] 7. `IDGenerationRulesPage.jsx` (list page) — show generation mode / date / scope at a
      glance (e.g. a small badge) so admins can tell sequential rules apart from random ones.
- [x] 8. Unit tests for sequential preview/utils (`packages/shared/src/__tests__/idGenerationSequentialPreview.test.js`).
- [x] 9. Documentation: `Documentation/ID_Generation_Sequential_Mode_Guide.md`.
- [x] 10. Manual verification: create a Sequential rule for a test table with `include_date=YYYY`
      + `scope_column` set, confirm generated IDs match `ABC-2026-001`, `ABC-2026-002` pattern
      and reset correctly for a different scope value. *(Requires applying v155 SQL in Supabase — see Review.)*

## Review

**Status: Complete (code + tests + docs). Apply SQL before runtime use.**

### Deliverables

| Area | Files |
|------|-------|
| SQL migration | `SQL/v155_id_generation_sequential_mode.sql` |
| Shared services | `packages/shared/src/mutationServices.js`, `dataServices.js`, `idGenerationSequentialPreview.js` |
| Admin UI | `idGenerationRuleFormFields.jsx`, `IDGenerationRuleFormPage.jsx`, `IDGenerationRulesPage.jsx`, `idGenerationPreview.js` |
| Tests | `packages/shared/src/__tests__/idGenerationSequentialPreview.test.js` (8 tests) |
| Docs | `Documentation/ID_Generation_Sequential_Mode_Guide.md` |
| npm script | `pnpm admin:migrate-id-generation-sequential` |

### Summary of changes

1. **Schema:** Added `generation_mode`, `include_date`, `date_format`, `scope_column` to rules; new `id_generation_sequences` table with RLS; CHECK constraints enforcing mode-specific field rules.
2. **Engine:** `generate_display_id()` branches on sequential mode — dynamic scope lookup via `%I` qualified table query, atomic counter increment, date period keys, zero-padded sequence.
3. **RPCs:** Extended create/update with 4 new params (backward-compatible defaults); new `get_scopable_columns()`; extended `preview_id_generation_capacity()` and `v_id_generation_rule_usage` for sequential keyspace.
4. **UI:** Generation Mode selector drives conditional fields; Scope To dropdown loads FK columns; preview/capacity panels show sequential-specific copy; list page shows mode badge.
5. **Tests:** Client-side sequential preview/keyspace/capacity label unit tests pass via Vitest.

### User action required

1. Run `pnpm admin:migrate-id-generation-sequential` against Supabase.
2. Manual smoke test (Task 10): create a sequential rule and insert test rows with AFTER INSERT trigger wired.
3. Platform/Simulator table migration remains in companion plan v755.

### Notes

- Existing random rules and E2E concurrency tests remain compatible (new RPC params default to random mode).
- Sequential scope lookup requires target-table triggers to run **AFTER INSERT** so FK columns are populated.
