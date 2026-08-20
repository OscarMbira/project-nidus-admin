# v165 — Global Template Library: Guidance + Sample Defaults

**Status:** COMPLETE  
**Repo:** `E:\project-nidus-admin`  
**Companion monorepo:** `SQL/v771_pm_template_field_links_guidance.sql`  
**Depends on:** Admin `v160`–`v164`, monorepo `v764`/`v765`

## Goal
Match Platform form-template dual content (v770/v770b):
- **Guidance** (`payload[].guidance_text`) — instructions for users
- **Sample default** (`payload[].default_value`) — copy-ready content that syncs as `default_value_override`

## Deliverables
- [x] Admin plan (this file)
- [x] Admin SQL `v165` — payload contract comment (`guidance_text`)
- [x] Admin SQL `v165b` — seed “Project Charter Core Fields” with guidance + samples
- [x] Monorepo `v771` — `guidance_text_override` on `pm_template_field_links` + sync RPC
- [x] Admin Form/Detail UI for guidance + sample
- [x] Utils/tests + guide update

## Review

### Completed 2026-07-16

**Admin**
- `SQL/v165_global_template_payload_guidance_contract.sql`
- `SQL/v165b_global_template_charter_fields_seed.sql` — fixed id `a1650000-1111-4000-8000-000000000001`
- Form: Guidance + Sample default editors; Detail shows both
- `globalTemplateUtils` helpers + unit tests

**Monorepo**
- `SQL/v771_pm_template_field_links_guidance.sql` — column + sync maps `guidance_text` / `default_value`

**Apply:** monorepo `v771`, then Admin `v165` → `v165b`. Publish the seeded template from Admin when ready.
