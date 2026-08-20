# Global Template Library — Display IDs (GTL / GTV)

**Plans:** `projectplans/v195_global_template_id_generation_plan.md`  
**SQL:** `SQL/v193_global_template_id_generation.sql`, `SQL/v193b_global_template_id_generation_seed.sql`

## What it is
Human-readable sequential IDs for Global Templates, using the existing Admin ID Generation engine (`admin.id_generation_rules` + `admin.generate_display_id`).

| Table | Abbreviation | Mode | Example |
|-------|--------------|------|---------|
| `admin.global_template_library` | `GTL` | Sequential, 4 digits, no date | `GTL-0001` |
| `admin.global_template_versions` | `GTV` | Sequential, 4 digits, no date | `GTV-0001` |

Nav leaves (Portfolio / Forms · Standards-Based / etc.) are **filters** on the same library table — they share the `GTL` rule.

## Apply order
1. `v193_global_template_id_generation.sql` — `display_id` columns, AFTER INSERT triggers, `database_tables` registry  
2. `v193b_global_template_id_generation_seed.sql` — create/update rules + backfill existing rows  

Requires an active `super_admin` for the seed RPCs (same as `v156`).

## Behaviour
- New library / version rows get a `display_id` automatically after the rule exists.
- Backfill assigns IDs in `created_at` / name order for library rows.
- IDs appear on the Global Template Library list (table + cards) and detail header.
- **URLs use `display_id`** (e.g. `/content/global-template-form?id=GTL-0001&mode=view`). UUID deep links still resolve, then replace to the canonical display ID.
- Manage / inspect rules under **System → ID Generation Rules** (target `admin.global_template_library`).

## Notes
- UUID primary keys are unchanged; `display_id` is the human-facing reference.
- Downstream Platform/Simulator tables are out of scope for this change (option A only).
