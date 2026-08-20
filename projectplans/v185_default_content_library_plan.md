# v185 — Default Content Library: capture actual field data for downstream PMO/PM use

**Repo:** `E:\project-nidus-admin` (Admin app, `content` module)
**Companion plan (cross-repo, required for the data to actually reach a real PM):** `E:\project-nidus\projectplan\v782_form_template_sample_fallback_plan.md`
**Related but distinct:** `E:\project-nidus\projectplan\v783_pm_hierarchy_creation_time_inheritance_plan.md` — covers the separate Global→PMO→Portfolio/Programme/Project tier inheritance system (`pm_template_nodes`, LDE local fields). This plan is Form Template field content only; v783 is the Portfolio/Programme/Project hierarchy from your diagram.
**Status:** ✅ Complete

## Important correction to the starting premise

You said "there is no functionality to capture the actual data" — that's **partially already fixed**, and worth knowing before scoping this further:

- Earlier this session, `FormTemplatePayloadEditor.jsx` gained `sample` (and already had `help`) per field — an admin *can* already type actual example/starter content per field, for Form Templates only. It's stored in the template's own schema (`payload.schema.sections[].fields[].sample`/`.help`), editable via the Form Layout table's Sample/Guidance columns.
- Admin already has a **curated seed mechanism** for this too: `SQL/v179_global_form_template_curated_guidance_seed.sql` hand-writes `help`/`sample` into every Form Template's schema (329 lines of curated content for F001–F068).

**The actual, still-open gap** (confirmed by tracing the real flow): Platform's `FormNew.jsx` — where a real PM starts a new form on a real project — pre-fills field values from `buildDefaultValuesMap(orgDefaultRows, schema)`, which reads **only** the organisation-level `form_template_field_defaults` table. It never falls back to the admin-authored `schema.field.sample`. So today, admin-curated sample content **never reaches a real PM** unless that PM's own organisation has separately, manually set its own org-level default for that exact field via Platform's own "Default Content" tab. That's the literal "captured but not copied downstream" gap — see the companion plan (Part 1) for the fix.

This plan (Part 2) is what you explicitly asked for: a **dedicated Admin UI** for authoring this content, instead of it only existing via hand-written SQL (v179) or buried inside each template's field editor.

## Domain coverage — what needs this and what doesn't

Checked each editor's actual data shape rather than assuming:

| Domain | Data shape | Has `sample`/`help` today? | Needs this plan? |
|---|---|---|---|
| `form_template` | `sections[].fields[]` — schema vs. value split | ✅ Yes (built this session) | UI only — schema already supports it |
| `opa` | **Flat metadata** (`title`, `description`, `opa_type`, `version`, `status`, `notes`) — no field list at all (`OpaPayloadEditor.jsx:77-87`) | N/A — no fields to attach a sample to | **Not in scope** — same situation as Industry Plan: `description`/`notes` already *are* the content, there's no separate structure/value split to fill in |
| `process_template` | Per-document-type field lists **do** exist (e.g. `wbs_level_guidance`, `contingency_guidance`, `acceptance_criteria`) — confirm exact shape at implementation time | Partial/ad-hoc — needs a closer look before committing to a design | Likely yes, pending that closer look |
| `industry_plan` | `phase_description`/`activity_description`/etc. **are** the actual content already | N/A | **Not in scope** — flagging in case you want a *separate* "guidance for adapting this" layer on top of the description — that would be new, not this gap — say so if wanted |

So Part A narrows to **Process Template only** — OPA drops out entirely (it's flat content already, nothing to seed).

## Part A — Extend `sample`/`help` to Process Template (only)

- [x] Read `ProcessTemplatePayloadEditor.jsx`'s full field-list shape per document type before designing — the existing `wbs_level_guidance`/`contingency_guidance`/`acceptance_criteria` fields suggest guidance is currently modelled as **separate named fields**, not a generic `help` attached to each field. Reconcile rather than duplicate: decide whether to (a) keep those as-is (they already serve the "help" purpose, just per-field-named instead of generic) and only add a generic `sample` attribute, or (b) migrate them into a generic `sample`/`help` pair matching Form Template exactly. Recommend (a) — less churn, these fields already work and are presumably already populated for existing templates.
- [x] **Decision: option (a)** — keep named `document_data` fields. `normalizeProcessTemplatePayload` seeds empty known catalog keys so editors always show the full field set. Coverage catalog mirrored in `packages/shared/src/defaultContentCoverage.js`.

## Part B — New "Default Content" sidebar section

New sidebar group under **Global Templates**, sibling to Library/Forms/Process Docs, registered in `packages/shared/src/defaultAdminNav.js` (same file, lines 236-274, that already defines Library/Forms/Process Docs). Same submenu shape as **Forms**: Initiating / Planning / Executing / Monitoring & Controlling / Closing / Agile.

- [x] New route `/content/default-content-library?category=<Category>` (`DefaultContentLibraryPage.jsx` + content module route).
- [x] **Coverage dashboard** for `form_template` and `process_template` — completion bar "X/Y fields" + avg summary cards; OPA / industry_plan excluded.
- [x] Click a template → Form Layout with `?focus=defaults` (table view, Sample + Guidance first); Process → existing process editor.
- [x] Reuse `ViewToggle` / AdminTable / card view / export menu — no second field editor.

## Seed data (per rule 18.2)

- [x] `SQL/v183_process_template_curated_sample_seed.sql` — curated `document_data` content for all v176 process `seed_key`s (idempotent; fills empty/placeholder only).
- [x] Register nothing new in `database_tables` — JSONB-payload only.
- [x] Coverage-dashboard demo data: none — reads existing `global_template_library` rows.

## Testing

- [x] Process catalog / coverage unit tests (`defaultContentCoverage.test.js`); normalize seeds known keys (option A — no generic sample/help round-trip).
- [x] Unit test for coverage-completion calculation (form + process).
- [x] Nav test for Default Content group; manual path: seed → dashboard → Author content deep-link.

## Review

**Completed 2026-07-20.**

### Admin (`project-nidus-admin`)
- `packages/shared/src/defaultContentCoverage.js` — process field catalog + coverage helpers + edit deep-link paths.
- `modules/content/src/pages/DefaultContentLibraryPage.jsx` — coverage dashboard (table/card, filters, export, theme-aware).
- Route + **Default Content** nav group under Global Templates.
- Form editor `focus=defaults` → table view with Sample/Guidance columns first.
- Process `normalizeProcessTemplatePayload` seeds empty catalog keys (option A).
- `SQL/v183_process_template_curated_sample_seed.sql` — full process seed set.
- Docs: `Documentation/Default_Content_Library_Guide.md`.

### Companion (monorepo v782)
- `buildDefaultValuesMap` / `buildGuidanceValuesMap` fall back to `field.sample` / `field.help` so Admin-curated content reaches PMs without org-level defaults.

### Out of scope (unchanged)
- OPA and industry_plan domains.
- Migrating process templates to a generic help/sample schema (option B).
