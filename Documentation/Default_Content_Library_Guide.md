# Default Content Library (Admin v185)

## Purpose

Admin authors **curated sample / guidance content** on Global Templates so Platform and Simulator PMs get useful starter values without each organisation hand-entering org-level defaults.

Companion monorepo plan: `E:\project-nidus\projectplan\v782_form_template_sample_fallback_plan.md` (runtime fallback from `schema.field.sample` / `field.help`).

## Where to find it

**Global Templates → Default Content** (by category, or **All coverage**).

Route: `/content/default-content-library?category=<Category>`

## What is covered

| Domain | Coverage metric | Authoring surface |
|--------|-----------------|-------------------|
| Form templates | Fields with non-empty `sample` | Form Layout table — Sample + Guidance columns (`?focus=defaults`) |
| Process templates | Named `document_data` catalog fields filled | Process template editor (option A — no generic help/sample schema) |
| OPA / Industry plan | Out of scope | Content already lives in description / plan rows |

## Workflow

1. Open **Default Content Library** and sort by coverage (lowest first).
2. Click **Author content**.
3. For **forms**: editor opens in table view with Sample/Guidance first — fill and Save, then Publish when ready.
4. For **process**: fill named guidance fields on the Process Template tab, Save, Publish.
5. Re-open the dashboard to confirm coverage %.

## Seed SQL

- Forms: existing `SQL/v179_global_form_template_curated_guidance_seed.sql`
- Process: `SQL/v183_process_template_curated_sample_seed.sql` (idempotent; only fills empty/placeholder fields)

## Downstream (Platform / Simulator)

New form instances call `buildDefaultValuesMap(orgRows, schema)` which:

1. Uses organisation `form_template_field_defaults` when present.
2. Otherwise falls back to Admin-curated `field.sample` (v782).

Guidance maps fall back to `field.help` the same way.
