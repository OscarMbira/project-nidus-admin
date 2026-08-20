# ID Generation — Sequential Mode Guide

## Overview

The admin ID generation engine supports two modes:

| Mode | Example | Use when |
|------|---------|----------|
| **Random** | `RCC-NZ535Q7TG` | Large keyspaces, no ordering requirement |
| **Sequential** | `RCC-2026-001` | Human-readable numbering, year/register scoping |

Sequential mode is configured on **System → ID Generation Rules** via the rule form.

## Sequential format

A sequential display ID is built as:

```
{abbreviation}{separator}[{period}{separator}]{zero_padded_sequence}{suffix}
```

Examples:

- `RCC-2026-001` — abbreviation `RCC`, year period, 3-digit sequence, seed 1
- `R-042` — no date, global counter, seed 42
- `TSK-202607-015` — year-month period with scoped counter per parent FK

## Form fields (Sequential mode)

| Field | Purpose |
|-------|---------|
| **Generation Mode** | Switch between Random and Sequential |
| **Sequence Width (digits)** | Zero-padded width (e.g. 3 → `001`) |
| **Include date** | Embeds a date token in the ID |
| **Date Format** | `YYYY`, `YYYYMM`, or `YYYYMMDD` |
| **Scope To** | FK column on the target table (e.g. `risk_register_id`) — counter resets per distinct value |
| **Seed Value** | First number issued in each scope × period bucket |

Random-only fields (Letter Case, Excluded Characters, Number of Letters, ID Type) are hidden in Sequential mode.

## Capacity

- **Random:** total permutation count from letters/digits/exclusions.
- **Sequential:** `10^digits` IDs per **scope × period** bucket.
  - With scope and/or date, capacity applies per bucket (not globally against total table rows).
  - Without scope or date, the engine compares table row count against the single global sequence.

## Database (v155)

Migration: `SQL/v155_id_generation_sequential_mode.sql`

### New columns on `admin.id_generation_rules`

- `generation_mode` — `random` | `sequential`
- `include_date`, `date_format`, `scope_column`

### New table `admin.id_generation_sequences`

Stores atomic counters keyed by `(rule_id, scope_value, period_key)`.

### RPC changes

- `admin.generate_display_id()` — sequential branch with dynamic scope lookup (requires **AFTER INSERT** trigger on target tables)
- `admin.create_id_generation_rule()` / `admin.update_id_generation_rule()` — four new optional parameters
- `admin.get_scopable_columns(p_target_table)` — FK columns for Scope To dropdown
- `admin.preview_id_generation_capacity()` — sequential keyspace branch

## Platform / Simulator migration

To replace legacy `generate_*_identifier()` functions on Platform/Simulator tables, apply the companion plan:

`E:\project-nidus\projectplan\v755_system_wide_id_generation_migration_plan.md`

## Manual verification checklist

1. Run `pnpm admin:migrate-id-generation-sequential` (or apply `v155` SQL in Supabase).
2. Create a Sequential rule with `include_date = YYYY`, `num_digits = 3`, optional scope column.
3. Insert rows on the target table (AFTER INSERT trigger must call `admin.generate_display_id()`).
4. Confirm IDs follow `ABC-2026-001`, `ABC-2026-002`, … and reset per scope/period as configured.

## Related files

| Area | Path |
|------|------|
| SQL migration | `SQL/v155_id_generation_sequential_mode.sql` |
| Admin form | `modules/system/src/pages/idGenerationRuleFormFields.jsx` |
| Preview utils | `packages/shared/src/idGenerationSequentialPreview.js` |
| Plan | `projectplans/v23_id_generation_sequential_date_engine_plan.md` |
