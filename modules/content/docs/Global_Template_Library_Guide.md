# Global Template Library — Admin Guide

**Version:** v167–v171 / SQL v160–v170 (+ monorepo v771, v773, v774)  
**Nav:** top-level **Global Templates** → Library → Global Template Library (`/content/global-template-library`)  
**Roles:** `content_admin`, `system_admin`, `super_admin`

---

## Purpose

This library is the **parent / source of truth**. Platform and Simulator **inherit** via Publish — they do not own the canonical industry-plan content.

Nidus staff author **Global Templates**. Supported domains:

| Domain | Payload shape | On publish |
|--------|---------------|------------|
| `fields` | JSON **array** of field rows | Per-account `pm_template_nodes` + field links / custom field defs |
| `industry_plan` | JSON **object** with `industry_code` + child arrays | Shared `public.pmo_industry_templates` (+ children) and per-account `pm_template_nodes` (`domain=industry_plan`) |

Publish pushes into Platform (`public`) and Simulator (`sim`) as system-synced PMO nodes (`is_system_synced=true`) for every active account.

## Fields domain

Each field in the payload supports:

| Key | Purpose | Syncs to |
|-----|---------|----------|
| `guidance_text` | Instructions for completing the field | `pm_template_field_links.guidance_text_override` (+ `custom_field_definitions.description` when empty) |
| `default_value` | Copy-ready sample / org default | `pm_template_field_links.default_value_override` |

Seeded starter: **Project Charter Core Fields** (`a1650000-1111-4000-8000-000000000001`) via `SQL/v165b_global_template_charter_fields_seed.sql`.

## Industry plan domain

Payload keys (object):

- `industry_code` (**required**), `industry_name`, `description`, `typical_duration`, `icon`, `tags`
- Arrays: `phases[]`, `activities[]`, `deliverables[]`, `risks[]`, `milestones[]`, `roles[]` — field names align with `pmo_industry_template_*` tables where practical
- Activities / deliverables / milestones may include `phase_number` to link to a phase

Category on the Global Template row can hold an industry grouping label (e.g. international best practice). The Admin form uses a **tabbed structured editor** (Overview, Phases, Activities, Deliverables, Risks, Milestones, Roles) — not raw JSON. Platform’s multi-step Industry Template wizard remains available for PMO authors in the apps.

## Workflow

1. **Create / Edit** — **Global Templates** → Global Template Library. Choose domain (`fields` or `industry_plan`). Domain is fixed after create.
2. **Lifecycle** — Approvals use Record Lifecycle (justification required).
3. **Publish to Platform** / **Publish to Simulator** — Primary list actions publish pending/out-of-sync (or partially synced) live rows to one system at a time. Detail page has the same split. Calls `admin.publish_global_template(..., p_target)` → `public.sync_global_template_node(..., p_target)` (Admin **`v175`**, monorepo **`v778`**). Downstream badge: Synced / Partial / Out of sync / Not synced.
4. **Archive** — Removes the template from the publishable set.

### List pagination

The table and card views show **25 rows per page** with Previous/Next. A library of ~51 templates (50 industry plans + fields) spans multiple pages — use the pager (or search) to reach every industry; the first page alone is not the full catalog.

### Bootstrap import (not the steady-state parent)

If industries were seeded only into `public.pmo_industry_templates` (e.g. monorepo `v772b`), a one-time **Import missing from Platform (bootstrap only)** appears when the status RPC reports a gap. That fills this library so Admin remains parent going forward. Do **not** treat Platform as the ongoing source of truth.

## SQL apply order

**Monorepo first:** `v764` → `v764b` → `v764c` → `v764d` → `v765` → `v766` → **`v771`** → **`v773`** → **`v774`** (and industry seeds / `v772` / `v772b` as needed)  
**Then Admin:** `v160` → `v161` → `v162` → `v163` → `v164` → `v165` → `v165b` → **`v166`** → **`v167`** (bulk industry_plan populate + publish) → **`v168`** (sidebar reorg)

Bulk populate (`v167`) copies every active `public.pmo_industry_templates` row into `admin.global_template_library` (`domain=industry_plan`, category `international best practice`) and calls `admin.publish_global_template` for each unsynced row. Re-run safe: skips existing `industry_code` values; also publishes Project Charter Core Fields if not yet synced.

**v772b industries (31–50)** (e.g. Insurance & Underwriting Transformation):

1. Apply monorepo `SQL/v772b_seed/batches/*.sql` (pointer file does **not** insert data).
2. Apply Admin **`SQL/v170_sync_industry_plans_from_catalog_rpc.sql`** (auto-syncs missing rows on apply), **or** use the list banner **Import missing from Platform (bootstrap only)** when a gap remains.
3. Going forward: author in Global Template Library → **Publish to Platform** and/or **Publish to Simulator**.

v772b alone never updates Admin — the library table is separate from `public.pmo_industry_templates`. After bootstrap, Admin is parent.

## Permissions

| Key | Purpose |
|-----|---------|
| `content.global_templates.view` | List / detail |
| `content.global_templates.edit` | Create / update / archive |
| `content.global_templates.publish` | Publish & sync |

## Related

- Monorepo roadmap: `E:\project-nidus\projectplan\v772_industry_template_springboard_content_plan.md` (Phase 2)
- Monorepo sync RPC: `E:\project-nidus\SQL\v773_global_industry_template_sync.sql`
- Admin plan: `projectplans/v166_global_industry_template_authoring_plan.md`
- Architecture: `E:\project-nidus\Documentation\PM_Template_Hierarchy_Guide.md`
