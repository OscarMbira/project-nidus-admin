# v172 — Sync ICT into Global Template Library

**Status:** COMPLETE  
**Depends on:** Monorepo `SQL/v775_ict_industry_template_seed.sql`, Admin `v170` sync RPC

## Deliverable

`SQL/v172_sync_ict_industry_into_global_library.sql` — calls `admin.sync_industry_plan_templates_from_catalog` after verifying `public.pmo_industry_templates.industry_code = 'ict'`.

## Apply

1. Monorepo v775 ICT seed  
2. This file (or UI bootstrap import)  
3. Publish from Global Template Library if rows remain unsynced downstream

## Review

Thin catch-up only; no new Admin tables. Parent remains Global Template Library after import.
