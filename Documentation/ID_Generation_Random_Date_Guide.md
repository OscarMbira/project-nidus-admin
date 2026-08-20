# ID Generation — Random Mode Date Token

## Overview

Random ID rules can optionally embed a date period between the table abbreviation and the random code segment, using the same **Include date in ID** and **Date Format** controls as Sequential mode.

## Example formats

| Mode | Include date | Example |
|------|--------------|---------|
| Random | No | `ABD-E5KHZL439` |
| Random | Yes (YYYY) | `ABD-2026-E5KHZL439` |
| Sequential | Yes (YYYY) | `RCC-2026-001` |

## Admin form

On the **Id Generation Rule Form**, select **Random** as Generation Mode. The **Random options** panel shows:

1. **Date Format** — Year, Year-Month, or Full Date (enabled when Include date is checked)
2. **Include date in ID** — inserts the date token at generation time

Scope To remains available only in Sequential mode.

## Database

Migration: `SQL/v157_id_generation_random_date.sql`

- Relaxes the random-mode CHECK so `include_date` is allowed
- `scope_column` is still forbidden for random rules
- `admin.generate_display_id()` inserts the period key before the random code when enabled

## Platform / Simulator

No application code changes. New records on Platform and Simulator pick up dated random IDs automatically once the Admin rule is saved and the migration is applied.
